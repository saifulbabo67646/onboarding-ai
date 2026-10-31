# Architecture

Onboarding AI is a monorepo of small packages. Each Python package works on its own and has its
own README and tests; the two apps glue them together.

```
 visitor's browser                        presenter worker (apps/agent)
┌────────────────────┐   LiveKit room    ┌───────────────────────────────────────────────┐
│ /d/<slug>          │◄──── audio ──────►│ STT (Deepgram) ──► Director ──► TTS (Eleven)  │
│  screen share view │◄── screen share ──│                      │  ▲                     │
│  live captions     │                   │          actions ────┘  └──── screenshots      │
└────────────────────┘                   │                 ▼        │                     │
          ▲                              │        ┌─────────────────────────┐            │
          │ join                         │        │ sandbox (one per call)  │── frames ──┘
 dashboard (apps/web) ── dispatch ──────►│        │ Xvfb + Chromium + XTEST │
  goals, links, transcripts ◄── events ──│        └─────────────────────────┘            │
          │                              └───────────────────────────────────────────────┘
          │ research jobs / refine
          ▼
 research service (packages/researcher) ── its own sandbox per job
```

## Components

| Component                                       | Role                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`packages/humanize`](../packages/humanize)     | Plans human-like input: mouse paths (noisy Fitts' law, minimum-jerk velocity, curved paths, tremor, overshoot), gestures (hover, circle, underline, wiggle, idle drift), typing cadence with corrected typos, scrolling. Pure Python, no dependencies. |
| [`packages/sandbox`](../packages/sandbox)       | A virtual desktop: `Xvfb` + Openbox + headful Chromium, OS-level input through XTEST shaped by `humanize`, screenshots and a live JPEG stream with the real cursor. HTTP API, async client and providers (`local`, `docker`, `static`).                |
| [`packages/director`](../packages/director)     | The presenting loop. Claude with the computer-use toolset plus presenter tools (`say`, `point_at`, `open_url`, `type_secret`, `listen`, `sketch`, `end_demo`). Platform-agnostic: it takes a brief, a computer and a narrator.                         |
| [`packages/researcher`](../packages/researcher) | Learns a product from its URL (docs, then hands-on exploration) and writes a playbook. Library, CLI (`onboard-researcher run`) and HTTP service (`onboard-researcher serve`).                                                                          |
| [`apps/agent`](../apps/agent)                   | LiveKit worker. Provisions a sandbox per session, publishes it as a screen share, connects Deepgram and ElevenLabs, feeds visitor speech to the director and reports events back to the web app.                                                       |
| [`apps/web`](../apps/web)                       | Next.js 15 dashboard and public pages. Postgres via Drizzle, Better Auth (email/password, Google, workspaces), share pages `/d/<slug>`, the embed widget, transcripts, and the research review UI.                                                     |

## Data model

Postgres holds two groups of tables (`apps/web/lib/server/db/`):

- Better Auth tables (`auth-schema.ts`): users, sessions, accounts, organizations (workspaces),
  members and invitations.
- App tables (`app-schema.ts`): presenters, demo sessions, session events and research jobs. Each
  row belongs to a workspace and is deleted with it.

`apps/web/lib/server/store.ts` is the only code that reads or writes the app tables, and every
dashboard method takes the workspace id. Presenter secrets are encrypted with AES-256-GCM before
they are stored (`lib/server/secrets.ts`).

## A session's lifecycle

1. **Join.** A visitor opens `/d/<slug>` (or the embed widget) and enters a name. `POST
/api/demo/<slug>/join` checks that the presenter is published and has a goal, applies the
   per-IP and per-presenter limits, creates a `demo_session` row, creates a private LiveKit room
   (`demo-<slug>-<random>`) and dispatches the worker named `AGENT_NAME` into it. The dispatch
   metadata carries the brief (goal, preparation notes, mode, start URL, persona, time limit,
   whiteboard flag, secrets), the voice id and a callback URL. The visitor gets a 15-minute
   LiveKit token.
2. **Provision.** The worker reads the brief, reports `starting`, connects to the room and asks
   its sandbox provider for a desktop opened at the start URL. Google Slides links open in
   present view and Office files in the Office Online viewer.
3. **Screen share.** The worker publishes the desktop's frames as a screen-share track and
   starts the voice session: Deepgram STT in, ElevenLabs TTS out, Silero voice activity
   detection. There is no separate chat model; every visitor turn goes to the director.
4. **Present.** When the visitor joins, the worker reports `joined` and starts the director. The
   director sends screenshots to the model and runs tool calls while the response is still
   streaming, so speech and motion overlap. After a turn that changed the screen, a fresh
   screenshot is attached automatically.
5. **Listen.** Visitor speech is transcribed and passed to `director.hear()`. Short
   backchannels ("mhm", "ok") are ignored. Real words freeze the mouse and interrupt the current
   actions; the director answers and resumes. Breathing and noise don't count because an
   interruption needs recognised words (tunable, see [configuration](configuration.md#listening)).
6. **End.** The director calls `end_demo` after saying goodbye, hits the time limit, or the
   visitor leaves. The worker waits `HANG_UP_DELAY` seconds, deletes the room (which disconnects
   the visitor), releases the sandbox and reports `ended` plus a summary.

Throughout the call the worker posts `status`, `say` and `heard` (the transcript), `action`,
`summary` and `error` events
to `/api/sessions/<id>/events` with `Authorization: Bearer $AGENT_CALLBACK_SECRET`. The
dashboard shows them as the session transcript.

## The research pipeline

"Let AI prepare it" runs the researcher in three phases. Details are in
[ai-research.md](ai-research.md).

1. **Docs** - Claude with server-side web search and web fetch reads the product's public site
   and documentation.
2. **Explore** - Claude computer use in its own disposable sandbox signs in with the demo
   credentials (typed with `type_secret`, never shown to the model), maps the navigation and
   walks key workflows, recording findings with a `note` tool.
3. **Write** - a structured playbook: goal, audience, sections with verified UI paths, talking
   points, login steps, FAQ, glossary, things to avoid.

The web app starts a job with `POST /jobs` on the research service. The service posts progress and
the final draft back to `/api/research/<id>/events` (same bearer secret). The owner reviews the
draft, optionally asks for changes (`POST /refine`), and approves it. Approval copies the
rendered goal and preparation notes into the presenter.

## Sandbox providers

| `SANDBOX_PROVIDER` | What it does                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `local`            | Spawns an `onboard-sandbox` process with its own Xvfb display per session. Linux with Xvfb and Chromium.                     |
| `docker`           | Runs one `onboard-sandbox` container per session (`docker run --rm`), with a random bearer token, and removes it at the end. |
| `static`           | Reuses one running sandbox at `SANDBOX_URL`. One session at a time; useful for development.                                  |

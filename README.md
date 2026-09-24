# Onboarding AI

**Live product demos and presentations, given by an AI presenter that feels like a person.**

You give a presenter a **goal** ("demo our analytics dashboard to a prospect: log in, explain the
KPIs, build a report for last month and share it"). When someone opens the share link, the
presenter joins a video call, **shares its screen** and walks them through it - talking
naturally, moving a real mouse, typing with a human rhythm, opening tabs, pointing at what it is
explaining, and pausing to answer questions whenever it is interrupted.

No scripts, no click-paths, no knowledge base. The presenter looks at the screen and works it out,
the way a colleague would.

## What it can do

- **Product demos** - start from any web app URL, log in with stored secrets (typed, never
  revealed), and show the workflows the goal describes.
- **Slide presentations** - paste a public Google Slides link (or a `.pptx` / `.pdf` URL) and it
  presents slide by slide, explaining in its own words and pointing at charts and numbers.
- **Whiteboard explanations** - optionally opens Excalidraw and sketches boxes, arrows and
  labels while it explains an idea.
- **Human presence** - curved, Fitts'-law mouse motion with minimum-jerk velocity and small
  overshoots; typing at ~70 wpm with occasional corrected typos; the cursor rests on (or circles,
  or underlines) what is being talked about; the mouse freezes politely when the visitor speaks.
- **Interruptions** - visitors just talk. Short acknowledgements ("mhm", "ok") don't derail it;
  real questions stop the current action, get answered (on screen if useful), and the demo resumes.

## How it works

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
                                         └───────────────────────────────────────────────┘
```

1. The owner creates a presenter in the **dashboard** and shares its link.
2. A visitor opens the link and joins. The web app creates a private LiveKit room and dispatches
   the **worker** with the presenter's brief.
3. The worker provisions a **sandbox** - an isolated virtual desktop with a real, headful
   Chromium - and publishes it as its screen share.
4. The **director** (Claude with the computer-use toolset) sees screenshots, decides what to
   show and say, and drives the sandbox. Tool calls run *while the response is still
   streaming*, so speech and motion start early and overlap like a person talking while working.
5. Every mouse and keyboard action is injected as genuine OS input through XTEST, shaped by the
   **humanize** models. The cursor the audience sees is the real X cursor (arrow, hand, I-beam).

## Repository layout

Every piece is a standalone package with its own README, tests and license, so each can be used
(and open-sourced) on its own:

| Path | Package | What it is |
| --- | --- | --- |
| [`packages/humanize`](packages/humanize) | `onboard-humanize` | Pure-Python models of human pointing, gestures, typing and scrolling. Zero dependencies. |
| [`packages/sandbox`](packages/sandbox) | `onboard-sandbox` | Virtual desktop server (Xvfb + Chromium) with human-like XTEST input, screenshots and a live JPEG stream; async client; local/Docker/static provisioning. |
| [`packages/director`](packages/director) | `onboard-director` | The presenting loop: Claude computer use + narration, pointing, whiteboard sketching, secrets, listening and interruptions. Platform-agnostic. |
| [`apps/agent`](apps/agent) | `onboard-agent` | LiveKit worker that glues it together: voice in/out, screen share, per-session sandbox. |
| [`apps/web`](apps/web) | `onboard-web` | Next.js dashboard, public demo pages and the meeting room. |

## Quick start (local, Linux)

Requirements: Python 3.10+, Node 22 + pnpm, `Xvfb` and Chromium (or Chrome), and accounts for
[LiveKit](https://cloud.livekit.io), [Anthropic](https://console.anthropic.com),
[Deepgram](https://deepgram.com) and [ElevenLabs](https://elevenlabs.io).

```bash
cp .env.example .env            # fill in the keys; SANDBOX_PROVIDER=local
cp .env apps/web/.env.local

# Python side
python -m venv .venv && source .venv/bin/activate
pip install -e packages/humanize -e "packages/sandbox[server]" -e packages/director -e apps/agent
onboard-agent download-files    # VAD model
onboard-agent dev               # run the worker (reads .env)

# Web side (another terminal)
cd apps/web && pnpm install && pnpm dev
```

Open <http://localhost:3000/dashboard>, create a presenter, then open its share link in another
browser window and join.

### Try the presenter without a meeting

The director has a terminal mode: speech is printed, and you can type to "interrupt" it. Watch the
desktop at `<sandbox>/screenshot?cursor=1`.

```bash
onboard-director --goal "Show how to search for a book and add it to the wishlist" \
                 --url https://openlibrary.org
onboard-director --mode presentation --whiteboard \
                 --url "https://docs.google.com/presentation/d/<id>/edit" \
                 --goal "Present this deck to new students and take questions"
```

## Deploy with Docker

```bash
cp .env.example .env    # fill in keys; SANDBOX_PROVIDER is set to docker by compose
docker compose --profile build build
docker compose up -d
```

The worker starts one `onboard-sandbox` container per session on the `onboarding-ai` network and
removes it when the call ends. Scale the `agent` service horizontally; LiveKit load-balances
dispatches across workers.

## Configuration

| Variable | Used by | Purpose |
| --- | --- | --- |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | web, agent | Meetings |
| `ANTHROPIC_API_KEY` | agent | The director |
| `DIRECTOR_MODEL` / `DIRECTOR_EFFORT` | agent | Model (default `claude-opus-5`) and effort (default `medium`, a latency trade-off for live calls) |
| `DEEPGRAM_API_KEY`, `ELEVEN_API_KEY`, `ELEVEN_VOICE_ID` | agent | Speech-to-text and voice |
| `DASHBOARD_PASSWORD` | web | Owner login (dashboard is open when unset) |
| `AGENT_CALLBACK_SECRET` | web, agent | Authenticates transcript/status reports |
| `SANDBOX_PROVIDER` | agent | `local`, `docker` or `static` |
| `SANDBOX_SIZE` | agent, sandbox | Desktop resolution (default `1280x800`) |

## Safety notes

- Each session runs in its own disposable desktop. Nothing persists between visitors.
- Secrets are stored server-side, never sent to the model or the browser, and typed without
  typos. Use a dedicated demo account.
- The presenter is instructed to stay on the goal, avoid payment forms and destructive actions.
  Treat the demo account as something a curious visitor could see.

## License

Apache-2.0

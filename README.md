# Onboarding AI

**Live product demos and presentations, given by an AI presenter that feels like a person.**

https://github.com/user-attachments/assets/9064df34-06b9-416c-98bc-a5b2fd86e37c

It researches a real app, presents it live, takes a question mid-demo, and sketches on a
whiteboard. All real footage. This is the 80-second cut;
[watch the full 4-minute demo](https://github.com/saifulbabo67646/onboarding-ai/releases/download/v0.1.0/onboarding-ai-demo.mp4).

You give a presenter a **goal** ("demo our analytics dashboard to a prospect: log in, explain the
KPIs, build a report for last month and share it"). When someone opens the share link, the
presenter joins a video call, **shares its screen** and walks them through it - talking
naturally, moving a real mouse, typing with a human rhythm, pointing at what it is explaining,
and pausing to answer questions whenever it is interrupted.

No scripts, no click-paths. You don't even have to write the goal: give it your app's link and a
demo login, and it **learns the product on its own** - reads your docs, signs in, explores the
app - and drafts the demo for you to approve once.

[Getting started](docs/getting-started.md) · [Documentation](docs/README.md) ·
[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## Features

- **Learns your product by itself** - paste a URL and demo credentials. The researcher reads your
  public docs, explores the live app in a private sandbox, and drafts the goal and preparation
  notes. Ask for changes in plain language, approve, and every visitor gets that demo.
  [More](docs/ai-research.md)
- **Product demos** - starts from any web app URL, logs in with stored secrets (typed, never
  shown to the model), and shows the workflows the goal describes.
- **Slide presentations** - a public Google Slides link (or a `.pptx` / `.pdf` URL), presented
  slide by slide in its own words, pointing at charts and numbers.
- **Whiteboard** - optionally opens Excalidraw and sketches boxes, arrows and labels while it
  explains.
- **Human presence** - curved, Fitts'-law mouse motion with small overshoots, typing at ~70 wpm
  with corrected typos, the cursor resting on what is being discussed, and the mouse freezing
  when the visitor speaks.
- **Interruptions** - visitors just talk. "Mhm" and "ok" don't derail it; real questions stop the
  current action, get answered, and the demo resumes. Breathing and room noise don't count.
- **Share or embed** - every presenter has a share link and a one-line widget for your own site.
  [More](docs/embedding.md)
- **Workspaces** - email/password or Google sign-in, teams with roles, session history with full
  transcripts.

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

1. The owner creates a presenter in the **dashboard** - by writing a goal, or by letting the
   **researcher** draft it from a URL and a demo login - and shares its link.
2. A visitor opens the link. The web app creates a private LiveKit room and dispatches the
   **worker** with the presenter's brief.
3. The worker starts a **sandbox** - an isolated virtual desktop with a real Chromium - and
   publishes it as its screen share.
4. The **director** (Claude with the computer-use toolset) sees screenshots, decides what to show
   and say, and drives the sandbox. Tool calls run while the response is still streaming, so
   speech and motion overlap like a person talking while working.
5. Every mouse and keyboard action is real OS input through XTEST, shaped by the **humanize**
   models. The cursor the audience sees is the real X cursor.

Details: [architecture](docs/architecture.md).

## Quick start

You need keys for [LiveKit](https://cloud.livekit.io), [Anthropic](https://console.anthropic.com),
[Deepgram](https://deepgram.com) and [ElevenLabs](https://elevenlabs.io).

### Docker compose

```bash
cp .env.example .env                   # fill in the keys
docker compose --profile build build   # also builds the per-session sandbox image
docker compose up -d
```

Open <http://localhost:3000/signup>, create an account, create a presenter ("Let AI prepare it"
takes a URL and a demo login), approve the draft, then open its share link in another window and
join.

### Local development (Linux)

Requirements: Python 3.10+, Node 22 + pnpm, Postgres 14+, `Xvfb` and Chromium.

```bash
cp .env.example .env            # fill in the keys; SANDBOX_PROVIDER=local
cp .env apps/web/.env.local

python -m venv .venv && source .venv/bin/activate
pip install -e packages/humanize -e "packages/sandbox[server]" -e packages/director \
            -e packages/researcher -e apps/agent
onboard-agent download-files    # VAD model
onboard-agent dev               # the worker (reads .env)
onboard-researcher serve        # another terminal: drafts demos from a URL

# another terminal
docker run -d --name onboard-db -p 5432:5432 -e POSTGRES_USER=onboard \
  -e POSTGRES_PASSWORD=onboard -e POSTGRES_DB=onboard postgres:17-alpine
cd apps/web && pnpm install && pnpm dev   # applies migrations on start
```

On macOS, run the sandbox in Docker instead; see
[getting started](docs/getting-started.md#local-development-on-macos). The `Makefile` wraps the
common commands: `make help`.

## Repository layout

Every piece is a standalone package with its own README, tests and license:

| Path                                         | Package              | What it is                                                                                           |
| -------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| [`packages/humanize`](packages/humanize)     | `onboard-humanize`   | Pure-Python models of human pointing, gestures, typing and scrolling. Zero dependencies.             |
| [`packages/sandbox`](packages/sandbox)       | `onboard-sandbox`    | Virtual desktop server (Xvfb + Chromium) with human-like XTEST input, screenshots and a live stream. |
| [`packages/director`](packages/director)     | `onboard-director`   | The presenting loop: Claude computer use, narration, pointing, whiteboard, secrets, interruptions.   |
| [`packages/researcher`](packages/researcher) | `onboard-researcher` | Learns a product from a URL and writes the demo playbook. Library, CLI and HTTP service.             |
| [`apps/agent`](apps/agent)                   | `onboard-agent`      | LiveKit worker: voice in/out, screen share, per-session sandbox.                                     |
| [`apps/web`](apps/web)                       | `onboard-web`        | Next.js dashboard, public demo pages, embed widget and the meeting room.                             |
| [`scripts/probe_models.py`](scripts)         |                      | Checks whether another model can see screenshots and click accurately.                               |
| [`docs/`](docs)                              |                      | Guides and reference.                                                                                |

## Documentation

- [Getting started](docs/getting-started.md) - Docker compose, local development, first presenter
- [Architecture](docs/architecture.md) - components, data flow, a session's lifecycle
- [Configuration](docs/configuration.md) - every environment variable
- [Writing good goals](docs/writing-good-goals.md) - demos, presentations, whiteboard, notes
- [AI research](docs/ai-research.md) - how "Let AI prepare it" works
- [Embedding](docs/embedding.md) - the website widget
- [Models and providers](docs/models-and-providers.md) - Claude, other providers, cost
- [Deployment](docs/deployment.md) - production, scaling, backups
- [Troubleshooting and FAQ](docs/troubleshooting.md)

## Safety in brief

Each session runs in its own disposable desktop. Demo secrets are encrypted at rest and never
shown to the model or the browser. Dashboard data is scoped to a workspace. Nothing the AI drafts
reaches visitors until you approve it. Use a dedicated demo account, and treat anything it can see
as visible to visitors. Details and how to report a vulnerability: [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the setup and the checks CI
runs (`make install`, then `make check`), and follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Changes are tracked in [CHANGELOG.md](CHANGELOG.md).

## License

[Apache-2.0](LICENSE)

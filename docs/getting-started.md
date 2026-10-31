# Getting started

There are two ways to run Onboarding AI:

- **Docker compose** - the whole stack (dashboard, Postgres, presenter worker, research
  service) on one machine. Works on Linux and on macOS with Docker Desktop.
- **Local development** - each piece runs from source. The presenter's desktop
  (`SANDBOX_PROVIDER=local`) needs Linux with `Xvfb` and Chromium. On macOS, run the sandbox
  in Docker and point the worker at it (see [below](#local-development-on-macos)).

Either way you need accounts and keys for:

| Service                                    | Used for                               |
| ------------------------------------------ | -------------------------------------- |
| [LiveKit](https://cloud.livekit.io)        | The video call (Cloud or self-hosted)  |
| [Anthropic](https://console.anthropic.com) | The presenter and the researcher       |
| [Deepgram](https://deepgram.com)           | Speech-to-text (the visitor's voice)   |
| [ElevenLabs](https://elevenlabs.io)        | Text-to-speech (the presenter's voice) |
| [Resend](https://resend.com) (optional)    | Invitation and password-reset emails   |
| Google Cloud OAuth client (optional)       | "Continue with Google"                 |

## 1. Configure

```bash
cp .env.example .env
```

Fill in at least:

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVEN_API_KEY`
- `BETTER_AUTH_SECRET` and `SECRETS_ENCRYPTION_KEY` - generate each with
  `openssl rand -base64 32`
- `AGENT_CALLBACK_SECRET` and `RESEARCHER_TOKEN` - any long random strings

Read [configuration.md](configuration.md) for everything else. Keep a copy of
`SECRETS_ENCRYPTION_KEY` somewhere safe: stored demo passwords can't be decrypted without it.

## 2a. Run with Docker compose

```bash
docker compose --profile build build   # also builds the per-session sandbox image
docker compose up -d
```

Or with the Makefile: `make build` then `make up`.

Compose sets `SANDBOX_PROVIDER=docker`, `DATABASE_URL` and `RESEARCHER_URL` for you, so you can
leave those as they are in `.env`. The dashboard is on <http://localhost:3000>. Database
migrations run when the web container starts.

## 2b. Run locally (Linux)

Requirements: Python 3.10+ (CI uses 3.12), Node 22 and pnpm, Postgres 14+, `Xvfb` and Chromium
(or Chrome).

```bash
cp .env apps/web/.env.local     # the web app reads apps/web/.env.local

# Python side
python -m venv .venv && source .venv/bin/activate
pip install -e packages/humanize -e "packages/sandbox[server]" -e packages/director \
            -e packages/researcher -e apps/agent
onboard-agent download-files    # voice activity model, once
onboard-agent dev               # the presenter worker (reads .env)
onboard-researcher serve        # in another terminal: the research service on :8790

# Web side (another terminal). Any Postgres works; this is the quickest.
docker run -d --name onboard-db -p 5432:5432 -e POSTGRES_USER=onboard \
  -e POSTGRES_PASSWORD=onboard -e POSTGRES_DB=onboard postgres:17-alpine
cd apps/web && pnpm install && pnpm dev   # applies migrations on start
```

`make install` sets up the same Python packages (plus test extras) in `.venv` and installs the
web dependencies. `make dev-agent`, `make dev-researcher` and `make dev-web` start the three
processes.

### Local development on macOS

`SANDBOX_PROVIDER=local` starts `Xvfb` and Chromium on the host, which only works on Linux. On
macOS, run one sandbox container and use the `static` provider:

```bash
docker build -f packages/sandbox/Dockerfile -t onboard-sandbox .
docker run --rm -p 8765:8765 --shm-size=1g onboard-sandbox
```

Then set `SANDBOX_PROVIDER=static` and `SANDBOX_URL=http://127.0.0.1:8765` in `.env`. The
static provider reuses that one desktop, so only one session (or research job) at a time.

## 3. Create your first presenter

1. Open <http://localhost:3000/signup> and create an account. You get a personal workspace.
2. Create a presenter. Pick **Let AI prepare it** to give an app link, a demo login and
   optional hints - the researcher drafts the goal and preparation notes in 5-20 minutes. Or
   pick **Write it myself** and write the goal directly
   ([writing-good-goals.md](writing-good-goals.md)).
3. Review the draft, ask for changes if needed, and **Approve & publish**.
4. Open the presenter's share link (`/d/<slug>`) in another browser window, enter a name and
   join.

## Accounts and workspaces

- Sign in with **email and password**, or **Google** when `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` are set. Create an OAuth client of type _Web application_ in Google
  Cloud and add `<BETTER_AUTH_URL>/api/auth/callback/google` as an authorized redirect URI.
  Signing in with Google on an email that already has a password links the two.
- Everything (presenters, sessions, transcripts) belongs to a **workspace**. Each user starts with
  a personal one and can create more from the workspace switcher.
- **Owners** and **admins** invite people by email (Settings → Invite people), change roles and
  remove members; **members** create and edit presenters. Without an email provider the invite
  link is shown to copy and printed to the server log; set `RESEND_API_KEY` and `EMAIL_FROM` to
  send invitations and password-reset emails.
- Upgrading from the old JSON file store? `pnpm db:import-json --email you@company.com` (in
  `apps/web`) copies your presenters, and their share links, into your workspace.

## Try pieces without the full stack

Draft a demo from the command line (no dashboard needed):

```bash
onboard-researcher run --url https://app.example.com/login \
    --secret username=demo@example.com --secret password=... \
    --notes "Visitors are finance managers; focus on reporting" \
    --out draft.json
```

Run the presenter in your terminal without a meeting. Speech is printed and you type to
"interrupt". Watch the desktop at the printed `<sandbox>/screenshot?cursor=1` URL.

```bash
onboard-director --goal "Show how to search for a book and add it to the wishlist" \
                 --url https://openlibrary.org
onboard-director --mode presentation --whiteboard \
                 --url "https://docs.google.com/presentation/d/<id>/edit" \
                 --goal "Present this deck to new students and take questions"
```

`onboard-director` spawns a local sandbox (Linux) unless you pass `--sandbox <url>` of a running
one, and reads `ANTHROPIC_API_KEY` from the environment (it does not load `.env`). Both commands
call the Anthropic API and are billed like any other call.

## Next steps

- [Architecture](architecture.md) - how the pieces fit together
- [Deployment](deployment.md) - running it for real visitors
- [Troubleshooting](troubleshooting.md) - when something doesn't work

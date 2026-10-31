# Configuration

All configuration is through environment variables. Start from [`.env.example`](../.env.example)
at the repository root.

- **Docker compose** passes `.env` to the `web`, `agent` and `researcher` services and sets a few
  values itself: `DATABASE_URL`, `RESEARCHER_URL` and `AGENT_CALLBACK_BASE_URL` for `web`;
  `SANDBOX_PROVIDER=docker`, `SANDBOX_IMAGE` and `SANDBOX_DOCKER_NETWORK` for `agent` and
  `researcher`.
- **Local development**: the worker and the researcher load `.env` from the current directory
  (or a parent). The web app reads `apps/web/.env.local` (`cp .env apps/web/.env.local`), or
  start from [`apps/web/.env.example`](../apps/web/.env.example).

"Used by" names the process that reads the variable: `web` (dashboard), `agent` (presenter
worker), `researcher` (research service) and `sandbox` (the desktop server).

## Required

| Variable                                               | Used by                | Purpose                                                                                                                                                |
| ------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | web, agent             | LiveKit project (`wss://...`). Cloud or self-hosted.                                                                                                   |
| `ANTHROPIC_API_KEY`                                    | agent, researcher      | Claude for the presenter and the researcher.                                                                                                           |
| `DEEPGRAM_API_KEY`                                     | agent                  | Speech-to-text (Deepgram `nova-3`).                                                                                                                    |
| `ELEVEN_API_KEY`                                       | agent                  | Text-to-speech (ElevenLabs).                                                                                                                           |
| `DATABASE_URL`                                         | web                    | Postgres connection string.                                                                                                                            |
| `BETTER_AUTH_SECRET`                                   | web                    | Signs sign-in sessions. 32+ random characters: `openssl rand -base64 32`.                                                                              |
| `BETTER_AUTH_URL`                                      | web                    | Public URL of the dashboard, e.g. `http://localhost:3000`. Google redirects to `<this>/api/auth/callback/google`.                                      |
| `SECRETS_ENCRYPTION_KEY`                               | web                    | 32 bytes, base64 (`openssl rand -base64 32`). Encrypts presenter secrets at rest. Required in production. **Never change it** once secrets are stored. |
| `AGENT_CALLBACK_SECRET`                                | web, agent, researcher | Shared bearer secret for session and research reports. In production the web app rejects reports when it is unset.                                     |
| `RESEARCHER_TOKEN`                                     | web, researcher        | Shared bearer token for the research service. Its requests carry demo credentials, so always set it.                                                   |

Without `SECRETS_ENCRYPTION_KEY` outside production, the web app derives a development key from
`BETTER_AUTH_SECRET`. Changing either then makes stored secrets unreadable.

## Presenter model

| Variable             | Default           | Purpose                                                                                                                         |
| -------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `DIRECTOR_MODEL`     | `claude-opus-5-5` | Model for the live presenter.                                                                                                   |
| `DIRECTOR_EFFORT`    | `medium`          | `low`, `medium` or `high`. Lower means shorter pauses on the call.                                                              |
| `DIRECTOR_FALLBACKS` | `1`               | Server-side refusal fallbacks. `0` turns them off.                                                                              |
| `DIRECTOR_BASE_URL`  | unset             | Any Anthropic-compatible endpoint. See [models-and-providers.md](models-and-providers.md).                                      |
| `DIRECTOR_API_KEY`   | unset             | Key for that endpoint. Falls back to `ANTHROPIC_API_KEY` when unset.                                                            |
| `DIRECTOR_NATIVE`    | from model name   | `1` forces the full Claude feature set, `0` forces portable mode. Default: native only for `claude*` models without a base URL. |

## Voice

| Variable          | Default        | Purpose                                                                    |
| ----------------- | -------------- | -------------------------------------------------------------------------- |
| `ELEVEN_VOICE_ID` | plugin default | Default ElevenLabs voice. A presenter's **Voice ID** setting overrides it. |

## Listening

What counts as an interruption. The defaults ignore breathing and room noise: an interruption
needs recognised words.

| Variable                     | Default | Purpose                                                                                          |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `VAD_ACTIVATION_THRESHOLD`   | `0.6`   | Silero speech probability needed to start a speech segment. Raise to `0.7` if noise triggers it. |
| `VAD_MIN_SPEECH_DURATION`    | `0.15`  | Ignore sound bursts shorter than this (seconds).                                                 |
| `VAD_MIN_SILENCE_DURATION`   | `0.6`   | Silence (seconds) that ends the visitor's turn.                                                  |
| `INTERRUPT_MIN_WORDS`        | `1`     | Recognised words needed before the presenter stops talking. `2` ignores single words.            |
| `INTERRUPT_MIN_DURATION`     | `0.6`   | Speech (seconds) needed before the presenter stops talking.                                      |
| `FALSE_INTERRUPTION_TIMEOUT` | `1.5`   | Seconds after which a false interruption resumes the presenter's sentence.                       |
| `NOISE_CANCELLATION`         | `auto`  | `auto` (background voice cancellation on LiveKit Cloud, off elsewhere), `bvc`, `nc` or `off`.    |
| `HANG_UP_DELAY`              | `1.5`   | Seconds between the presenter's last word and closing the room.                                  |

## Worker and dashboard wiring

| Variable                  | Used by    | Default              | Purpose                                                                                   |
| ------------------------- | ---------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `AGENT_NAME`              | web, agent | `onboarding-agent`   | Name the web app dispatches and the worker registers. Must match on both sides.           |
| `AGENT_CALLBACK_BASE_URL` | web        | the request's origin | Base URL the worker and researcher use to reach the web app (compose: `http://web:3000`). |
| `PUBLIC_BASE_URL`         | web        | the request's host   | Public origin for share links, the embed snippet and email links.                         |

## Database

| Variable                | Default | Purpose                                                             |
| ----------------------- | ------- | ------------------------------------------------------------------- |
| `DATABASE_AUTO_MIGRATE` | `1`     | `0` skips migrations on start; then run `pnpm db:migrate` yourself. |
| `DATABASE_POOL_SIZE`    | `10`    | Max Postgres connections per web process.                           |

## Sign-in and email

| Variable                                   | Purpose                                                                                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional "Continue with Google". OAuth client of type _Web application_; redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google`.                            |
| `BETTER_AUTH_TRUSTED_ORIGINS`              | Optional comma-separated list of extra origins Better Auth accepts requests from.                                                                              |
| `RESEND_API_KEY`, `EMAIL_FROM`             | Optional. Send invitations and password resets through Resend. Without both, emails are printed to the server log and invite links are shown in the dashboard. |

## Abuse limits

Every join starts a paid AI session, so the public join endpoint is rate limited.

| Variable                                | Default | Purpose                                       |
| --------------------------------------- | ------- | --------------------------------------------- |
| `JOIN_LIMIT_PER_IP`                     | `6`     | Joins allowed from one IP address per window. |
| `JOIN_LIMIT_WINDOW_MINUTES`             | `10`    | Length of that window.                        |
| `MAX_CONCURRENT_SESSIONS_PER_PRESENTER` | `10`    | Live sessions one presenter may run at once.  |

## Research service

| Variable                                                         | Used by    | Default                 | Purpose                                                 |
| ---------------------------------------------------------------- | ---------- | ----------------------- | ------------------------------------------------------- |
| `RESEARCHER_URL`                                                 | web        | `http://127.0.0.1:8790` | Where the dashboard reaches `onboard-researcher serve`. |
| `RESEARCHER_MODEL`                                               | researcher | `claude-opus-5-5`       | Model for all research phases.                          |
| `RESEARCHER_EFFORT`                                              | researcher | `high`                  | Effort for docs research and writing.                   |
| `RESEARCHER_EXPLORE_EFFORT`                                      | researcher | `medium`                | Effort for hands-on exploration.                        |
| `RESEARCHER_EXPLORE_MINUTES`                                     | researcher | `15`                    | Soft time limit for exploration.                        |
| `RESEARCHER_EXPLORE`                                             | researcher | `1`                     | `0` disables exploration in the service (docs only).    |
| `RESEARCHER_MAX_JOBS`                                            | researcher | `2`                     | Concurrent jobs. Each holds a sandbox while exploring.  |
| `RESEARCHER_FALLBACKS`                                           | researcher | `1`                     | Server-side refusal fallbacks.                          |
| `RESEARCHER_BASE_URL`, `RESEARCHER_API_KEY`, `RESEARCHER_NATIVE` | researcher | unset                   | Same as the `DIRECTOR_*` equivalents.                   |
| `RESEARCHER_HOST`, `RESEARCHER_PORT`                             | researcher | `0.0.0.0`, `8790`       | Listen address of `onboard-researcher serve`.           |

## Sandbox provisioning

Read by the worker and the researcher when they need a desktop.

| Variable                 | Default                  | Purpose                                                                                                          |
| ------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `SANDBOX_PROVIDER`       | `local`                  | `local` (Xvfb + Chromium on this machine), `docker` (a container per session) or `static` (one running sandbox). |
| `SANDBOX_SIZE`           | `1280x800`               | Desktop resolution.                                                                                              |
| `SANDBOX_URL`            | `http://127.0.0.1:8765`  | `static` only: the running sandbox.                                                                              |
| `SANDBOX_TOKEN`          | unset                    | `static` only: its bearer token, if it has one.                                                                  |
| `SANDBOX_IMAGE`          | `onboard-sandbox:latest` | `docker` only: image to run.                                                                                     |
| `SANDBOX_DOCKER_NETWORK` | unset                    | `docker` only: network to attach containers to. Unset publishes a random port on `127.0.0.1`.                    |

## Sandbox server

Read by `onboard-sandbox` itself (each also has a command-line flag; see
`onboard-sandbox --help`).

| Variable                       | Default                  | Purpose                                                                                                      |
| ------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `SANDBOX_HOST`, `SANDBOX_PORT` | `0.0.0.0`, `8765`        | Listen address.                                                                                              |
| `SANDBOX_DISPLAY`              | `:99`                    | X display to start or attach to.                                                                             |
| `SANDBOX_SIZE`                 | `1280x800`               | Screen size.                                                                                                 |
| `SANDBOX_START_URL`            | unset                    | Page to open at startup.                                                                                     |
| `SANDBOX_TOKEN`                | unset                    | Require `Authorization: Bearer <token>` (except `/health`).                                                  |
| `SANDBOX_FPS`                  | `20`                     | Frame rate of the live JPEG stream.                                                                          |
| `SANDBOX_MOUSE_SPEED`          | `1.0`                    | Mouse speed multiplier.                                                                                      |
| `SANDBOX_WPM`                  | `70`                     | Typing speed.                                                                                                |
| `SANDBOX_TYPO_RATE`            | `0.015`                  | Share of keystrokes that become a corrected typo.                                                            |
| `CHROME_PATH`                  | auto                     | Chromium binary. Otherwise `chromium`, `chromium-browser`, `google-chrome` or a Playwright download is used. |
| `PLAYWRIGHT_BROWSERS_PATH`     | `~/.cache/ms-playwright` | Where to look for a Playwright Chromium.                                                                     |
| `CHROME_NO_SANDBOX`            | unset                    | `1` starts Chromium with `--no-sandbox` (also automatic as root). The sandbox image sets it.                 |

## Other

| Variable            | Used by                   | Purpose                                                           |
| ------------------- | ------------------------- | ----------------------------------------------------------------- |
| `LOG_LEVEL`         | Python processes          | Logging level, default `INFO`.                                    |
| `TEST_DATABASE_URL` | web tests                 | Throwaway Postgres for the store tests. Its tables are truncated. |
| `DATA_DIR`          | `pnpm db:import-json`     | Folder of the old JSON store (default `.data`).                   |
| `PROBE_BASE_URL`    | `scripts/probe_models.py` | Default for `--base-url`.                                         |

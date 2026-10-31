# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it reaches 1.0.

## [Unreleased]

### Added

- Community files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1),
  `SECURITY.md`, issue and pull request templates, `.editorconfig`.
- `docs/` with guides for getting started, architecture, configuration, writing goals, AI
  research, embedding, models and providers, deployment and troubleshooting.
- Root `Makefile` wrapping the CI, development and Docker compose commands.
- Root `.dockerignore`: builds no longer send `node_modules`, `.next`, `.venv` or `.git` to the
  Docker daemon, and local `.env` files can't end up in image layers.

### Changed

- README reorganised for newcomers; reference material moved into `docs/`.
- `.gitignore` ignores `.env.*` backups (keeping `.env.example` files), `.windsurf/`, and media
  under `media/` and `recordings/`.

## [0.1.0] - 2026-10-17

First version of Onboarding AI as a goal-driven live presenter. The repository started as a fork
of LiveKit's Meet example; that code was replaced in this release.

### Added

- **Presenter packages**, each standalone with its own tests and Apache-2.0 license:
  - `packages/humanize`: human-like mouse paths (Fitts' law, minimum-jerk velocity, curvature,
    tremor, overshoot), presenter gestures, typing cadence with corrected typos, scroll and click
    timing. No dependencies.
  - `packages/sandbox`: Xvfb + headful Chromium desktop with OS-level XTEST input, screenshots,
    a live JPEG stream with the real cursor, interrupt/pause/idle presence, an async client and
    `local`, `docker` and `static` per-session providers.
  - `packages/director`: Claude computer-use presenting loop with `say`, `point_at`, `open_url`,
    `type_secret`, `listen`, `sketch` and `end_demo`, tool execution while the response streams,
    interruptions with backchannel filtering, Google Slides and Office decks, Excalidraw
    sketching, server-side context editing and refusal fallbacks.
  - `packages/researcher`: learns a product from its URL (docs research, hands-on exploration in
    a sandbox) and writes a demo playbook. Library, CLI and HTTP service.
- **Presenter worker** (`apps/agent`): LiveKit worker that provisions a sandbox per session,
  publishes it as a screen share, uses Deepgram STT and ElevenLabs TTS, and reports session
  events to the dashboard. The presenter hangs up the call for everyone when the session ends.
- **Listening**: interruptions need recognised words, Silero VAD tuned to ignore breathing,
  false interruptions resume the sentence, LiveKit Cloud background voice cancellation by
  default. All thresholds configurable through environment variables.
- **Dashboard** (`apps/web`): SaaS dashboard on a shared design system with an overview, a
  presenters list, presenter pages (overview, sessions, settings), all sessions with filters,
  and transcripts.
- **Accounts and workspaces**: Postgres via Drizzle with migrations applied on start; Better
  Auth with email and password (and password reset) and optional Google sign-in; workspaces with
  owner, admin and member roles and email invitations.
- **Public demo pages** (`/d/<slug>`) and a website widget (`/embed.js`, `/embed/<slug>`) with a
  dashboard preview page.
- **"Let AI prepare it"**: research a product from its link, demo credentials and hints, then
  review, refine in plain language and approve the drafted goal and preparation notes.
- **Other models**: Anthropic-compatible providers in portable mode (`DIRECTOR_*` and
  `RESEARCHER_*` settings), and `scripts/probe_models.py` to check vision and click accuracy.
- Docker compose stack (web, Postgres, worker, researcher, sandbox image) and CI for the web app
  and the Python packages.
- `pnpm db:import-json` to move presenters from the earlier JSON file store into a workspace.

### Security

- Presenter secrets are encrypted at rest (AES-256-GCM), never sent to the browser or the model,
  and typed into the sandbox with `type_secret`.
- Every dashboard query is scoped to the active workspace.
- Public join links have per-IP and per-presenter concurrency limits.

### Fixed

- Demo room crash when the first live caption arrived.

[Unreleased]: https://github.com/saifulbabo67646/onboarding-ai/compare/759a934...HEAD
[0.1.0]: https://github.com/saifulbabo67646/onboarding-ai/tree/759a934

# Deployment

The repository ships a [`docker-compose.yml`](../docker-compose.yml) that runs the whole stack on
one Docker host. This page covers running it for real visitors.

## Services

| Service         | Image built from                 | Notes                                                                                          |
| --------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `web`           | `apps/web/Dockerfile`            | Next.js standalone server on port 3000. Applies migrations on start.                           |
| `postgres`      | `postgres:17-alpine`             | Data in the `postgres-data` volume. Not published to the host.                                 |
| `agent`         | `apps/agent/Dockerfile`          | Presenter worker. Mounts the Docker socket to start one sandbox container per session.         |
| `researcher`    | `packages/researcher/Dockerfile` | Research service on port 8790, reachable only inside the compose network.                      |
| `sandbox-image` | `packages/sandbox/Dockerfile`    | Build-only (profile `build`). Produces `onboard-sandbox:latest` for the worker and researcher. |

All services share the `onboarding-ai` network. Sandbox containers join it too
(`SANDBOX_DOCKER_NETWORK`), so the worker reaches each one by container name.

## First deploy

```bash
cp .env.example .env    # fill in keys; see configuration.md
docker compose --profile build build
docker compose up -d
```

In production, set at least:

- `BETTER_AUTH_URL` and `PUBLIC_BASE_URL` to the public HTTPS origin of the dashboard.
- `SECRETS_ENCRYPTION_KEY` (the web app refuses to store or read secrets without it when
  `NODE_ENV=production`, which the web image sets).
- `AGENT_CALLBACK_SECRET` (without it, session and research reports are rejected in production).
- `RESEARCHER_TOKEN`.
- `RESEND_API_KEY` and `EMAIL_FROM` if you want invitations and password resets by email.

## Updating

```bash
git pull
docker compose --profile build build   # rebuild every image, including the sandbox
docker compose up -d                   # recreate containers whose image changed
```

Migrations run when the new `web` container starts. If you skip the build step, the old images
keep running and you'll see the old UI.

## HTTPS and networking

- Put a reverse proxy (Caddy, nginx, a cloud load balancer) in front of `web:3000` and terminate
  TLS there. Browsers only allow the microphone on HTTPS pages, so visitors can't talk to the
  presenter over plain HTTP (except on `localhost`).
- The proxy should forward `X-Forwarded-For`, `X-Forwarded-Host` and `X-Forwarded-Proto`. The join
  rate limit uses the first `X-Forwarded-For` address (or `X-Real-IP`), and share links fall back
  to the forwarded host when `PUBLIC_BASE_URL` is unset. Don't let clients set
  `X-Forwarded-For` directly, or they can bypass the per-IP limit.
- Media goes through LiveKit, not through your server. Visitors' browsers and the worker both
  connect to `LIVEKIT_URL`. The worker needs outbound access to LiveKit, Anthropic, Deepgram and
  ElevenLabs.
- Sandbox containers need outbound internet access to load the product being demoed. A
  `localhost` URL in a presenter's start URL means the sandbox container itself, not your host.

## Keep the researcher private

Research requests carry the demo account's credentials in plain JSON.

- Compose doesn't publish port 8790. Keep it that way; only `web` needs to reach it.
- Always set `RESEARCHER_TOKEN`. The service logs a warning at start when it is missing.
- If you run it on another host, put it on a private network or a VPN and set `RESEARCHER_URL`
  accordingly.

## Scaling the presenter

- Every live session runs one sandbox container (Xvfb + Chromium, `--shm-size=1g`) on the
  worker's Docker host, plus a model stream, STT and TTS. Size the host by concurrent sessions.
- Scale the `agent` service horizontally, on one host (`docker compose up -d --scale agent=3`) or
  across hosts. LiveKit load-balances dispatches across workers registered under the same
  `AGENT_NAME`.
- On another host, a worker needs its own Docker daemon, the `onboard-sandbox` image, the same
  `.env` values for LiveKit, the model, voice and `AGENT_CALLBACK_SECRET`, and a way to reach the
  web app for reports (set `AGENT_CALLBACK_BASE_URL` on `web` to an address every worker can
  reach).
- Each research job also holds a sandbox while exploring. `RESEARCHER_MAX_JOBS` (default 2)
  limits that.
- `MAX_CONCURRENT_SESSIONS_PER_PRESENTER` caps sessions per presenter; set it to what your
  workers can carry.

## The Docker socket

The `agent` and `researcher` containers mount `/var/run/docker.sock` to start sandbox containers.
Access to the Docker socket is equivalent to root on the host. Run the stack on a host dedicated
to it, and don't expose those containers to anything but the services that need them. See
[SECURITY.md](../SECURITY.md).

## Backups

Everything durable is in Postgres: users, workspaces, presenters (including encrypted secrets),
sessions, transcripts and research drafts. Back it up regularly, for example:

```bash
docker compose exec -T postgres pg_dump -U onboard -d onboard -Fc > onboard-$(date +%F).dump
```

Restore into an empty database with `pg_restore`.

## `SECRETS_ENCRYPTION_KEY` must never change

Presenter secrets are encrypted with AES-256-GCM using `SECRETS_ENCRYPTION_KEY`. The key is not
stored in the database.

- Back up the key separately from the database dump. A dump without its key has unreadable
  secrets; a key next to its dump defeats the encryption.
- If the key changes or is lost, every stored secret becomes undecryptable. Secrets are
  decrypted whenever a presenter is loaded, so any presenter with secrets then fails to load:
  its dashboard pages and its share link return errors. There is no rotation command. Set the
  old key back; without it, the affected presenters' `secrets` column has to be cleared in the
  database before they can be edited again.
- Outside production, an unset key is derived from `BETTER_AUTH_SECRET`. Set an explicit key
  before you store anything you care about.

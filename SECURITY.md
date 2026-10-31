# Security policy

## Reporting a vulnerability

Please report vulnerabilities **privately** through GitHub Security Advisories:
[Report a vulnerability](https://github.com/saifulbabo67646/onboarding-ai/security/advisories/new)
(repository **Security** tab → **Report a vulnerability**).

Don't open a public issue, pull request or discussion for a vulnerability. Include what you
found, how to reproduce it, which component it affects and what an attacker could do with it.
You'll get an acknowledgement in the advisory thread, and we'll agree on a fix and a disclosure
date there. Credit is given in the advisory unless you prefer otherwise.

## Supported versions

The project is pre-1.0. Security fixes go to the `main` branch; there are no maintained release
branches yet.

## Sensitive surfaces

This is what an attacker would aim for, and how the code handles it today. Reports that break
any of these assumptions are especially welcome.

### Demo credentials (presenter secrets)

- Secrets are encrypted at rest with AES-256-GCM (`apps/web/lib/server/secrets.ts`). The key,
  `SECRETS_ENCRYPTION_KEY`, lives outside the database. Without it in development, a key is
  derived from `BETTER_AUTH_SECRET`; in production the web app refuses to encrypt or decrypt
  secrets without it.
- Values are never sent back to the browser: the dashboard receives secret names only and
  secrets are write-only through the API.
- To present, the decrypted values travel in the LiveKit dispatch metadata to the worker, and in
  research requests to the research service. They pass through your LiveKit project and your
  internal network in plaintext JSON (over TLS to LiveKit).
- The model never receives values. It calls `type_secret` with a name and the sandbox types the
  value. A value typed into a visible field (a username, or a password field that shows its
  text) does appear on the shared screen and in screenshots sent to the model.
- Research drafts are scrubbed for leaked secret values before they leave the service.
- Treat the demo account as public. Anything it can see, a visitor can ask to see.

### Research service

- `onboard-researcher serve` accepts jobs that contain demo credentials. Every endpoint except
  `/health` requires `Authorization: Bearer $RESEARCHER_TOKEN` when the token is set. When it is
  not set, the service accepts requests from anyone who can reach the port and logs a warning.
- Docker compose does not publish its port. Keep it on a private network.

### Callbacks from the worker and researcher

- Session and research events are posted to the web app with
  `Authorization: Bearer $AGENT_CALLBACK_SECRET`, compared in constant time.
- If the secret is unset, the web app rejects callbacks in production but **accepts them from
  anyone outside production**. Always set it on deployed instances.

### Public join links and the widget

- `/d/<slug>`, `/embed/<slug>` and `POST /api/demo/<slug>/join` need no account. Every join
  starts a paid AI session (model, speech-to-text, text-to-speech).
- Limits: `JOIN_LIMIT_PER_IP` joins per `JOIN_LIMIT_WINDOW_MINUTES` per client IP (stored as a
  salted hash, never raw) and `MAX_CONCURRENT_SESSIONS_PER_PRESENTER` live sessions per
  presenter. The client IP comes from `X-Forwarded-For` (first entry) or `X-Real-IP`, so the
  per-IP limit is only as trustworthy as the proxy that sets those headers.
- Visitor LiveKit tokens are scoped to one room and expire after 15 minutes.
- The public page exposes only the presenter's name, description, mode, presenter name and
  company, never the goal, notes or secrets.

### What visitors can make the presenter do

- Visitors talk directly to the model, and the model drives a real browser signed in to the
  demo account. Web pages it opens can also contain text aimed at the model.
- The presenter is instructed to stay on the goal, never enter payment details and avoid
  destructive actions, and research is told to look but not change. These are instructions to a
  model, not enforced permissions. The demo account's own permissions are the real boundary.

### Sandbox isolation

- Each session (and each research job) gets its own desktop. With the `docker` provider that is
  a fresh `onboard-sandbox` container (`docker run --rm`), running as an unprivileged user,
  protected by a random per-session bearer token, and removed when the session ends. Nothing
  persists between visitors.
- Inside the container Chromium runs with `--no-sandbox` (`CHROME_NO_SANDBOX=1`); the container
  is the isolation boundary.
- Sandbox containers have outbound network access and, in the default compose setup, join the
  same `onboarding-ai` network as `web`, `postgres` and `researcher`. The browser inside a
  sandbox can therefore reach those services by name. The researcher requires its token and
  Postgres requires a password, but change the compose defaults (`onboard`/`onboard`) on any
  deployed instance, and consider a separate network for sandboxes.
- The `local` provider runs Xvfb and Chromium as processes on the host, with no container
  isolation. Use it for development only.
- The `agent` and `researcher` containers mount the Docker socket to start sandboxes. Access to
  the socket is equivalent to root on the host.

### Accounts and workspaces

- Authentication is Better Auth (email and password, optional Google). Sessions are signed with
  `BETTER_AUTH_SECRET`.
- Every dashboard query is scoped to the active workspace on the server, and membership is
  checked on each request.

## Out of scope

- Behaviour of third-party services (LiveKit, Anthropic, Deepgram, ElevenLabs, Resend, Google).
- Attacks that require control of the host, the Docker daemon or the `.env` file.
- A visitor seeing data that the configured demo account is allowed to see.

# Troubleshooting and FAQ

Start with the logs: `docker compose logs -f web agent researcher` (or the terminals running
`pnpm dev`, `onboard-agent dev` and `onboard-researcher serve`). The session page in the
dashboard also shows `error` events reported by the worker.

## The presenter joins, then hangs up without saying anything

The first model request was rejected. The director doesn't retry rejected requests (only rate
limits, connection errors and server errors), so it ends the session. The worker logs
`model request rejected: ...` and the session transcript has an `error` event with the message.
Common causes:

- **Anthropic credit exhausted** - the error says your credit balance is too low. Add credits
  in the Anthropic console; nothing needs restarting.
- **Bad or missing key** - `ANTHROPIC_API_KEY` (or `DIRECTOR_API_KEY` with a custom base URL)
  is wrong, or not visible to the worker.
- **Unknown model** - `DIRECTOR_MODEL` names a model your account or provider doesn't serve.
- **Portable provider rejects the request** - see
  [models-and-providers.md](models-and-providers.md). Check the model with
  `scripts/probe_models.py` first.

## "Research failed" in the dashboard

The error text from the research service is shown with the failed job. The same API problems as
above (credit, key, model) apply; research uses `RESEARCHER_*` settings and
`ANTHROPIC_API_KEY`.

Other messages:

- **"The research service is not reachable. Check that it is running and RESEARCHER_URL is
  set."** - the web app can't connect. In compose, check `docker compose ps researcher`. Locally,
  start `onboard-researcher serve` and check `RESEARCHER_URL` (default
  `http://127.0.0.1:8790`).
- **"The research service refused the job (401)."** - `RESEARCHER_TOKEN` differs between `web`
  and `researcher`.
- **Warnings instead of errors** ("No sandbox is configured, so the app was not explored",
  "Could not read the documentation") - a phase was skipped, but a draft was still written.
  Check the sandbox setup below.

Research never finishes: job state lives in the service's memory. If the service restarted
mid-job, no more events arrive; after an hour without events the dashboard treats the job as
dead and you can start it again.

## Joining fails or nobody shows up

- **"We could not start the live demo right now."** - creating the LiveKit room or the dispatch
  failed. The web log has `failed to start demo session` with the cause. Check `LIVEKIT_URL`,
  `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in the web app's environment. The session is marked
  failed in the dashboard.
- **The room opens but the presenter never joins** - no worker picked up the dispatch. Check
  that the worker is running and connected to the same LiveKit project, and that `AGENT_NAME`
  is the same for `web` and `agent` (default `onboarding-agent`).
- **The presenter joins without a screen share** - the worker couldn't get a sandbox. See the
  sandbox section.
- **"Too many sessions started from your network."** (429) - the per-IP join limit
  (`JOIN_LIMIT_PER_IP` per `JOIN_LIMIT_WINDOW_MINUTES`). Behind a proxy that doesn't forward
  `X-Forwarded-For`, every visitor shares the proxy's address and hits it quickly.
- **"This presenter is busy with other visitors right now."** (503) -
  `MAX_CONCURRENT_SESSIONS_PER_PRESENTER` reached.
- **"This demo is not available."** - the presenter is paused or has no goal yet.

## Sessions have no transcript, or stay "connecting"

The worker reports events to the web app at `AGENT_CALLBACK_BASE_URL` (or the visitor's origin)
with `AGENT_CALLBACK_SECRET`.

- Both sides must have the same `AGENT_CALLBACK_SECRET`. In production the web app rejects
  reports when it is unset.
- The worker must be able to reach that URL. In compose it is `http://web:3000`. A worker on
  another host needs an address it can reach.

Sessions with no end event are shown as ended after two hours.

## Voice and interruptions

- **Breathing or background noise interrupts the presenter** - raise `VAD_ACTIVATION_THRESHOLD`
  (for example `0.7`) or set `INTERRUPT_MIN_WORDS=2`. On LiveKit Cloud, `NOISE_CANCELLATION=auto`
  uses background voice cancellation.
- **Noise cancellation on self-hosted LiveKit** - LiveKit's noise cancellation models only run on
  LiveKit Cloud. `auto` turns them off when `LIVEKIT_URL` isn't a `livekit.cloud` URL; don't set
  `bvc` or `nc` there.
- **The visitor's microphone doesn't work in the widget** - the page must be HTTPS, and the
  host site's `Permissions-Policy` must allow the microphone for the iframe. See
  [embedding.md](embedding.md#requirements).

## Sandbox problems

- **`SANDBOX_PROVIDER=local` fails on macOS** - it needs `Xvfb` and Chromium on a Linux host.
  Use Docker compose, or run one sandbox container and the `static` provider
  ([getting-started](getting-started.md#local-development-on-macos)).
- **`docker run -d failed: ...`** in the worker or researcher log - the sandbox image is missing
  (build it with `docker compose --profile build build`), or the Docker socket isn't mounted.
- **The presenter's browser can't load the product** - sandbox containers need outbound internet
  access. `localhost` in a start URL means the sandbox container itself, not your machine; use an
  address the container can reach.
- **Chromium won't start in a local sandbox** - on hosts that block user namespaces (for
  example recent Ubuntu), set `CHROME_NO_SANDBOX=1`. The sandbox image and CI already do.
- **Sandbox tests are skipped locally** - the integration test runs only when `Xvfb` and
  Chromium are installed.

## Database and migrations

- **`DATABASE_URL is not set`** - the web app needs it in its environment (locally in
  `apps/web/.env.local`).
- **Migrations** run on every start and are safe to repeat. With `DATABASE_AUTO_MIGRATE=0`, run
  `pnpm db:migrate` in `apps/web` before starting. After changing `app-schema.ts`, generate a new
  migration with `pnpm db:generate` and commit it.
- **Store tests are skipped** - they run only when `TEST_DATABASE_URL` points at a throwaway
  Postgres database (its tables are truncated). See [CONTRIBUTING.md](../CONTRIBUTING.md).
- **Presenters with secrets fail to load after a config change** - `SECRETS_ENCRYPTION_KEY` (or,
  without it in development, `BETTER_AUTH_SECRET`) changed. Restore the old value. See
  [deployment.md](deployment.md#secrets_encryption_key-must-never-change).

## The dashboard shows the old UI after an update

The containers still run the old images. Rebuild and recreate:

```bash
docker compose --profile build build
docker compose up -d
```

`docker compose up -d` alone doesn't rebuild. If the UI still looks old, hard-reload the browser
to drop cached assets.

## Sign-in

- **Google button missing** - set both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- **Google redirect error** - the OAuth client's redirect URI must be
  `<BETTER_AUTH_URL>/api/auth/callback/google`, and `BETTER_AUTH_URL` must be the URL you open
  the dashboard on.
- **No invitation or reset email** - without `RESEND_API_KEY` and `EMAIL_FROM` the email is
  printed to the web log, and invite links are shown in workspace settings.

## FAQ

**Does it work with models other than Claude?** Yes, through any Anthropic-compatible endpoint,
in portable mode. The model must accept images and point accurately. See
[models-and-providers.md](models-and-providers.md).

**Does the model see my demo password?** No. It sees secret names and types values with
`type_secret`; the sandbox fills in the value.

**Is anything kept between visitors?** No. Each session gets a new sandbox that is removed when
the call ends. Transcripts are stored in the dashboard.

**Can I self-host LiveKit?** Yes. Point `LIVEKIT_URL` at your server. Background voice
cancellation is not available there.

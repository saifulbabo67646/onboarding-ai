# Contributing

Thanks for helping improve Onboarding AI. This guide covers the development setup, the checks CI
runs, and how to send a change.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security
issues privately as described in [SECURITY.md](SECURITY.md), not in public issues.

## Where to start

- Read the [architecture overview](docs/architecture.md) and the README of the package you want
  to change. Each package is standalone, with its own tests.
- Look for open issues. Small, focused fixes (docs, error messages, tests) are a good first
  change.
- For a larger change (a new feature, a new provider, a schema change), open an issue first so
  we can agree on the approach.

Good places to start by area:

| Area                                 | Package               |
| ------------------------------------ | --------------------- |
| Mouse, typing and gesture realism    | `packages/humanize`   |
| Desktop, input, screenshots, streams | `packages/sandbox`    |
| Presenting behaviour and prompts     | `packages/director`   |
| Learning a product, playbooks        | `packages/researcher` |
| Voice, LiveKit, interruptions        | `apps/agent`          |
| Dashboard, auth, public pages        | `apps/web`            |

## Development setup

You need Python 3.10+ (CI uses 3.12), Node 22 and pnpm (the version in `apps/web/package.json`
`packageManager`), and Postgres 14+ for the web app's store tests. The sandbox integration test
also needs `Xvfb` and Chromium (Linux).

```bash
git clone https://github.com/saifulbabo67646/onboarding-ai.git
cd onboarding-ai
make install      # .venv with every Python package + test extras, and pnpm install in apps/web
```

`make install` runs the same commands as CI:

```bash
python3 -m venv .venv
.venv/bin/pip install -e packages/humanize -e "packages/sandbox[server,test]" \
  -e "packages/director[test]" -e "packages/researcher[test]" -e "apps/agent[test]"
cd apps/web && pnpm install --frozen-lockfile
```

To run the whole product locally, follow [docs/getting-started.md](docs/getting-started.md).

## Running the checks

Run `make check` before you open a pull request. It runs everything CI runs
(`.github/workflows/test.yaml`):

| Make target         | Command (as in CI)                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `make lint`         | `cd apps/web && pnpm lint`                                                                                                                                                          |
| `make format-check` | `cd apps/web && pnpm format:check`                                                                                                                                                  |
| `make typecheck`    | `cd apps/web && pnpm typecheck`                                                                                                                                                     |
| `make test-web`     | `cd apps/web && pnpm test`                                                                                                                                                          |
| `make test-python`  | `pytest -q` in each of `packages/humanize/tests`, `packages/sandbox/tests` (with `CHROME_NO_SANDBOX=1`), `packages/director/tests`, `packages/researcher/tests`, `apps/agent/tests` |

`make format` (`pnpm format:write`) fixes formatting in `apps/web`. Prettier checks `ts`, `tsx`,
`md`, `json` and `css` files under `apps/web`.

There is no Python linter or formatter configured in CI. Match the style of the surrounding
code.

The Python tests use fakes and don't call paid APIs. The sandbox integration test is skipped
unless `Xvfb` and Chromium are installed.

### Store tests and `TEST_DATABASE_URL`

`apps/web/test/store.test.ts` runs against a real Postgres and is skipped unless
`TEST_DATABASE_URL` is set. It applies migrations and **truncates the tables**, so point it at a
throwaway database, never your development data:

```bash
docker run -d --name onboard-test-db -p 5433:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=onboard_test postgres:17
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/onboard_test make test-web
```

CI uses `postgres://postgres:postgres@localhost:5432/onboard_test` with a `postgres:17` service.

### Database changes

Edit `apps/web/lib/server/db/app-schema.ts`, then generate a migration and commit it with the
change:

```bash
cd apps/web && pnpm db:generate
```

Migrations in `apps/web/drizzle/` run on start. Don't edit a migration that has been merged; add
a new one. Better Auth tables (`auth-schema.ts`) are generated with `pnpm auth:generate`.

## Making a change

- Keep pull requests focused: one fix or feature per PR.
- Add or update tests for behaviour changes.
- Update the docs (`README.md`, `docs/`, the package README) when you change behaviour,
  configuration or commands. New environment variables go in `.env.example` and
  [docs/configuration.md](docs/configuration.md).
- Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for user-visible changes.
- Never commit secrets, `.env` files, real customer data or recordings of real sessions.
- Changes that call paid APIs (Anthropic, Deepgram, ElevenLabs) can't be tested in CI. Describe
  how you tested them by hand in the PR.

### Commit messages

Follow the style of the existing history:

- A short summary in the imperative mood, capitalised, no trailing period, about 72 characters
  at most: "Let the presenter hang up the call when the session ends".
- A blank line, then a body that explains what changed and why, wrapped at about 72 columns.
  Lists are fine.

### Pull requests

- Branch from `main` and open the PR against `main`.
- Fill in the pull request template: what changed, why, and how you tested it.
- CI must pass. A maintainer reviews every PR; expect questions and small change requests.

## License

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE), the license of this project.

## What and why

<!-- What does this change, and why? Link the issue it addresses (e.g. "Fixes #123"). -->

## How it was tested

<!-- Commands you ran and what you checked by hand. Changes that call paid APIs
(Anthropic, Deepgram, ElevenLabs, LiveKit) can't run in CI: describe your manual test. -->

## Checklist

- [ ] `make check` passes (lint, format check, typecheck, web and Python tests)
- [ ] Tests added or updated for behaviour changes
- [ ] Docs updated (`README.md`, `docs/`, package README) if behaviour, commands or configuration changed
- [ ] New environment variables added to `.env.example` and `docs/configuration.md`
- [ ] Schema changes include a generated migration (`pnpm db:generate`)
- [ ] `CHANGELOG.md` updated under "Unreleased" for user-visible changes
- [ ] No secrets, `.env` files, customer data or session recordings included

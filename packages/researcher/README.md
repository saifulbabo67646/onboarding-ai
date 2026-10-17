# onboard-researcher

Teaches an AI presenter a product **without anyone writing instructions**. Give it a web app URL
(and demo credentials if the app needs a login); it learns the product the way a new hire would
and writes the demo plan an [`onboard-director`](../director) presenter follows.

```
 URL + demo login + optional hints
              │
              ▼
 1. Docs      Claude with web search + web fetch reads the site, docs, help center
              → research notes (features, workflows with documented steps, FAQ, terms)
              │
              ▼
 2. Explore   Claude computer use in a private sandbox: signs in (type_secret - values never
              reach the model), maps navigation, walks the key workflows, records findings
              with a `note` tool. Look, don't change: forms are opened, then cancelled.
              │
              ▼
 3. Write     Structured output → a Playbook: goal, audience, sections with verified UI
              paths, talking points, login steps, FAQ, glossary, things to avoid
              │
              ▼
 draft = { goal, knowledge, playbook }   → owner reviews once, refines in plain language
```

Phases degrade gracefully: if the docs can't be read the app is still explored, and without a
sandbox the playbook is written from the docs alone. Research fails only when nothing was learned.

## Use as a library

```python
from onboard_researcher import Researcher, ResearchRequest, PlaybookWriter
from onboard_sandbox import provider_from_env

request = ResearchRequest(
    url="https://app.example.com/login",
    secrets={"username": "demo@example.com", "password": "..."},
    notes="Visitors are finance managers; focus on reporting, skip admin settings.",
)
researcher = Researcher(request, provider=provider_from_env(), on_event=print)
result = await researcher.run()

result.playbook.render_goal()       # -> DemoBrief.goal
result.playbook.render_knowledge()  # -> DemoBrief.knowledge (the presenter's preparation notes)

# Follow-up changes, in plain language:
writer = PlaybookWriter(client=researcher.client, config=researcher.config)
shorter = await writer.refine(request, result.playbook, "Make it 10 minutes and skip billing")
```

Each phase is a separate class (`DocsResearcher`, `AppExplorer`, `PlaybookWriter`) so you can run,
replace or test them on their own.

## Command line

```bash
pip install -e ../humanize -e ../sandbox -e ../director -e .

onboard-researcher run --url https://app.example.com/login \
    --secret username=demo@example.com --secret password=... \
    --notes "Prospects are agencies; focus on client reporting" \
    --out draft.json
```

`--no-explore` skips the sandbox (docs only), `--sandbox http://127.0.0.1:8765` reuses a running
sandbox, `--docs-url` adds documentation start points. Command-line secrets are visible in the
process list; prefer the service (or the library) for real credentials.

## HTTP service (used by the dashboard)

```bash
RESEARCHER_TOKEN=... AGENT_CALLBACK_SECRET=... onboard-researcher serve --port 8790
```

| Endpoint | |
| --- | --- |
| `GET /health` | `{"ok", "running"}` (no auth) |
| `POST /jobs {"job_id", "request", "callback_url"}` | Start research in the background → `202` |
| `GET /jobs/{job_id}` | `{"state": "queued" \| "running" \| "done" \| "failed" \| "unknown"}` |
| `POST /refine {"request", "playbook", "instruction"}` | Revise a playbook → `{goal, knowledge, playbook}` |

Progress is posted to `callback_url` as `{"events": [...]}` with `Authorization: Bearer
$AGENT_CALLBACK_SECRET`: `status` (`researching` + `phase`, `drafted`, `failed`), `progress`,
`warning`, `draft` and `error`. Requests carry demo credentials: keep the service on a private
network and always set `RESEARCHER_TOKEN`.

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | | Claude |
| `RESEARCHER_MODEL` | `claude-opus-5-5` | Model for all phases |
| `RESEARCHER_EFFORT` / `RESEARCHER_EXPLORE_EFFORT` | `high` / `medium` | Reasoning effort for docs + writing / exploration |
| `RESEARCHER_EXPLORE_MINUTES` | `15` | Soft time limit for hands-on exploration |
| `RESEARCHER_FALLBACKS` | `1` | Server-side refusal fallbacks |
| `RESEARCHER_EXPLORE` | `1` | `0` disables exploration in the service |
| `RESEARCHER_MAX_JOBS` | `2` | Concurrent jobs (each holds a sandbox while exploring) |
| `SANDBOX_PROVIDER`, ... | `local` | Same as the presenter worker (see `onboard-sandbox`) |

## Other models

Set `RESEARCHER_BASE_URL`, `RESEARCHER_API_KEY` and `RESEARCHER_MODEL` to use any Anthropic-compatible
provider. Non-Claude models run in portable mode (see `onboard_director.backend`): exploration uses
the portable `computer` tool, documentation is read with a client-side `fetch_page` tool (no web
search; public addresses only) and the playbook JSON is requested in the prompt and validated.
Check the model first with `scripts/probe_models.py` in the repository root.

## Safety

- Secret values are typed into the sandbox and never sent to the model; drafts are scrubbed for
  any leaked value before they leave the service.
- Exploration runs in a disposable desktop and is told not to submit, delete, send, invite or pay
  unless the owner's notes allow creating sample data. Still: use a dedicated demo account.
- Web research only reads public pages.

## License

Apache-2.0

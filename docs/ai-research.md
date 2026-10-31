# AI research ("Let AI prepare it")

Instead of writing a goal yourself, you can give the presenter your app's link and a demo login.
The research service (`packages/researcher`) learns the product the way a new hire would and
drafts the goal and preparation notes. Nothing reaches visitors until you approve it.

## In the dashboard

1. Create a presenter and pick **Let AI prepare it**. Fill in:
   - **App link** - where the demo starts, usually the login page.
   - **Demo account** - username and password, only if the app needs a login. Use an account
     with demo data. These are saved as the presenter's secrets.
   - **Hints for the presenter** (optional) - who the audience is, what to focus on, what to
     skip, whether creating sample data is fine.
   - **Documentation link** (optional) - if your docs live somewhere the researcher might not
     find.
2. Research runs in the background and usually takes 5-20 minutes. You can leave the page; the
   progress and the draft are stored with the presenter.
3. Review the draft. It shows the demo title, a summary, any warnings, the goal and the
   preparation notes. You can edit both fields directly.
4. To change the plan, type a request under **Ask for changes** ("make it 10 minutes, skip
   billing, start with the mobile app") and click **Revise**. The AI rewrites the draft, which
   replaces your manual edits.
5. Click **Approve & publish** to copy the goal and notes into the presenter and accept
   visitors, or **Save without publishing** to keep it paused. **Research again** starts over.

Research is for product demos only. The research card appears on a presenter's overview page
while it has no goal yet, or once research has run for it; a product-demo presenter without a
goal can start research from there.

## The three phases

```
 URL + demo login + optional hints
              │
              ▼
 1. Docs      web search + web fetch over the site, docs and help center
              → research notes (features, documented workflows, FAQ, terms)
              ▼
 2. Explore   computer use in a private sandbox: sign in, map navigation, walk key
              workflows, record findings with a `note` tool
              ▼
 3. Write     structured output → playbook: goal, audience, sections with verified
              UI paths, talking points, login steps, FAQ, glossary, things to avoid
              ▼
 draft = { goal, knowledge, playbook }
```

Phases degrade gracefully. If the docs can't be read, the app is still explored. Without a
sandbox (or with `RESEARCHER_EXPLORE=0`), the playbook is written from the docs alone. Research
fails only when nothing was learned. Warnings from skipped phases are shown with the draft.

Exploration has a soft time limit (`RESEARCHER_EXPLORE_MINUTES`, default 15) and its own
effort setting (`RESEARCHER_EXPLORE_EFFORT`, default `medium`). Docs research and writing use
`RESEARCHER_EFFORT` (default `high`).

## Command line

```bash
onboard-researcher run --url https://app.example.com/login \
    --secret username=demo@example.com --secret password=... \
    --notes "Prospects are agencies; focus on client reporting" \
    --out draft.json
```

| Flag                        | Meaning                                                   |
| --------------------------- | --------------------------------------------------------- |
| `--url`                     | Product URL (required).                                   |
| `--product`                 | Product name, if the URL doesn't make it obvious.         |
| `--notes`                   | Audience, focus, things to avoid.                         |
| `--docs-url`                | Documentation start page (repeatable).                    |
| `--secret name=value`       | Demo credential (repeatable).                             |
| `--language`                | Default `English`.                                        |
| `--minutes`                 | Target demo length, default 20.                           |
| `--sandbox <url>`           | Use a running sandbox instead of `SANDBOX_PROVIDER`.      |
| `--no-docs`, `--no-explore` | Skip a phase.                                             |
| `--out <file>`              | Also write the draft (goal, knowledge, playbook) as JSON. |

It prints the goal and preparation notes. Command-line secrets are visible in the process list;
prefer the dashboard or the library for real credentials.

## Service API

`onboard-researcher serve` (port 8790 by default) is what the dashboard talks to. Every endpoint
except `/health` requires `Authorization: Bearer $RESEARCHER_TOKEN` when the token is set; the
service logs a warning at start when it isn't.

| Endpoint                                              | Result                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /health`                                         | `{"ok", "running"}` (no auth)                                            |
| `POST /jobs {"job_id", "request", "callback_url"}`    | Starts research in the background → `202`. `409` if that job is running. |
| `GET /jobs/{job_id}`                                  | `{"state": "queued" \| "running" \| "done" \| "failed" \| "unknown"}`    |
| `POST /refine {"request", "playbook", "instruction"}` | Revises a playbook → `{goal, knowledge, playbook}`. `422` on failure.    |

Progress goes to `callback_url` as `{"events": [...]}` with `Authorization: Bearer
$AGENT_CALLBACK_SECRET`: `status` (`queued`, `researching` with a `phase`, `drafted`, `failed`),
`progress`, `warning`, `draft` and `error`.

Job state lives in the service's memory. If it restarts mid-job, the dashboard stops waiting
after an hour without events and lets you start again. At most `RESEARCHER_MAX_JOBS` jobs run at
once; the rest queue.

## Safety

- **Secrets stay out of the model.** Credentials are typed into the sandbox with `type_secret`;
  the model only sees their names. Drafts are scrubbed for any leaked value before they leave
  the service.
- **Look, don't change.** Exploration is told not to submit, delete, send, invite or pay. Forms
  are opened and cancelled, unless your hints allow creating sample data. It still runs as the
  demo account, so use one that can't do real damage.
- **Disposable desktop.** Each job explores in its own sandbox, removed afterwards.
- **Public pages only.** Docs research reads public pages. In portable mode, the client-side
  `fetch_page` tool refuses private, loopback and link-local addresses.
- **Private service.** Requests carry demo credentials. Keep the service on a private network
  (compose doesn't publish its port) and always set `RESEARCHER_TOKEN`.
- **Owner approval.** Drafts are stored as drafts. Visitors only ever get what you approved.

## Cost

Research is a one-off job per presenter but uses many model calls (searches, page reads,
exploration screenshots). You can run it on a cheaper model than the live presenter; see
[models-and-providers.md](models-and-providers.md#cost).

# onboard-web

Next.js app with three surfaces:

- **Dashboard** (`/dashboard`, password-protected with `DASHBOARD_PASSWORD`) - create presenters:
  a goal, a start URL or slide deck link, persona, voice, time limit, whiteboard toggle and
  secrets. Each presenter gets a share link and a session history with transcripts.
- **Public demo page** (`/d/<slug>`) - a visitor enters their name and joins.
- **Meeting room** - the presenter's screen share on stage, a speaking indicator, the visitor's
  camera tile, live captions and mic/camera/leave controls.

API:

| Route                                                    |                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `GET/POST /api/agents`, `GET/PUT/DELETE /api/agents/:id` | Owner CRUD (secret values are write-only)                      |
| `POST /api/demo/:slug/join`                              | Creates a room, dispatches the worker, returns a visitor token |
| `POST /api/sessions/:id/events`                          | Worker reports (Bearer `AGENT_CALLBACK_SECRET`)                |

Storage is a JSON file (`DATA_DIR`, default `./.data`) behind the `Store` interface in
`lib/server/store.ts` - implement it to use a database.

```bash
cp .env.example .env.local
pnpm install
pnpm dev          # http://localhost:3000
pnpm test && pnpm lint && pnpm typecheck
```

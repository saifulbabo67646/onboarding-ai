# onboard-web

Next.js app with three surfaces:

- **Dashboard** (`/dashboard`, password-protected with `DASHBOARD_PASSWORD`) - an overview with
  live sessions, weekly stats and a sessions-per-day chart; presenters (each with overview,
  sessions and settings tabs: goal, start URL or slide deck, persona, voice, time limit,
  whiteboard, secrets); and all sessions with filters and full transcripts.
- **Public demo page** (`/d/<slug>`) - a visitor enters their name and joins.
- **Website widget** (`/embed.js`) - an Intercom-style launcher for the owner's own site:
  `<script src="https://HOST/embed.js" data-presenter="<slug>" async></script>`. It opens a
  compact join panel, expands to a large centred stage when the call goes live, and can be
  minimized without ending the call. Options: `data-label`, `data-color`, `data-position`,
  `data-name`, `data-open`; API: `OnboardAI.open({ name })`, `.close()`, `.toggle()`.
  The iframe page is `/embed/<slug>`; the dashboard shows the snippet and a preview page.
- **Meeting room** - the presenter's screen share on stage, a speaking indicator, the visitor's
  camera tile, live captions and mic/camera/leave controls.

API:

| Route                                                    |                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `GET/POST /api/agents`, `GET/PUT/DELETE /api/agents/:id` | Owner CRUD (secret values are write-only)                      |
| `POST /api/demo/:slug/join`                              | Creates a room, dispatches the worker, returns a visitor token |
| `POST /api/sessions/:id/events`                          | Worker reports (Bearer `AGENT_CALLBACK_SECRET`)                |

## Structure and design system

```
app/
  dashboard/(app)/      SaaS dashboard (sidebar shell): overview, presenters, sessions
  dashboard/preview/    widget preview (no shell - imitates the owner's website)
  d/[slug], embed/[slug]  visitor join page and the widget iframe
components/
  ui/       design system primitives - every screen is built from these
  app/      dashboard building blocks (AppShell, SessionsTable, PresenterForm, ...)
  live/     visitor experience (JoinDemo, DemoRoom)
  site/     public layouts (SiteNav, CenteredPage)
lib/        domain logic (agents, sessions/stats, formatting) and server code
styles/     tokens.css (colour, type, spacing, radius, motion) + globals.css (base, utilities)
```

Rules that keep the UI consistent:

- **Tokens only.** Colours, spacing, radii, font sizes and shadows come from `styles/tokens.css`;
  no hard-coded values in components.
- **Primitives first.** Buttons, cards, badges, fields, tables, tabs, empty states, page headers
  and stat tiles live in `components/ui` (exported from `components/ui/index.ts`). Pages compose
  them instead of styling raw elements.
- **One vocabulary for status.** `SessionStatusBadge`, `PresenterStatusBadge` and `ModeBadge`
  (`components/app/StatusBadges.tsx`) are used everywhere a status appears, backed by
  `lib/sessions.ts`.
- **Styles are scoped.** Each component has a CSS module; `globals.css` holds only the reset,
  base typography and a handful of layout utilities (`stack`, `row`, `grid-2`, ...).

Storage is a JSON file (`DATA_DIR`, default `./.data`) behind the `Store` interface in
`lib/server/store.ts` - implement it to use a database.

```bash
cp .env.example .env.local
pnpm install
pnpm dev          # http://localhost:3000
pnpm test && pnpm lint && pnpm typecheck
```

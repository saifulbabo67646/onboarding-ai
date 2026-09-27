import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from '@/components/TopBar';
import { authEnabled } from '@/lib/server/auth';
import { getStore } from '@/lib/server/store';

export const metadata: Metadata = { title: 'Presenters' };
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const store = getStore();
  const agents = await store.listAgents();
  const sessions = await store.listSessions(undefined, 500);
  const counts = new Map<string, number>();
  for (const s of sessions) counts.set(s.agentId, (counts.get(s.agentId) ?? 0) + 1);

  return (
    <>
      <TopBar owner />
      <main className="container">
        {!authEnabled() && (
          <p className="card faint" style={{ marginTop: 24, fontSize: 13.5 }}>
            The dashboard is open because <code>DASHBOARD_PASSWORD</code> is not set. Set it before
            deploying.
          </p>
        )}
        <div className="page-header">
          <div>
            <h1>Presenters</h1>
            <p className="muted" style={{ margin: '8px 0 0' }}>
              Each presenter has a goal and a share link. Anyone who opens the link gets a live,
              private session.
            </p>
          </div>
        </div>
        {agents.length === 0 ? (
          <div className="card empty stack" style={{ alignItems: 'center' }}>
            <h3>No presenters yet</h3>
            <p className="muted" style={{ margin: 0 }}>
              Create one for a product demo or a slide presentation.
            </p>
            <Link href="/dashboard/agents/new" className="btn btn-primary">
              Create a presenter
            </Link>
          </div>
        ) : (
          <div className="agent-list">
            {agents.map((agent) => (
              <Link
                key={agent.id}
                href={`/dashboard/agents/${agent.id}`}
                className="card agent-card"
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className={`badge ${agent.mode === 'presentation' ? '' : 'badge-muted'}`}>
                    {agent.mode === 'presentation' ? 'Slides' : 'Product demo'}
                  </span>
                  {agent.published ? (
                    <span className="badge badge-live">
                      <span className="dot" /> Live link
                    </span>
                  ) : (
                    <span className="badge badge-muted">Paused</span>
                  )}
                </div>
                <h3>{agent.name}</h3>
                <p>{agent.goal}</p>
                <span className="faint" style={{ fontSize: 12.5 }}>
                  {counts.get(agent.id) ?? 0} sessions · presented by {agent.presenterName}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

import { Plus, Presentation } from 'lucide-react';
import Link from 'next/link';
import { ModeBadge, PresenterStatusBadge } from '@/components/app/StatusBadges';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Table,
  tableStyles as t,
} from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { getStore } from '@/lib/server/store';
import { requireViewer } from '@/lib/server/viewer';

export const metadata = { title: 'Presenters' };

export default async function PresentersPage() {
  const { workspace } = await requireViewer();
  const store = getStore();
  const [agents, sessions] = await Promise.all([
    store.listAgents(workspace.id),
    store.listSessions(workspace.id, { limit: 1000 }),
  ]);
  const counts = new Map<string, { total: number; last?: string }>();
  for (const s of sessions) {
    const c = counts.get(s.agentId) ?? { total: 0 };
    c.total++;
    if (!c.last || s.startedAt > c.last) c.last = s.startedAt;
    counts.set(s.agentId, c);
  }

  return (
    <>
      <PageHeader
        title="Presenters"
        description="Each presenter has a goal, a share link and an embeddable widget."
        actions={
          <Button href="/dashboard/presenters/new" variant="primary" icon={Plus}>
            New presenter
          </Button>
        }
      />
      <Card padded={false}>
        {agents.length === 0 ? (
          <EmptyState
            icon={Presentation}
            title="No presenters yet"
            description="Create one for a product demo or a slide presentation."
            action={
              <Button href="/dashboard/presenters/new" variant="primary" icon={Plus}>
                New presenter
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th className={t.numeric}>Sessions</th>
                <th>Last session</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => {
                const c = counts.get(a.id);
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="row">
                        <Avatar name={a.presenterName} size="sm" brand />
                        <div>
                          <Link className={t.rowLink} href={`/dashboard/presenters/${a.id}`}>
                            {a.name}
                          </Link>
                          <div className="text-muted text-sm">Presented by {a.presenterName}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <ModeBadge mode={a.mode} />
                    </td>
                    <td>
                      <PresenterStatusBadge published={a.published} />
                    </td>
                    <td className={t.numeric}>{c?.total ?? 0}</td>
                    <td className={t.muted}>{c?.last ? formatRelative(c.last) : '—'}</td>
                    <td className={t.muted}>{formatRelative(a.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

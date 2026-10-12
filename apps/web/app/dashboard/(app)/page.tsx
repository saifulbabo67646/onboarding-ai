import { Clock, Plus, Presentation, Radio, Users } from 'lucide-react';
import Link from 'next/link';
import { SessionsTable } from '@/components/app/SessionsTable';
import { ModeBadge } from '@/components/app/StatusBadges';
import { BarChart, Button, Card, EmptyState, PageHeader, StatCard } from '@/components/ui';
import { formatDuration } from '@/lib/format';
import { getStore } from '@/lib/server/store';
import { requireViewer } from '@/lib/server/viewer';
import { overviewStats } from '@/lib/sessions';
import styles from './overview.module.css';

export const metadata = { title: 'Overview' };

export default async function OverviewPage() {
  const { workspace } = await requireViewer();
  const store = getStore();
  const [agents, sessions] = await Promise.all([
    store.listAgents(workspace.id),
    store.listSessions(workspace.id, { limit: 1000 }),
  ]);
  const stats = overviewStats(agents, sessions);
  const perAgent = new Map<string, number>();
  for (const s of sessions) perAgent.set(s.agentId, (perAgent.get(s.agentId) ?? 0) + 1);
  const topAgents = [...agents]
    .sort((a, b) => (perAgent.get(b.id) ?? 0) - (perAgent.get(a.id) ?? 0))
    .slice(0, 5);
  const weekDelta = stats.sessions7d - stats.sessionsPrev7d;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Live sessions, recent activity and how your presenters are doing."
        actions={
          <Button href="/dashboard/presenters/new" variant="primary" icon={Plus}>
            New presenter
          </Button>
        }
      />

      <div className="stack-lg">
        {agents.length === 0 ? (
          <Card>
            <EmptyState
              icon={Presentation}
              title="Create your first presenter"
              description="Give it a goal and a starting page or slide deck. Share its link or embed it on your site, and every visitor gets a live, private session."
              action={
                <Button href="/dashboard/presenters/new" variant="primary" icon={Plus}>
                  New presenter
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <div className={styles.stats}>
              <StatCard
                label="Presenters"
                value={stats.presenters}
                icon={Presentation}
                hint={`${stats.published} accepting visitors`}
              />
              <StatCard
                label="Live now"
                value={stats.liveNow}
                icon={Radio}
                hint="Sessions in progress"
              />
              <StatCard
                label="Sessions, last 7 days"
                value={stats.sessions7d}
                icon={Users}
                hint={
                  weekDelta === 0
                    ? 'Same as the week before'
                    : `${weekDelta > 0 ? '+' : ''}${weekDelta} vs the week before`
                }
              />
              <StatCard
                label="Average session"
                value={formatDuration(stats.avgDurationSec)}
                icon={Clock}
                hint="Completed sessions"
              />
            </div>

            <div className={styles.split}>
              <Card title="Sessions per day" description="Last 14 days">
                <BarChart
                  unit="sessions"
                  data={stats.daily.map((d) => {
                    const date = new Date(d.date);
                    return {
                      label: date.toLocaleDateString('en', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      }),
                      shortLabel: date.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
                      value: d.count,
                    };
                  })}
                />
              </Card>
              <Card
                title="Presenters"
                description="By number of sessions"
                actions={
                  <Button href="/dashboard/presenters" size="sm" variant="ghost">
                    View all
                  </Button>
                }
              >
                <ul className={styles.topList}>
                  {topAgents.map((a) => (
                    <li key={a.id}>
                      <Link href={`/dashboard/presenters/${a.id}`} className={styles.topName}>
                        {a.name}
                      </Link>
                      <ModeBadge mode={a.mode} />
                      <span className={styles.topCount}>{perAgent.get(a.id) ?? 0}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            <Card
              title="Recent sessions"
              padded={false}
              actions={
                <Button href="/dashboard/sessions" size="sm" variant="ghost">
                  View all
                </Button>
              }
            >
              <SessionsTable sessions={sessions.slice(0, 8)} agents={agents} />
            </Card>
          </>
        )}
      </div>
    </>
  );
}

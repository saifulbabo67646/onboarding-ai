import { FilterLinks } from '@/components/app/FilterLinks';
import { SessionsTable } from '@/components/app/SessionsTable';
import { Card, PageHeader } from '@/components/ui';
import { getStore } from '@/lib/server/store';
import { requireViewer } from '@/lib/server/viewer';
import { sessionStatus, type SessionStatus } from '@/lib/sessions';

export const metadata = { title: 'Sessions' };

const FILTERS: { key: string; label: string; match: (s: SessionStatus) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'live', label: 'Live', match: (s) => s === 'live' || s === 'connecting' },
  { key: 'ended', label: 'Ended', match: (s) => s === 'ended' },
  { key: 'failed', label: 'Failed', match: (s) => s === 'failed' },
];

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = 'all' } = await searchParams;
  const { workspace } = await requireViewer();
  const store = getStore();
  const [agents, sessions] = await Promise.all([
    store.listAgents(workspace.id),
    store.listSessions(workspace.id, { limit: 1000 }),
  ]);
  const statuses = sessions.map((s) => sessionStatus(s));
  const active = FILTERS.find((f) => f.key === status) ?? FILTERS[0];
  const visible = sessions.filter((_, i) => active.match(statuses[i]));

  return (
    <>
      <PageHeader
        title="Sessions"
        description="Every live demo and presentation, with transcripts of what was said and shown."
        actions={
          <FilterLinks
            options={FILTERS.map((f) => ({
              label: f.label,
              href: f.key === 'all' ? '/dashboard/sessions' : `/dashboard/sessions?status=${f.key}`,
              active: f.key === active.key,
              count: statuses.filter(f.match).length,
            }))}
          />
        }
      />
      <Card padded={false}>
        <SessionsTable
          sessions={visible}
          agents={agents}
          emptyHint={active.key === 'all' ? undefined : 'No sessions match this filter.'}
        />
      </Card>
    </>
  );
}

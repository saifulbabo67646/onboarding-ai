import { notFound } from 'next/navigation';
import { SessionStatusBadge } from '@/components/app/StatusBadges';
import { Transcript } from '@/components/app/Transcript';
import { Card, DescriptionList, PageHeader } from '@/components/ui';
import { formatDateTime, formatDuration } from '@/lib/format';
import { getStore } from '@/lib/server/store';
import { requireViewer } from '@/lib/server/viewer';
import { sessionDuration, sessionStatus } from '@/lib/sessions';
import styles from './session.module.css';

export const metadata = { title: 'Session' };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace } = await requireViewer();
  const store = getStore();
  const session = await store.getSession(workspace.id, id);
  if (!session) notFound();
  const agent = await store.getAgent(workspace.id, session.agentId);
  const presenterName = agent?.presenterName ?? 'Presenter';
  const status = sessionStatus(session);

  return (
    <>
      <PageHeader
        title={`Session with ${session.visitorName}`}
        meta={<SessionStatusBadge status={status} />}
        description={agent ? `${agent.name} · presented by ${presenterName}` : 'Presenter deleted'}
        breadcrumbs={[
          { label: 'Sessions', href: '/dashboard/sessions' },
          { label: session.visitorName },
        ]}
      />
      <div className={styles.layout}>
        <Card title="Transcript" description="What was said, with the presenter's notable actions.">
          <Transcript session={session} presenterName={presenterName} />
        </Card>
        <div className="stack">
          <Card title="Details">
            <DescriptionList
              items={[
                {
                  label: 'Presenter',
                  value: agent ? (
                    <a href={`/dashboard/presenters/${agent.id}`}>{agent.name}</a>
                  ) : (
                    '—'
                  ),
                },
                { label: 'Visitor', value: session.visitorName },
                { label: 'Started', value: formatDateTime(session.startedAt) },
                { label: 'Ended', value: session.endedAt ? formatDateTime(session.endedAt) : '—' },
                { label: 'Duration', value: formatDuration(sessionDuration(session)) },
              ]}
            />
          </Card>
          <Card title="Summary" description="Written by the presenter when the session ended.">
            <p className="text-secondary">{session.summary ?? 'No summary yet.'}</p>
          </Card>
        </div>
      </div>
    </>
  );
}

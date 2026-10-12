import { Radio } from 'lucide-react';
import Link from 'next/link';
import { Avatar, EmptyState, Table, tableStyles as t } from '@/components/ui';
import { formatDuration, formatRelative } from '@/lib/format';
import { sessionDuration, sessionStatus } from '@/lib/sessions';
import type { DemoAgent, DemoSession } from '@/lib/types';
import { SessionStatusBadge } from './StatusBadges';

/** The one sessions table, used on the overview, the sessions page and presenter pages. */
export function SessionsTable({
  sessions,
  agents,
  emptyHint = 'Share a presenter link and sessions will appear here.',
}: {
  sessions: DemoSession[];
  /** Pass to show a Presenter column. */
  agents?: DemoAgent[];
  emptyHint?: string;
}) {
  if (sessions.length === 0) {
    return <EmptyState icon={Radio} title="No sessions yet" description={emptyHint} />;
  }
  const byId = new Map(agents?.map((a) => [a.id, a]));
  return (
    <Table>
      <thead>
        <tr>
          <th>Visitor</th>
          {agents && <th>Presenter</th>}
          <th>Status</th>
          <th>Started</th>
          <th className={t.numeric}>Duration</th>
          <th className={t.numeric}>Messages</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((s) => (
          <tr key={s.id}>
            <td>
              <div className="row">
                <Avatar name={s.visitorName} size="sm" />
                <Link className={t.rowLink} href={`/dashboard/sessions/${s.id}`}>
                  {s.visitorName}
                </Link>
              </div>
            </td>
            {agents && (
              <td className={t.muted}>
                {byId.get(s.agentId) ? (
                  <Link href={`/dashboard/presenters/${s.agentId}`}>
                    {byId.get(s.agentId)!.name}
                  </Link>
                ) : (
                  'Deleted presenter'
                )}
              </td>
            )}
            <td>
              <SessionStatusBadge status={sessionStatus(s)} />
            </td>
            <td className={t.muted} title={new Date(s.startedAt).toLocaleString()}>
              {formatRelative(s.startedAt)}
            </td>
            <td className={`${t.numeric} ${t.muted}`}>{formatDuration(sessionDuration(s))}</td>
            <td className={`${t.numeric} ${t.muted}`}>{s.messageCount}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

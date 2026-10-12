import { SessionsTable } from '@/components/app/SessionsTable';
import { Card } from '@/components/ui';
import { getStore } from '@/lib/server/store';
import { requireViewer } from '@/lib/server/viewer';

export default async function PresenterSessions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace } = await requireViewer();
  const sessions = await getStore().listSessions(workspace.id, { agentId: id, limit: 1000 });
  return (
    <Card padded={false}>
      <SessionsTable sessions={sessions} />
    </Card>
  );
}

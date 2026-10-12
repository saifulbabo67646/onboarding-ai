import { SessionsTable } from '@/components/app/SessionsTable';
import { Card } from '@/components/ui';
import { getStore } from '@/lib/server/store';

export default async function PresenterSessions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessions = await getStore().listSessions(id, 1000);
  return (
    <Card padded={false}>
      <SessionsTable sessions={sessions} />
    </Card>
  );
}

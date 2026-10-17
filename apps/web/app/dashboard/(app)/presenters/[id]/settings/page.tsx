import { notFound } from 'next/navigation';
import { DeletePresenter } from '@/components/app/DeletePresenter';
import { PresenterForm } from '@/components/app/PresenterForm';
import { toOwnerView } from '@/lib/agents';
import { getStore } from '@/lib/server/store';
import { requireViewer } from '@/lib/server/viewer';

export default async function PresenterSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace } = await requireViewer();
  const agent = await getStore().getAgent(workspace.id, id);
  if (!agent) notFound();
  return (
    <div className="stack-lg content-narrow">
      {/* Remount when an approved AI draft changes the goal. */}
      <PresenterForm key={agent.updatedAt} initial={toOwnerView(agent)} />
      <DeletePresenter id={agent.id} name={agent.name} />
    </div>
  );
}

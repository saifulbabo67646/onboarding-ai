import { notFound } from 'next/navigation';
import { DeletePresenter } from '@/components/app/DeletePresenter';
import { PresenterForm } from '@/components/app/PresenterForm';
import { toOwnerView } from '@/lib/agents';
import { getStore } from '@/lib/server/store';

export default async function PresenterSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getStore().getAgent(id);
  if (!agent) notFound();
  return (
    <div className="stack-lg content-narrow">
      <PresenterForm initial={toOwnerView(agent)} />
      <DeletePresenter id={agent.id} name={agent.name} />
    </div>
  );
}

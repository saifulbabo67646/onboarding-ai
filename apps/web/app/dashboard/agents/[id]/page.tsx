import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AgentForm } from '@/components/AgentForm';
import { CopyLink } from '@/components/CopyLink';
import { ResearchPanel } from '@/components/ResearchPanel';
import { SessionList } from '@/components/SessionList';
import { TopBar } from '@/components/TopBar';
import { toOwnerView } from '@/lib/agents';
import { getStore } from '@/lib/server/store';
import { publicOrigin } from '@/lib/server/urls';

export const metadata: Metadata = { title: 'Presenter' };
export const dynamic = 'force-dynamic';

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const agent = await store.getAgent(id);
  if (!agent) notFound();
  const sessions = await store.listSessions(id, 25);
  const research = (await store.latestResearchJob(id)) ?? null;
  const shareUrl = `${await publicOrigin()}/d/${agent.slug}`;

  return (
    <>
      <TopBar owner />
      <main className="container" style={{ maxWidth: 820, paddingBottom: 64 }}>
        <div className="page-header">
          <div>
            <h1>{agent.name}</h1>
            <p className="muted" style={{ margin: '8px 0 0' }}>
              Share this link with a customer or student - each visitor gets their own live session.
            </p>
          </div>
        </div>
        <div className="stack">
          {agent.mode === 'product_demo' && (
            <ResearchPanel agentId={agent.id} initialJob={research} />
          )}
          <div className="card stack">
            <h3>Share link</h3>
            <CopyLink url={shareUrl} />
            {!agent.published && (
              <span className="faint" style={{ fontSize: 13 }}>
                Paused - visitors can&apos;t join until you publish.
              </span>
            )}
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Recent sessions</h3>
            <SessionList sessions={sessions} />
          </div>
          {/* Remount when the draft is applied so the form shows the new goal. */}
          <AgentForm key={agent.updatedAt} initial={toOwnerView(agent)} />
        </div>
      </main>
    </>
  );
}

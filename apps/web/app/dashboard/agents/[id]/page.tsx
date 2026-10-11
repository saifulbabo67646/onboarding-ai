import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AgentForm } from '@/components/AgentForm';
import { CopyLink } from '@/components/CopyLink';
import { EmbedSnippet } from '@/components/EmbedSnippet';
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
  const origin = await publicOrigin();
  const shareUrl = `${origin}/d/${agent.slug}`;
  const snippet = `<script src="${origin}/embed.js" data-presenter="${agent.slug}" async></script>`;

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
          <div className="card stack">
            <h3>Share link</h3>
            <CopyLink url={shareUrl} />
          </div>
          <div className="card stack">
            <div>
              <h3>Add to your website</h3>
              <p className="faint" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
                Paste this before <code>&lt;/body&gt;</code>. Visitors get a launcher in the bottom
                corner that opens a live session right on your page. Optional:{' '}
                <code>data-label</code>, <code>data-color</code>,{' '}
                <code>data-position=&quot;left&quot;</code>, <code>data-name</code> (prefill your
                signed-in user&apos;s name), or call <code>OnboardAI.open()</code> from your own
                button.
              </p>
            </div>
            <EmbedSnippet snippet={snippet} previewUrl={`/dashboard/agents/${agent.id}/widget`} />
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Recent sessions</h3>
            <SessionList sessions={sessions} />
          </div>
          <AgentForm initial={toOwnerView(agent)} />
        </div>
      </main>
    </>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { getStore } from '@/lib/server/store';

export const metadata: Metadata = { title: 'Widget preview' };
export const dynamic = 'force-dynamic';

/** A stand-in for the owner's website, with the widget installed exactly as in the snippet. */
export default async function WidgetPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getStore().getAgent(id);
  if (!agent) notFound();
  return (
    <div className="sample-site">
      <header>
        <strong>{agent.companyName || 'Your company'}</strong>
        <nav>
          <span>Product</span>
          <span>Pricing</span>
          <span>Docs</span>
        </nav>
      </header>
      <main>
        <h1>This is a sample page on your website</h1>
        <p>
          The launcher in the corner is the Onboarding AI widget, installed with the same snippet
          shown in the dashboard. Click it to start a live session with {agent.presenterName}.
        </p>
        {!agent.published && (
          <p className="error-text">
            This presenter is paused - enable &quot;Accept visitors&quot; to let people join.
          </p>
        )}
      </main>
      <Script src="/embed.js" data-presenter={agent.slug} strategy="afterInteractive" />
    </div>
  );
}

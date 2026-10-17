import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { Alert } from '@/components/ui';
import { getStore } from '@/lib/server/store';
import { requireViewer } from '@/lib/server/viewer';
import styles from './preview.module.css';

export const metadata: Metadata = { title: 'Widget preview' };
export const dynamic = 'force-dynamic';

/** A stand-in for the owner's website, with the widget installed exactly as in the snippet. */
export default async function WidgetPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace } = await requireViewer(`/dashboard/preview/${id}`);
  const agent = await getStore().getAgent(workspace.id, id);
  if (!agent) notFound();
  return (
    <div className={styles.site}>
      <div className={styles.banner}>
        Widget preview for <strong>{agent.name}</strong> - this page stands in for your website.
      </div>
      <header className={styles.header}>
        <strong>{agent.companyName || 'Your company'}</strong>
        <nav>
          <span>Product</span>
          <span>Pricing</span>
          <span>Docs</span>
        </nav>
      </header>
      <main className={styles.main}>
        <h1>Welcome to {agent.companyName || 'your website'}</h1>
        <p>
          The launcher in the corner is the Onboarding AI widget, installed with the snippet from
          your dashboard. Click it to start a live session with {agent.presenterName}.
        </p>
        {!agent.published && (
          <Alert tone="warning" title="This presenter is paused">
            Turn on &quot;Accept visitors&quot; in its settings to let people join.
          </Alert>
        )}
      </main>
      <Script src="/embed.js" data-presenter={agent.slug} strategy="afterInteractive" />
    </div>
  );
}

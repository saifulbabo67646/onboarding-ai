import { ExternalLink, MonitorSmartphone } from 'lucide-react';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ModeBadge, PresenterStatusBadge } from '@/components/app/StatusBadges';
import { Button, PageHeader, Tabs } from '@/components/ui';
import { getStore } from '@/lib/server/store';

/** Shared header and tabs for every page of one presenter. */
export default async function PresenterLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { id } = await params;
  const store = getStore();
  const agent = await store.getAgent(id);
  if (!agent) notFound();
  const sessions = await store.listSessions(id, 1000);
  const base = `/dashboard/presenters/${id}`;
  return (
    <>
      <PageHeader
        title={agent.name}
        meta={
          <>
            <ModeBadge mode={agent.mode} />
            <PresenterStatusBadge published={agent.published} />
          </>
        }
        description={`Presented by ${agent.presenterName}${agent.companyName ? ` for ${agent.companyName}` : ''}`}
        breadcrumbs={[
          { label: 'Presenters', href: '/dashboard/presenters' },
          { label: agent.name },
        ]}
        actions={
          <>
            <Button href={`/dashboard/preview/${id}`} external icon={MonitorSmartphone}>
              Preview widget
            </Button>
            <Button href={`/d/${agent.slug}`} external variant="primary" icon={ExternalLink}>
              Open demo page
            </Button>
          </>
        }
      />
      <Tabs
        tabs={[
          { label: 'Overview', href: base },
          { label: 'Sessions', href: `${base}/sessions`, count: sessions.length },
          { label: 'Settings', href: `${base}/settings` },
        ]}
      />
      {children}
    </>
  );
}

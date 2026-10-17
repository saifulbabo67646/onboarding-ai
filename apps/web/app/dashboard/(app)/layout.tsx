import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/AppShell';
import { requireViewer } from '@/lib/server/viewer';
import { getStore } from '@/lib/server/store';
import { sessionStatus } from '@/lib/sessions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { default: 'Dashboard', template: '%s · Onboarding AI' },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer();
  const sessions = await getStore().listSessions(viewer.workspace.id, { limit: 200 });
  const live = sessions.filter((s) => ['live', 'connecting'].includes(sessionStatus(s))).length;
  return (
    <AppShell viewer={viewer} liveCount={live}>
      {children}
    </AppShell>
  );
}

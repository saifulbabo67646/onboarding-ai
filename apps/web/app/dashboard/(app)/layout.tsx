import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/AppShell';
import { authEnabled } from '@/lib/server/auth';
import { getStore } from '@/lib/server/store';
import { sessionStatus } from '@/lib/sessions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { default: 'Dashboard', template: '%s · Onboarding AI' },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const sessions = await getStore().listSessions(undefined, 200);
  const live = sessions.filter((s) => ['live', 'connecting'].includes(sessionStatus(s))).length;
  return (
    <AppShell canSignOut={authEnabled()} liveCount={live}>
      {children}
    </AppShell>
  );
}

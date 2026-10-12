import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/AuthForms';
import { CenteredPage } from '@/components/site/CenteredPage';
import { Alert } from '@/components/ui';
import { safeNext } from '@/lib/safe-next';
import { googleEnabled } from '@/lib/server/auth';
import { getViewer } from '@/lib/server/viewer';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; email?: string }>;
}) {
  const { next: rawNext, reset, email } = await searchParams;
  const next = safeNext(rawNext);
  if (await getViewer()) redirect(next);
  return (
    <CenteredPage>
      <div className="stack">
        {reset && <Alert tone="info">Your password was updated. Sign in with the new one.</Alert>}
        <LoginForm next={next} google={googleEnabled()} email={email} />
      </div>
    </CenteredPage>
  );
}

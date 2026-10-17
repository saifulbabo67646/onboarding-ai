import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/auth/AuthForms';
import { CenteredPage } from '@/components/site/CenteredPage';
import { safeNext } from '@/lib/safe-next';
import { googleEnabled } from '@/lib/server/auth';
import { getViewer } from '@/lib/server/viewer';

export const metadata: Metadata = { title: 'Create account' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const { next: rawNext, email } = await searchParams;
  const next = safeNext(rawNext);
  if (await getViewer()) redirect(next);
  return (
    <CenteredPage>
      <SignupForm next={next} google={googleEnabled()} email={email} />
    </CenteredPage>
  );
}

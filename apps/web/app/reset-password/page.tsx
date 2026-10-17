import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/AuthForms';
import { CenteredPage } from '@/components/site/CenteredPage';
import { Alert, Button } from '@/components/ui';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <CenteredPage>
      {token && !error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="stack">
          <Alert tone="danger" title="This reset link is invalid or has expired">
            Request a new one and use it within an hour.
          </Alert>
          <Button href="/forgot-password" variant="primary" block>
            Request a new link
          </Button>
        </div>
      )}
    </CenteredPage>
  );
}

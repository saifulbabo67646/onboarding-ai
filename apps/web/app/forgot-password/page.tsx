import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/AuthForms';
import { CenteredPage } from '@/components/site/CenteredPage';
import { emailConfigured } from '@/lib/server/email';

export const metadata: Metadata = { title: 'Reset password' };
// Reads server env at request time (whether email is configured).
export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return (
    <CenteredPage>
      <ForgotPasswordForm emailEnabled={emailConfigured()} />
    </CenteredPage>
  );
}

import { LogIn } from 'lucide-react';
import type { Metadata } from 'next';
import { CenteredPage } from '@/components/site/CenteredPage';
import { Alert, Button, Field, Input } from '@/components/ui';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = '/dashboard', error } = await searchParams;
  return (
    <CenteredPage>
      <form className="stack" action="/api/auth/login" method="post">
        <div className="stack-sm">
          <h1 className="title-lg">Sign in</h1>
          <p className="text-secondary">
            Enter the dashboard password configured in <code>DASHBOARD_PASSWORD</code>.
          </p>
        </div>
        <input type="hidden" name="next" value={next} />
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" name="password" autoFocus required />
        </Field>
        {error && <Alert tone="danger">That password didn&apos;t work.</Alert>}
        <Button type="submit" variant="primary" size="lg" block icon={LogIn}>
          Sign in
        </Button>
      </form>
    </CenteredPage>
  );
}

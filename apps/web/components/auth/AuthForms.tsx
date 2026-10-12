'use client';

import { ArrowRight, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import styles from './Auth.module.css';
import { GoogleButton, OrDivider } from './GoogleButton';

type Props = { next: string; google: boolean; email?: string };

function useSubmit() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<{ error?: { message?: string } | null } | void>) {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (result && result.error) {
      setError(result.error.message ?? 'Something went wrong. Please try again.');
      return false;
    }
    return true;
  }
  return { error, busy, run };
}

export function LoginForm({ next, google, email: initialEmail = '' }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const { error, busy, run } = useSubmit();
  const qs = `?next=${encodeURIComponent(next)}`;

  return (
    <div className="stack">
      <div className={styles.header}>
        <h1 className="title-lg">Welcome back</h1>
        <p className="text-secondary">Sign in to manage your presenters.</p>
      </div>
      {google && (
        <>
          <GoogleButton next={next} />
          <OrDivider />
        </>
      )}
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() => authClient.signIn.email({ email, password }));
          if (ok) {
            router.push(next);
            router.refresh();
          }
        }}
      >
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus={!initialEmail}
          />
        </Field>
        <Field
          label={
            <span className={styles.labelRow}>
              Password <Link href={`/forgot-password${qs}`}>Forgot password?</Link>
            </span>
          }
          htmlFor="password"
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus={Boolean(initialEmail)}
          />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Sign in
        </Button>
      </form>
      <p className={styles.footer}>
        New here? <Link href={`/signup${qs}`}>Create an account</Link>
      </p>
    </div>
  );
}

export function SignupForm({ next, google, email: initialEmail = '' }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const { error, busy, run } = useSubmit();

  return (
    <div className="stack">
      <div className={styles.header}>
        <h1 className="title-lg">Create your account</h1>
        <p className="text-secondary">You&apos;ll get your own workspace to build presenters in.</p>
      </div>
      {google && (
        <>
          <GoogleButton next={next} label="Sign up with Google" />
          <OrDivider />
        </>
      )}
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() => authClient.signUp.email({ name, email, password }));
          if (ok) {
            router.push(next);
            router.refresh();
          }
        }}
      >
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Work email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={busy}
          iconRight={ArrowRight}
        >
          Create account
        </Button>
      </form>
      <p className={styles.footer}>
        Already have an account?{' '}
        <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { error, busy, run } = useSubmit();

  if (sent) {
    return (
      <div className="stack">
        <Alert tone="info" title="Check your inbox">
          If an account exists for {email}, we&apos;ve sent a link to reset the password.
        </Alert>
        <Button href="/login" block>
          Back to sign in
        </Button>
      </div>
    );
  }
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() =>
          authClient.requestPasswordReset({
            email,
            redirectTo: `${window.location.origin}/reset-password`,
          }),
        );
        if (ok) setSent(true);
      }}
    >
      <div className={styles.header}>
        <h1 className="title-lg">Reset your password</h1>
        <p className="text-secondary">We&apos;ll email you a link to choose a new one.</p>
      </div>
      {!emailEnabled && (
        <Alert tone="warning" title="Email isn't configured">
          This server can&apos;t send email yet, so the reset link is written to the server log. Set{' '}
          <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> to send real emails.
        </Alert>
      )}
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" variant="primary" size="lg" block loading={busy} icon={MailCheck}>
        Send reset link
      </Button>
      <p className={styles.footer}>
        <Link href="/login">Back to sign in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const { error, busy, run } = useSubmit();
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() => authClient.resetPassword({ newPassword: password, token }));
        if (ok) router.push('/login?reset=1');
      }}
    >
      <div className={styles.header}>
        <h1 className="title-lg">Choose a new password</h1>
        <p className="text-secondary">You&apos;ll be signed out everywhere else.</p>
      </div>
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
        />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" variant="primary" size="lg" block loading={busy}>
        Update password
      </Button>
    </form>
  );
}

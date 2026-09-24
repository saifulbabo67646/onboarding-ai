import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = '/dashboard', error } = await searchParams;
  return (
    <main className="join-page">
      <form className="card join-card stack" action="/api/auth/login" method="post">
        <h1>Owner sign in</h1>
        <p className="muted" style={{ margin: 0 }}>
          Enter the dashboard password configured in <code>DASHBOARD_PASSWORD</code>.
        </p>
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            name="password"
            autoFocus
            required
          />
        </div>
        {error && <p className="error-text">That password didn&apos;t work.</p>}
        <button className="btn btn-primary btn-lg" type="submit">
          Sign in
        </button>
      </form>
    </main>
  );
}

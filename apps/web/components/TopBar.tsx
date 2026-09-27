import Link from 'next/link';
import { authEnabled } from '@/lib/server/auth';

export function TopBar({ owner = false }: { owner?: boolean }) {
  return (
    <header className="topbar">
      <div className="container">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden>
            ▶
          </span>
          Onboarding AI
        </Link>
        <nav className="nav">
          {owner ? (
            <>
              <Link href="/dashboard" className="btn btn-ghost">
                Presenters
              </Link>
              <Link href="/dashboard/agents/new" className="btn btn-primary">
                New presenter
              </Link>
              {authEnabled() && (
                <form action="/api/auth/logout" method="post">
                  <button className="btn btn-ghost" type="submit">
                    Sign out
                  </button>
                </form>
              )}
            </>
          ) : (
            <Link href="/dashboard" className="btn">
              Open dashboard
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

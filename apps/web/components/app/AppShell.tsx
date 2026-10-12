'use client';

import { BookOpen, LayoutDashboard, LogOut, Menu, Presentation, Radio, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Logo } from '@/components/ui';
import { cx } from '@/lib/cx';
import styles from './AppShell.module.css';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/presenters', label: 'Presenters', icon: Presentation },
  { href: '/dashboard/sessions', label: 'Sessions', icon: Radio },
];

/** Dashboard frame: sidebar navigation on desktop, a drawer on mobile. */
export function AppShell({
  children,
  canSignOut,
  liveCount,
}: {
  children: ReactNode;
  canSignOut: boolean;
  liveCount: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className={styles.shell}>
      <header className={styles.mobileBar}>
        <Logo href="/dashboard" />
        <button
          type="button"
          className={styles.menuButton}
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      <aside className={cx(styles.sidebar, open && styles.sidebarOpen)}>
        <div className={styles.brand}>
          <Logo href="/dashboard" />
        </div>
        <nav className={styles.nav} aria-label="Main">
          {NAV.map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              className={cx(styles.navItem, isActive(href, exact) && styles.navActive)}
              aria-current={isActive(href, exact) ? 'page' : undefined}
            >
              <Icon size={16} aria-hidden />
              {label}
              {href === '/dashboard/sessions' && liveCount > 0 && (
                <span className={styles.live} title={`${liveCount} live now`}>
                  {liveCount}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className={styles.footer}>
          <a
            className={styles.navItem}
            href="https://github.com/saifulbabo67646/onboarding-ai"
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen size={16} aria-hidden />
            Documentation
          </a>
          {canSignOut && (
            <form action="/api/auth/logout" method="post">
              <button type="submit" className={styles.navItem}>
                <LogOut size={16} aria-hidden />
                Sign out
              </button>
            </form>
          )}
        </div>
      </aside>
      {open && <div className={styles.scrim} onClick={() => setOpen(false)} aria-hidden />}

      <main className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}

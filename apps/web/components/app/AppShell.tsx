'use client';

import { LayoutDashboard, Menu, Presentation, Radio, Settings, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Logo } from '@/components/ui';
import { cx } from '@/lib/cx';
import type { Viewer } from '@/lib/types';
import { UserMenu } from './UserMenu';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import styles from './AppShell.module.css';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/presenters', label: 'Presenters', icon: Presentation },
  { href: '/dashboard/sessions', label: 'Sessions', icon: Radio },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

/** Dashboard frame: sidebar navigation on desktop, a drawer on mobile. */
export function AppShell({
  children,
  viewer,
  liveCount,
}: {
  children: ReactNode;
  viewer: Viewer;
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
        <WorkspaceSwitcher viewer={viewer} />
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
          <UserMenu user={viewer.user} />
        </div>
      </aside>
      {open && <div className={styles.scrim} onClick={() => setOpen(false)} aria-hidden />}

      <main className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/lib/cx';
import styles from './Tabs.module.css';

export type Tab = { label: string; href: string; count?: number };

/** Route-based tabs: each tab is a page, the active one follows the URL. */
export function Tabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  // The longest matching href wins so "/x" isn't active on "/x/settings".
  const active = tabs
    .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className={styles.tabs} aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cx(styles.tab, active === t.href && styles.active)}
          aria-current={active === t.href ? 'page' : undefined}
        >
          {t.label}
          {t.count !== undefined && <span className={styles.count}>{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

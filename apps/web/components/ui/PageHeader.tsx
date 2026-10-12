import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

export type Crumb = { label: string; href?: string };

/** Title row of every dashboard page: breadcrumbs, title, description, actions. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Small inline items next to the title (badges). */
  meta?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          {breadcrumbs.map((c, i) => (
            <span key={i} className={styles.crumb}>
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
              {i < breadcrumbs.length - 1 && <ChevronRight size={14} aria-hidden />}
            </span>
          ))}
        </nav>
      )}
      <div className={styles.row}>
        <div className={styles.heading}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            {meta}
          </div>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </header>
  );
}

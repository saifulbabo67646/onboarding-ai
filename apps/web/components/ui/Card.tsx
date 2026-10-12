import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './Card.module.css';

/** A surface that groups related content. Header and footer are optional. */
export function Card({
  title,
  description,
  actions,
  footer,
  padded = true,
  tone,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  /** Set false when the body is a table or list that runs edge to edge. */
  padded?: boolean;
  tone?: 'danger';
  className?: string;
  children?: ReactNode;
}) {
  const hasHeader = title || description || actions;
  return (
    <section className={cx(styles.card, tone === 'danger' && styles.danger, className)}>
      {hasHeader && (
        <header className={styles.header}>
          <div className={styles.heading}>
            {title && <h2 className={styles.title}>{title}</h2>}
            {description && <p className={styles.description}>{description}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {children !== undefined && (
        <div className={cx(padded ? styles.body : styles.flush, !hasHeader && styles.noHeader)}>
          {children}
        </div>
      )}
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </section>
  );
}

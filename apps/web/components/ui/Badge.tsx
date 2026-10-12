import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export function Badge({
  tone = 'neutral',
  icon: Icon,
  dot,
  pulse,
  children,
}: {
  tone?: BadgeTone;
  icon?: LucideIcon;
  /** A small status dot before the label. */
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={cx(styles.badge, styles[tone])}>
      {dot && <span className={cx(styles.dot, pulse && styles.pulse)} aria-hidden />}
      {Icon && <Icon size={12} aria-hidden />}
      {children}
    </span>
  );
}

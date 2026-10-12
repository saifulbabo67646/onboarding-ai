import { AlertTriangle, CircleAlert, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './Alert.module.css';

const ICONS = { info: Info, warning: AlertTriangle, danger: CircleAlert };

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
}) {
  const Icon = ICONS[tone];
  return (
    <div className={cx(styles.alert, styles[tone])} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={16} className={styles.icon} aria-hidden />
      <div>
        {title && <p className={styles.title}>{title}</p>}
        {children && <div className={styles.body}>{children}</div>}
      </div>
    </div>
  );
}

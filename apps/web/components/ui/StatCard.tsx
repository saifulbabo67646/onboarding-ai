import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './StatCard.module.css';

/** KPI tile: label, value and an optional supporting line. */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  hint?: ReactNode;
}) {
  return (
    <div className={styles.stat}>
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        {Icon && <Icon size={16} className={styles.icon} aria-hidden />}
      </div>
      <div className={styles.value}>{value}</div>
      {hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
}

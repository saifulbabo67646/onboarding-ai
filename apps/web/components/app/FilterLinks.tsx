import Link from 'next/link';
import { cx } from '@/lib/cx';
import styles from './FilterLinks.module.css';

/** A row of URL-driven filter pills (works without client JS). */
export function FilterLinks({
  options,
}: {
  options: { label: string; href: string; active: boolean; count?: number }[];
}) {
  return (
    <div className={styles.group} role="group">
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          className={cx(styles.pill, o.active && styles.active)}
          aria-current={o.active ? 'true' : undefined}
        >
          {o.label}
          {o.count !== undefined && <span className={styles.count}>{o.count}</span>}
        </Link>
      ))}
    </div>
  );
}

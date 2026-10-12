import { cx } from '@/lib/cx';
import styles from './Avatar.module.css';

/** Initial-based avatar. `brand` uses the product gradient (for presenters). */
export function Avatar({
  name,
  size = 'md',
  brand = false,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  brand?: boolean;
}) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span className={cx(styles.avatar, styles[size], brand && styles.brand)} aria-hidden>
      {initial}
    </span>
  );
}

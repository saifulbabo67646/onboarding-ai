import type { ReactNode } from 'react';
import { Logo } from '@/components/ui';
import { cx } from '@/lib/cx';
import styles from './CenteredPage.module.css';

/** Focused single-card layout for sign-in, joining and end-of-session screens. */
export function CenteredPage({
  children,
  embedded = false,
  showLogo = true,
}: {
  children: ReactNode;
  /** Inside the website widget iframe: no backdrop, no logo, card fills the panel. */
  embedded?: boolean;
  showLogo?: boolean;
}) {
  return (
    <main className={cx(styles.page, embedded && styles.embedded)}>
      {showLogo && !embedded && (
        <div className={styles.logo}>
          <Logo />
        </div>
      )}
      <div className={styles.card}>{children}</div>
    </main>
  );
}

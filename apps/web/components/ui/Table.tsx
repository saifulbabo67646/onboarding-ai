import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';
import styles from './Table.module.css';

/** Data table with consistent density. Use inside a Card with padded={false}. */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className={styles.wrap}>
      <table className={cx(styles.table, className)} {...props} />
    </div>
  );
}

export const tableStyles = styles;

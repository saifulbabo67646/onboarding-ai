import { ChevronDown } from 'lucide-react';
import { forwardRef, type ComponentProps } from 'react';
import { cx } from '@/lib/cx';
import fieldStyles from './Field.module.css';
import styles from './Select.module.css';

/** Native select styled like the other form controls. */
export const Select = forwardRef<HTMLSelectElement, ComponentProps<'select'>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <span className={styles.wrap}>
      <select ref={ref} className={cx(fieldStyles.control, styles.select, className)} {...props}>
        {children}
      </select>
      <ChevronDown size={14} className={styles.chevron} aria-hidden />
    </span>
  );
});

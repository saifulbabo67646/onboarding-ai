import type { LucideIcon } from 'lucide-react';
import { cx } from '@/lib/cx';
import styles from './OptionCards.module.css';

export type Option<T extends string> = {
  value: T;
  label: string;
  description: string;
  icon: LucideIcon;
};

/** A radio group shown as selectable cards (for choices that need explaining). */
export function OptionCards<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.grid} role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className={cx(styles.option, value === o.value && styles.selected)}>
          <input
            type="radio"
            className={styles.input}
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span className={styles.icon}>
            <o.icon size={18} aria-hidden />
          </span>
          <span>
            <span className={styles.label}>{o.label}</span>
            <span className={styles.description}>{o.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './Menu.module.css';

/**
 * Dropdown menu: a trigger plus a popover of items. Closes on outside click,
 * Escape, or choosing an item.
 */
export function Menu({
  trigger,
  children,
  align = 'start',
  placement = 'bottom',
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  placement?: 'bottom' | 'top';
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={cx(styles.popover, styles[align], styles[placement])}
          role="menu"
          aria-label={label}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  icon,
  onSelect,
  selected,
  tone,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  selected?: boolean;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cx(styles.item, selected && styles.selected, tone === 'danger' && styles.danger)}
      onClick={onSelect}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.label}>{children}</span>
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className={styles.heading}>{children}</div>;
}

export function MenuDivider() {
  return <div className={styles.divider} role="separator" />;
}

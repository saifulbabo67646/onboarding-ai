import { forwardRef, useId, type ComponentProps, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './Field.module.css';

/** Label + control + hint/error, with the ids wired for accessibility. */
export function Field({
  label,
  hint,
  error,
  optional,
  htmlFor,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
        {optional && <span className={styles.optional}>Optional</span>}
      </label>
      {children}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        hint && <p className={styles.hint}>{hint}</p>
      )}
    </div>
  );
}

/** Generates a stable id for pairing a Field label with its control. */
export function useFieldId(prefix: string) {
  return `${prefix}-${useId().replace(/:/g, '')}`;
}

export const Input = forwardRef<HTMLInputElement, ComponentProps<'input'> & { mono?: boolean }>(
  function Input({ className, mono, ...props }, ref) {
    return (
      <input ref={ref} className={cx(styles.control, mono && styles.mono, className)} {...props} />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  ComponentProps<'textarea'> & { compact?: boolean }
>(function Textarea({ className, compact, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx(styles.control, styles.textarea, compact && styles.compact, className)}
      {...props}
    />
  );
});

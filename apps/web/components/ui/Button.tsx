import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Spinner } from './Spinner';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type BaseProps = {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  block?: boolean;
  children?: ReactNode;
  className?: string;
};

type ButtonProps = BaseProps &
  Omit<ComponentProps<'button'>, keyof BaseProps> & { href?: undefined };
type LinkProps = BaseProps &
  Omit<ComponentProps<typeof Link>, keyof BaseProps> & { href: string; external?: boolean };

const ICON_SIZE: Record<Size, number> = { sm: 14, md: 16, lg: 18 };

function classes({ variant = 'secondary', size = 'md', block, className }: BaseProps) {
  return cx(styles.button, styles[variant], styles[size], block && styles.block, className);
}

/** The only button in the app. Renders a Next link when given `href`. */
export function Button(props: ButtonProps | LinkProps) {
  const {
    variant,
    size = 'md',
    icon: Icon,
    iconRight: IconRight,
    loading,
    block,
    children,
    className,
    ...rest
  } = props;
  const cls = classes({ variant, size, block, className });
  const content = (
    <>
      {loading ? (
        <Spinner size={ICON_SIZE[size]} />
      ) : (
        Icon && <Icon size={ICON_SIZE[size]} aria-hidden />
      )}
      {children && <span>{children}</span>}
      {IconRight && <IconRight size={ICON_SIZE[size]} aria-hidden />}
    </>
  );

  if ('href' in rest && rest.href !== undefined) {
    const { external, ...linkProps } = rest as LinkProps;
    if (external) {
      return (
        <a className={cls} href={linkProps.href} target="_blank" rel="noreferrer">
          {content}
        </a>
      );
    }
    return (
      <Link className={cls} {...linkProps}>
        {content}
      </Link>
    );
  }
  const buttonProps = rest as ComponentProps<'button'>;
  return (
    <button
      type="button"
      className={cls}
      {...buttonProps}
      disabled={buttonProps.disabled || loading}
      aria-busy={loading || undefined}
    >
      {content}
    </button>
  );
}

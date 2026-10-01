import { clsx } from 'clsx';
import { Loader2, type LucideIcon } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { usePrimaryRegistration } from '@/lib/primary-scope';

export type ButtonVariant = 'primary' | 'secondary' | 'danger-outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `primary` is the single red action on a screen. Use `secondary` for everything else. */
  variant?: ButtonVariant;
  /** sm 32px (toolbars, bulk bars) · md 36px (default) · lg 44px (sign-in) */
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'border-primary bg-primary text-card hover:bg-primary/90',
  secondary: 'border-border bg-card text-ink hover:bg-page',
  'danger-outline': 'border-primary-border bg-card text-primary hover:bg-primary-tint',
  ghost: 'border-transparent bg-transparent text-muted hover:text-ink',
};

// Primary gets 2px more horizontal padding than the others, as in the mockups.
const SIZE: Record<ButtonSize, { base: string; primary: string }> = {
  sm: { base: 'h-ctl-sm px-3 text-sm', primary: 'h-ctl-sm px-3.5 text-sm' },
  md: { base: 'h-ctl px-3.5 text-base', primary: 'h-ctl px-4 text-base' },
  lg: { base: 'h-ctl-xl px-5 text-lg', primary: 'h-ctl-xl px-5 text-lg' },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, loading, fullWidth, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  usePrimaryRegistration(variant === 'primary', typeof children === 'string' ? children : (rest['aria-label'] ?? ''));

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded border font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        variant === 'primary' ? SIZE[size].primary : SIZE[size].base,
        variant === 'ghost' && 'px-1.5',
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 size={15} strokeWidth={1.8} className="animate-spin" aria-hidden />
      ) : (
        Icon && <Icon size={15} strokeWidth={1.8} aria-hidden />
      )}
      {children}
    </button>
  );
});

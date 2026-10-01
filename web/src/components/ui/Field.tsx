import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export type ControlSize = 'md' | 'lg';

/** Box shared by Input and Select: 36px (md) or 42px (lg, sign-in). Focus is an ink border, never a blue ring. */
export function controlBoxClass({ size = 'md', invalid, disabled }: { size?: ControlSize; invalid?: boolean; disabled?: boolean }) {
  return clsx(
    'flex w-full items-center gap-2 rounded border transition-colors focus-within:border-ink',
    size === 'md' ? 'h-ctl px-3 text-base bg-card' : 'h-ctl-lg px-3.5 text-lg bg-page',
    invalid ? 'border-primary' : 'border-border',
    disabled && 'cursor-not-allowed bg-subtle text-muted',
  );
}

export interface FieldProps {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Label (12.5/600) above the control with a 6px gap; hint or error below. */
export function Field({ id, label, hint, error, className, children }: FieldProps) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-meta text-primary">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-meta text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, { hint, error }: { hint?: ReactNode; error?: ReactNode }) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

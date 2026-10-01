import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { controlBoxClass, describedBy, Field, type ControlSize } from './Field';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  size?: ControlSize;
  icon?: LucideIcon;
  /** Right-aligned adornment, e.g. a unit ("kg") or a clear button. */
  suffix?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, size = 'md', icon: Icon, suffix, containerClassName, id: idProp, className, disabled, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field id={id} label={label} hint={hint} error={error} className={containerClassName}>
      <div className={controlBoxClass({ size, invalid: !!error, disabled })}>
        {Icon && <Icon size={15} strokeWidth={1.8} className="shrink-0 text-faint" aria-hidden />}
        <input
          ref={ref}
          id={id}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, { hint, error })}
          className={clsx(
            'h-full min-w-0 flex-1 bg-transparent text-inherit placeholder:text-faint focus-visible:outline-none disabled:cursor-not-allowed',
            className,
          )}
          {...rest}
        />
        {suffix && <span className="shrink-0 text-sm text-muted">{suffix}</span>}
      </div>
    </Field>
  );
});

import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import { forwardRef, useId, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { controlBoxClass, describedBy, Field, type ControlSize } from './Field';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  size?: ControlSize;
  options: SelectOption[];
  /** Shown in faint text while no value is chosen, e.g. "All vendors". */
  placeholder?: string;
  containerClassName?: string;
}

/** Native <select> styled to the control box: keyboard, mobile and screen-reader behaviour for free. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, size = 'md', options, placeholder, containerClassName, id: idProp, className, disabled, onChange, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [uncontrolled, setUncontrolled] = useState(String(rest.defaultValue ?? ''));
  const current = rest.value !== undefined ? String(rest.value) : uncontrolled;

  return (
    <Field id={id} label={label} hint={hint} error={error} className={containerClassName}>
      <div className={clsx(controlBoxClass({ size, invalid: !!error, disabled }), 'relative !px-0')}>
        <select
          ref={ref}
          id={id}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, { hint, error })}
          onChange={(e) => {
            setUncontrolled(e.target.value);
            onChange?.(e);
          }}
          className={clsx(
            'h-full w-full min-w-0 cursor-pointer appearance-none bg-transparent pr-9 focus-visible:outline-none disabled:cursor-not-allowed',
            size === 'md' ? 'pl-3' : 'pl-3.5',
            current === '' ? 'text-faint' : 'text-ink',
            className,
          )}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled} className="text-ink">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} strokeWidth={1.8} className="pointer-events-none absolute right-3 text-muted" aria-hidden />
      </div>
    </Field>
  );
});

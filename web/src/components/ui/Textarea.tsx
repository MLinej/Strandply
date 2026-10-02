import { clsx } from 'clsx';
import { forwardRef, useId, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { describedBy, Field } from './Field';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
}

/** Multi-line Input: same border, focus and error treatment; grows with `rows` (default 3). */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, containerClassName, id: idProp, className, disabled, rows = 3, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field id={id} label={label} hint={hint} error={error} className={containerClassName}>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { hint, error })}
        className={clsx(
          'w-full resize-y rounded border bg-card px-3 py-2 text-base leading-relaxed text-ink transition-colors placeholder:text-faint focus:border-ink focus-visible:outline-none',
          error ? 'border-primary' : 'border-border',
          disabled && 'cursor-not-allowed bg-subtle text-muted',
          className,
        )}
        {...rest}
      />
    </Field>
  );
});

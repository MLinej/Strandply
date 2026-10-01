import { clsx } from 'clsx';
import { useRef, type KeyboardEvent } from 'react';

export interface SegmentedControlProps<V extends string> {
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  'aria-label': string;
  className?: string;
}

/** The Home mockup's firm switch: 3px-padded white track, 30px segments, active segment red-light. */
export function SegmentedControl<V extends string>({ options, value, onChange, className, ...rest }: SegmentedControlProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent) {
    const i = options.findIndex((o) => o.value === value);
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={rest['aria-label']}
      onKeyDown={onKeyDown}
      className={clsx('inline-flex gap-0.5 rounded border border-border bg-card p-0.75', className)}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={clsx(
              'h-7.5 whitespace-nowrap rounded-md px-3 text-sm transition-colors',
              active ? 'bg-primary-light font-semibold text-primary' : 'font-medium text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

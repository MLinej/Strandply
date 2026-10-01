import { clsx } from 'clsx';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<V extends string = string> {
  value: V;
  label: ReactNode;
  /** Shown after the label in faint text (status tabs: "Accounted 38"). */
  count?: number | string;
  disabled?: boolean;
}

export interface TabsProps<V extends string> {
  items: TabItem<V>[];
  value: V;
  onChange: (value: V) => void;
  'aria-label': string;
  /** Panel content for the active tab. Omit when the tabs only filter a table below them. */
  children?: ReactNode;
  className?: string;
}

/** Underline tabs: 38px, 22px apart, 13.5px text; active tab is red with a 2px underline. Arrow keys move. */
export function Tabs<V extends string>({ items, value, onChange, children, className, ...rest }: TabsProps<V>) {
  const baseId = useId();
  const refs = useRef(new Map<V, HTMLButtonElement>());
  const enabled = items.filter((t) => !t.disabled);

  function onKeyDown(e: KeyboardEvent) {
    const i = enabled.findIndex((t) => t.value === value);
    const next =
      e.key === 'ArrowRight' ? enabled[(i + 1) % enabled.length]
      : e.key === 'ArrowLeft' ? enabled[(i - 1 + enabled.length) % enabled.length]
      : e.key === 'Home' ? enabled[0]
      : e.key === 'End' ? enabled[enabled.length - 1]
      : undefined;
    if (!next) return;
    e.preventDefault();
    onChange(next.value);
    refs.current.get(next.value)?.focus();
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={rest['aria-label']} onKeyDown={onKeyDown} className="flex gap-5.5 overflow-x-auto border-b border-border">
        {items.map((t) => {
          const selected = t.value === value;
          return (
            <button
              key={t.value}
              ref={(el) => {
                if (el) refs.current.set(t.value, el);
                else refs.current.delete(t.value);
              }}
              role="tab"
              type="button"
              id={`${baseId}-tab-${t.value}`}
              aria-selected={selected}
              aria-controls={children ? `${baseId}-panel` : undefined}
              tabIndex={selected ? 0 : -1}
              disabled={t.disabled}
              onClick={() => onChange(t.value)}
              className={clsx(
                '-mb-px inline-flex h-row shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-md transition-colors disabled:opacity-50',
                selected ? 'border-primary font-semibold text-primary' : 'border-transparent font-medium text-muted hover:text-ink',
              )}
            >
              {t.label}
              {t.count !== undefined && <span className="text-caption font-semibold tabular-nums text-faint">{t.count}</span>}
            </button>
          );
        })}
      </div>
      {children && (
        <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${value}`} className="pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

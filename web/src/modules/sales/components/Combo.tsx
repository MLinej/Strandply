import { clsx } from 'clsx';
import { Search, X } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { controlBoxClass, Field } from '@/components/ui/Field';

export interface ComboOption {
  id: string;
  label: string;
  /** Shown after the label, muted (city, GSTIN…). */
  hint?: string | null;
}

const MAX = 50;

/**
 * Searchable picker over a list already loaded (parties, items). Matches every word typed, in the label
 * or hint, and shows the first 50. Picked value shows as a chip with a clear button.
 */
export function Combo({
  label,
  value,
  options,
  onChange,
  error,
  disabled,
  placeholder = 'Type to search',
  ariaLabel,
}: {
  label?: string;
  value: string | null;
  options: ComboOption[];
  onChange: (id: string | null) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const picked = value ? options.find((o) => o.id === value) : null;
  const matches = useMemo(() => {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = words.length ? options.filter((o) => words.every((w) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(w))) : options;
    return hits.slice(0, MAX);
  }, [options, text]);

  function choose(o: ComboOption) {
    onChange(o.id);
    setText('');
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]!);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation(); // don't close the surrounding modal
      setOpen(false);
    }
  }

  if (value) {
    return (
      <Field id={id} label={label} error={error}>
        <div className={controlBoxClass({ invalid: !!error, disabled })}>
          <span id={id} className="min-w-0 flex-1 truncate" aria-label={ariaLabel ?? label}>
            <span className="font-medium text-ink">{picked?.label ?? '—'}</span>
            {picked?.hint && <span className="text-muted"> · {picked.hint}</span>}
          </span>
          {!disabled && (
            <button
              type="button"
              aria-label={`Change ${(ariaLabel ?? label ?? 'value').toLowerCase()}`}
              onClick={() => {
                onChange(null);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className="text-muted hover:text-ink"
            >
              <X size={15} strokeWidth={1.8} aria-hidden />
            </button>
          )}
        </div>
      </Field>
    );
  }

  return (
    <Field id={id} label={label} error={error}>
      <div className="relative">
        <div className={controlBoxClass({ invalid: !!error, disabled })}>
          <Search size={15} strokeWidth={1.8} className="shrink-0 text-faint" aria-hidden />
          <input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            placeholder={placeholder}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            className="h-full min-w-0 flex-1 bg-transparent placeholder:text-faint focus-visible:outline-none"
          />
        </div>
        {open && (
          <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded border border-border bg-card py-1 shadow-overlay">
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-base text-muted">Nothing matches</li>
            ) : (
              matches.map((o, i) => (
                <li
                  key={o.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  onMouseEnter={() => setActive(i)}
                  className={clsx('cursor-pointer px-3 py-1.5 text-base', i === active && 'bg-page')}
                >
                  <span className="font-medium">{o.label}</span>
                  {o.hint && <span className="text-muted"> · {o.hint}</span>}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </Field>
  );
}

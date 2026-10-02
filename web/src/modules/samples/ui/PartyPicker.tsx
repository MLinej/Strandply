import { clsx } from 'clsx';
import { Search, X } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { controlBoxClass, Field } from '@/components/ui/Field';
import { useDispatchPartyOptions } from '../api';
import { useDebounced } from './list-state';

export interface PickedParty {
  id: string;
  name: string;
  city: string | null;
}

/**
 * Searchable party picker (combobox) for the dispatch form. Searches the server as you type
 * (GET /dispatches/party-options), so it works for any number of parties and for the
 * dispatch role, which can't open the Parties page.
 */
export function PartyPicker({
  label = 'Party',
  value,
  onChange,
  error,
  disabled,
}: {
  label?: string;
  value: PickedParty | null;
  onChange: (p: PickedParty | null) => void;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebounced(text, 200);
  const options = useDispatchPartyOptions(q).data ?? [];
  const inputRef = useRef<HTMLInputElement>(null);

  function choose(p: PickedParty) {
    onChange(p);
    setText('');
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && options[active]) {
      e.preventDefault();
      choose(options[active]!);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation(); // don't close the surrounding modal
      setOpen(false);
    }
  }

  if (value) {
    return (
      <Field id={id} label={label} error={error}>
        <div className={controlBoxClass({ invalid: !!error, disabled })}>
          <span id={id} className="min-w-0 flex-1 truncate">
            <span className="font-medium text-ink">{value.name}</span>
            {value.city && <span className="text-muted"> · {value.city}</span>}
          </span>
          {!disabled && (
            <button
              type="button"
              aria-label="Change party"
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
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            placeholder="Search party name"
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
            {options.length === 0 ? (
              <li className="px-3 py-2 text-base text-muted">{q ? 'No party matches' : 'Type to search'}</li>
            ) : (
              options.map((p, i) => (
                <li
                  key={p.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(p)}
                  onMouseEnter={() => setActive(i)}
                  className={clsx('cursor-pointer px-3 py-1.5 text-base', i === active && 'bg-page')}
                >
                  <span className="font-medium">{p.name}</span>
                  {p.city && <span className="text-muted"> · {p.city}</span>}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </Field>
  );
}

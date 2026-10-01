import { clsx } from 'clsx';
import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Kbd } from '@/components/ui';
import { modulePath, pagePath, type ModuleDef } from '../modules';
import { useSession } from '../session';

interface Entry {
  id: string;
  group: string;
  title: string;
  meta: string;
  href: string;
  haystack: string;
}

function entriesFor(modules: ModuleDef[]): Entry[] {
  return modules.flatMap((m) => {
    const aliases = [m.label, m.legacyName ?? ''].join(' ');
    if (m.pages.length === 0) {
      return [{ id: m.key, group: m.label, title: m.label, meta: m.legacyName ? `Was “${m.legacyName}”` : 'Module', href: modulePath(m.key), haystack: aliases.toLowerCase() }];
    }
    return m.pages.map((p) => ({
      id: `${m.key}/${p.slug}`,
      group: m.label,
      title: p.label,
      meta: m.legacyName ? `${m.label} · was “${m.legacyName}”` : m.label,
      href: pagePath(m.key, p.slug),
      haystack: `${p.label} ${aliases}`.toLowerCase(),
    }));
  });
}

export function filterEntries(all: Entry[], query: string): Entry[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    // Nothing typed: one row per module, its first page.
    const seen = new Set<string>();
    return all.filter((e) => !seen.has(e.group) && seen.add(e.group)).map((e) => ({ ...e, group: 'Go to' }));
  }
  return all.filter((e) => tokens.every((t) => e.haystack.includes(t)));
}

/**
 * Search.dc.html: 640px palette 92px from the top, 54px input row, uppercase group headers,
 * selected row page-grey with a 2px red bar, footer with key hints and a result count.
 * Searches pages for now; records (invoices, GRNs, customers …) join once the API's FTS index exists.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { visibleModules } = useSession();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const all = useMemo(() => entriesFor(visibleModules), [visibleModules]);
  const results = useMemo(() => filterEntries(all, query), [all, query]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setQuery('');
      setActive(0);
      d.showModal?.();
    } else if (!open && d.open) d.close?.();
  }, [open]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function go(entry: Entry | undefined) {
    if (!entry) return;
    onClose();
    navigate(entry.href);
  }

  // Render groups in first-appearance order, tracking each row's flat index for keyboard nav.
  const groups: { title: string; rows: { entry: Entry; index: number }[] }[] = [];
  results.forEach((entry, index) => {
    const g = groups.find((x) => x.title === entry.group) ?? groups[groups.push({ title: entry.group, rows: [] }) - 1];
    g.rows.push({ entry, index });
  });

  return (
    <dialog
      ref={dialog}
      aria-label="Search"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      className="mx-auto mt-modal-top w-[640px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-border bg-card p-0 text-ink shadow-overlay"
    >
      {open && (
        <div className="flex max-h-[calc(100vh-184px)] flex-col">
          <div className="flex h-[54px] shrink-0 items-center gap-2.5 border-b border-divider px-4">
            <Search size={18} strokeWidth={1.8} className="text-muted" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  go(results[active]);
                }
              }}
              placeholder="Search pages and modules…"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
              aria-label="Search"
              className="min-w-0 flex-1 bg-transparent text-title placeholder:text-faint focus-visible:outline-none"
            />
            <Kbd>Esc</Kbd>
          </div>

          <div ref={list} id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto">
            {results.length === 0 ? (
              <div className="px-4 py-10 text-center text-base text-muted">
                No pages match “{query}”. Record search (invoices, GRNs, customers) arrives with the API.
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.title} role="group" aria-label={g.title}>
                  <div className="label-caps bg-page px-4 py-1.75">{g.title}</div>
                  {g.rows.map(({ entry, index }) => {
                    const selected = index === active;
                    return (
                      <div
                        key={entry.id}
                        id={`${listId}-${index}`}
                        data-index={index}
                        role="option"
                        aria-selected={selected}
                        onMouseMove={() => setActive(index)}
                        onClick={() => go(entry)}
                        className={clsx(
                          'relative flex cursor-pointer items-center justify-between gap-3 border-t border-divider px-4 py-2',
                          selected ? 'bg-page' : 'bg-card',
                        )}
                      >
                        <span className={clsx('absolute inset-y-0 left-0 w-0.5', selected ? 'bg-primary' : 'bg-transparent')} aria-hidden />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-base font-semibold">{entry.title}</span>
                          <span className="truncate text-meta text-muted">{entry.meta}</span>
                        </span>
                        {selected && <CornerDownLeft size={14} strokeWidth={1.8} className="shrink-0 text-faint" aria-hidden />}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex h-ctl shrink-0 items-center justify-between border-t border-border bg-page px-4 text-caption text-muted">
            <span>↑ ↓ move · Enter open · Esc close</span>
            <span>
              {results.length} result{results.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      )}
    </dialog>
  );
}

import { clsx } from 'clsx';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PrimaryScope } from '@/lib/primary-scope';
import { nextSort, sortRows, type SortState } from '@/lib/sort';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** CSS width ("108px"). Leave one column without a width to take the remaining space. */
  width?: string;
  align?: 'left' | 'right';
  /** Providing this makes the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Extra classes on body cells: `text-muted` for secondary columns, `font-semibold` for totals. */
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  /** Accessible name for the table. */
  label: string;

  /** Controlled sort. Omit both to let the table sort client-side on its own. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Rows arrive already sorted (server-side); the table only renders the header state. */
  manualSort?: boolean;

  selectable?: boolean;
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  /** Rendered in the bar that appears above the header while rows are selected. Its own primary scope. */
  bulkActions?: (ids: string[]) => ReactNode;
  /** "5 GRNs selected" */
  selectionLabel?: (count: number) => string;
  bulkNote?: ReactNode;

  loading?: boolean;
  skeletonRows?: number;
  /** Shown instead of rows when there are none. Defaults to a plain EmptyState. */
  empty?: ReactNode;
  /** Usually <Pagination />. */
  footer?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Below this width (px) the table scrolls horizontally inside its card instead of squashing columns. */
  minWidth?: number;
  className?: string;
}

/**
 * The card table from the GRN mockup: 34px uppercase header on page-grey, 38px rows with divider lines,
 * checkbox column, selected rows tinted #FFF7F7, and a bulk-action bar above the header while rows are selected.
 */
export function DataTable<T>(props: DataTableProps<T>) {
  const { columns, rows, getRowId, label, selectable, loading, skeletonRows = 8, footer, onRowClick, className } = props;

  // Sort: controlled if onSortChange is given, otherwise internal.
  const [internalSort, setInternalSort] = useState<SortState | null>(null);
  const sort = props.onSortChange ? (props.sort ?? null) : internalSort;
  const setSort = props.onSortChange ?? setInternalSort;

  const visibleRows = useMemo(() => {
    if (!sort || props.manualSort) return rows;
    const col = columns.find((c) => c.id === sort.columnId);
    return col?.sortValue ? sortRows(rows, col.sortValue, sort.direction) : rows;
  }, [rows, columns, sort, props.manualSort]);

  // Selection: controlled if onSelectionChange is given, otherwise internal.
  const [internalSel, setInternalSel] = useState<Set<string>>(new Set());
  const selected = props.onSelectionChange ? (props.selectedIds ?? new Set<string>()) : internalSel;
  const setSelected = props.onSelectionChange ?? setInternalSel;

  const visibleIds = visibleRows.map(getRowId);
  const selectedVisible = visibleIds.filter((id) => selected.has(id)).length;
  const allChecked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
  const someChecked = selectedVisible > 0 && !allChecked;

  const headerBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = someChecked;
  }, [someChecked]);

  function toggleAll() {
    const next = new Set(selected);
    if (allChecked) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    setSelected(next);
  }

  function toggleRow(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const selectedIds = [...selected];
  const colCount = columns.length + (selectable ? 1 : 0);

  return (
    <section className={clsx('overflow-hidden rounded-lg border border-border bg-card', className)}>
      {selectable && selectedIds.length > 0 && (
        <PrimaryScope name="bulk-actions">
          <div className="flex min-h-12.5 flex-wrap items-center gap-2 border-b border-border bg-page px-3.5 py-2" role="toolbar" aria-label="Bulk actions">
            <span className="mr-1.5 text-base font-semibold">
              {props.selectionLabel?.(selectedIds.length) ?? `${selectedIds.length} selected`}
            </span>
            {props.bulkActions?.(selectedIds)}
            <button type="button" onClick={() => setSelected(new Set())} className="ml-1 text-sm font-semibold text-muted hover:text-ink">
              Clear
            </button>
            {props.bulkNote && <span className="ml-auto text-meta text-faint">{props.bulkNote}</span>}
          </div>
        </PrimaryScope>
      )}

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse" style={{ minWidth: props.minWidth }} aria-label={label} aria-busy={loading || undefined}>
          <colgroup>
            {selectable && <col style={{ width: 36 }} />}
            {columns.map((c) => (
              <col key={c.id} style={c.width ? { width: c.width } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr className="h-row-head border-b border-border bg-page">
              {selectable && (
                <th scope="col" className="pl-3 text-left">
                  <input
                    ref={headerBox}
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={allChecked}
                    onChange={toggleAll}
                    disabled={loading || visibleIds.length === 0}
                    className="m-0 align-middle"
                  />
                </th>
              )}
              {columns.map((c) => {
                const active = sort?.columnId === c.id ? sort.direction : null;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : undefined}
                    className={clsx('label-caps whitespace-nowrap px-2 font-semibold', c.align === 'right' ? 'text-right' : 'text-left')}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => setSort(nextSort(sort, c.id))}
                        className={clsx(
                          'inline-flex items-center gap-1 uppercase tracking-label hover:text-ink',
                          c.align === 'right' && 'flex-row-reverse',
                          active && 'text-ink',
                        )}
                      >
                        {c.header}
                        {active === 'asc' ? (
                          <ChevronUp size={12} strokeWidth={2} aria-hidden />
                        ) : active === 'desc' ? (
                          <ChevronDown size={12} strokeWidth={2} aria-hidden />
                        ) : (
                          <ChevronsUpDown size={12} strokeWidth={2} className="text-faint" aria-hidden />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="text-sm tabular-nums">
            {loading ? (
              Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={i} className="h-row border-b border-divider">
                  {selectable && <td className="pl-3" />}
                  {columns.map((c) => (
                    <td key={c.id} className="px-2">
                      <Skeleton className={clsx('h-3', c.align === 'right' ? 'ml-auto w-14' : 'w-3/4')} />
                    </td>
                  ))}
                </tr>
              ))
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={colCount}>{props.empty ?? <EmptyState title="Nothing to show" description="No records match the current filters." />}</td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const id = getRowId(row);
                const isSelected = selectable && selected.has(id);
                return (
                  <tr
                    key={id}
                    aria-selected={selectable ? isSelected : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={clsx(
                      'h-row border-b border-divider transition-colors',
                      isSelected ? 'bg-primary-tint' : 'bg-card hover:bg-page',
                      onRowClick && 'cursor-pointer',
                    )}
                  >
                    {selectable && (
                      <td className="pl-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${id}`} checked={isSelected} onChange={() => toggleRow(id)} className="m-0 align-middle" />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.id}
                        className={clsx('truncate px-2', c.align === 'right' && 'text-right', c.className)}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {footer}
    </section>
  );
}

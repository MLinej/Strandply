export type SortDirection = 'asc' | 'desc';
export interface SortState {
  columnId: string;
  direction: SortDirection;
}

type SortValue = string | number | null | undefined;

const collator = new Intl.Collator('en-IN', { numeric: true, sensitivity: 'base' });

/** Stable sort; null/undefined always last regardless of direction. */
export function sortRows<T>(rows: readonly T[], getValue: (row: T) => SortValue, direction: SortDirection): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: getValue(row) }))
    .sort((a, b) => {
      const av = a.value;
      const bv = b.value;
      if (av == null || bv == null) {
        if (av == null && bv == null) return a.index - b.index;
        return av == null ? 1 : -1;
      }
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : collator.compare(String(av), String(bv));
      return cmp !== 0 ? cmp * sign : a.index - b.index;
    })
    .map((x) => x.row);
}

/** Header click cycles: none → asc → desc → none. */
export function nextSort(current: SortState | null, columnId: string): SortState | null {
  if (!current || current.columnId !== columnId) return { columnId, direction: 'asc' };
  if (current.direction === 'asc') return { columnId, direction: 'desc' };
  return null;
}

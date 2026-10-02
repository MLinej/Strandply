import type { SortState } from '@/lib/sort';

/** Maps table column ids to the API's sort keys, both ways ("-reqNo" ⇄ { columnId: 'reqNo', direction: 'desc' }). */
export function sortMapping(keys: Record<string, string>) {
  return {
    toApi(s: SortState | null): string | undefined {
      return s && keys[s.columnId] ? `${s.direction === 'desc' ? '-' : ''}${keys[s.columnId]}` : undefined;
    },
    fromApi(sort: string): SortState | null {
      if (!sort) return null;
      const desc = sort.startsWith('-');
      const key = desc ? sort.slice(1) : sort;
      const columnId = Object.entries(keys).find(([, v]) => v === key)?.[0];
      return columnId ? { columnId, direction: desc ? 'desc' : 'asc' } : null;
    },
  };
}

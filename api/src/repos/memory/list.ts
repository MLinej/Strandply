import { normalizePaging, type ListQuery, type ListResult } from '../types';

export interface ListSpec<T> {
  searchFields: (keyof T)[];
  sortable: (keyof T)[];
  /** Same syntax as ListQuery.sort. */
  defaultSort: string;
  /** Filter keys that don't map to an equal-to-field match (e.g. date ranges). */
  customFilters?: Record<string, (row: T, value: unknown) => boolean>;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1; // nulls last
  if (b === null || b === undefined) return -1;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
  return a < b ? -1 : 1;
}

/** Search, filter, sort and paginate in memory. Same semantics the D1 repos must provide. */
export function listRows<T extends object, F extends object>(
  source: Iterable<T>,
  query: ListQuery<F>,
  spec: ListSpec<T>,
): ListResult<T> {
  let rows = [...source];

  const q = query.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      spec.searchFields.some((f) => {
        const v = r[f];
        return typeof v === 'string' && v.toLowerCase().includes(q);
      }),
    );
  }

  for (const [key, value] of Object.entries(query.filters ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    const custom = spec.customFilters?.[key];
    rows = custom ? rows.filter((r) => custom(r, value)) : rows.filter((r) => (r as Record<string, unknown>)[key] === value);
  }

  const parse = (s: string) => (s.startsWith('-') ? { field: s.slice(1), dir: -1 } : { field: s, dir: 1 });
  let sort = parse(query.sort ?? spec.defaultSort);
  if (!spec.sortable.includes(sort.field as keyof T)) sort = parse(spec.defaultSort);
  const field = sort.field as keyof T;
  // Insertion order breaks ties, in the sort's direction (so "-createdAt" lists the later-inserted
  // of two same-timestamp rows first, like ORDER BY created_at DESC, rowid DESC). Results are stable across calls.
  rows = rows.map((r, i) => ({ r, i })).sort((x, y) => (compare(x.r[field], y.r[field]) || x.i - y.i) * sort.dir).map((x) => x.r);

  const { page, pageSize } = normalizePaging(query);
  return {
    total: rows.length,
    rows: structuredClone(rows.slice((page - 1) * pageSize, page * pageSize)),
  };
}

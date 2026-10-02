import type { InUseDetails } from '../../../contracts/sampletrack';
import { HttpError } from '../../../lib/errors';
import { MAX_PAGE_SIZE, type ListQuery, type ListResult, type UsageCount } from '../../../repos';

/** Export cap: anything bigger belongs in a report job, not a request. */
export const MAX_EXPORT_ROWS = 20_000;

/** Pages through a list query to get every matching row (for exports). */
export async function collectAll<T, F extends object>(
  list: (q: ListQuery<F>) => Promise<ListResult<T>>,
  query: ListQuery<F>,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const { rows, total } = await list({ ...query, page, pageSize: MAX_PAGE_SIZE });
    out.push(...rows);
    if (out.length >= total || rows.length === 0) break;
    if (out.length >= MAX_EXPORT_ROWS) throw new HttpError(422, 'export_too_large', `Narrow the filters: exports are capped at ${MAX_EXPORT_ROWS} rows`);
  }
  return out;
}

/** Keys of `patch` whose value differs from `before` (undefined = not sent). */
export function changedKeys<T extends object>(before: T, patch: Partial<T>): (keyof T & string)[] {
  return (Object.keys(patch) as (keyof T & string)[]).filter((k) => patch[k] !== undefined && patch[k] !== before[k]);
}

/** 409 when a master record is still referenced, so nothing is ever left pointing at a deleted row. */
export function assertNotInUse(what: string, name: string, usage: UsageCount) {
  if (usage.requests + usage.dispatches === 0) return;
  const parts = [
    usage.requests ? `${usage.requests} request${usage.requests === 1 ? '' : 's'}` : '',
    usage.dispatches ? `${usage.dispatches} dispatch${usage.dispatches === 1 ? '' : 'es'}` : '',
  ].filter(Boolean);
  const details: InUseDetails = { requests: usage.requests, dispatches: usage.dispatches };
  throw new HttpError(409, 'in_use', `${what} "${name}" is used by ${parts.join(' and ')} and cannot be deleted`, details);
}

export const rupees = (paise: number) => Math.round(paise) / 100;

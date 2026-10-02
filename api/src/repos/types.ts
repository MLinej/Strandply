// Shared shapes for every repo. Implementations: ./memory (now), d1 (TODO(d1)).

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type ListQuery } from '../contracts/common';

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type ListQuery, type ListResult } from '../contracts/common';

export function normalizePaging(query: Pick<ListQuery, 'page' | 'pageSize'>): { page: number; pageSize: number } {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(query.pageSize ?? DEFAULT_PAGE_SIZE)));
  return { page, pageSize };
}

/** Thrown by any implementation when a unique constraint is hit. D1 maps SQLITE_CONSTRAINT_UNIQUE to this. */
export class UniqueViolationError extends Error {
  constructor(
    readonly entity: string,
    readonly field: string,
  ) {
    super(`${entity}.${field} must be unique`);
    this.name = 'UniqueViolationError';
  }
}

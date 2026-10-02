// Wire types shared with the web app (import type only).
// Files in src/contracts must not import anything outside this folder.

export interface ListQuery<F extends object = Record<string, never>> {
  /** Case-insensitive substring search over the resource's search fields. */
  q?: string;
  filters?: Partial<F>;
  /** 'field' ascending, '-field' descending. An unknown field falls back to the default. */
  sort?: string;
  /** 1-based. */
  page?: number;
  pageSize?: number;
}

export interface ListResult<T> {
  rows: T[];
  total: number;
}

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

/** Body of every non-2xx JSON response. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

import type { ApiErrorBody, ListQuery } from '@contracts/common';

/** Every non-2xx response from /api, with the server's error code and details. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isApiError = (err: unknown, code?: string): err is ApiError =>
  err instanceof ApiError && (code === undefined || err.code === code);

type QueryValue = string | number | boolean | null | undefined;

/** Turns a ListQuery into URL params: filters are flattened next to q/sort/page/pageSize, and empty values dropped. */
export function toSearchParams(query: Record<string, QueryValue> | ListQuery<object> = {}): URLSearchParams {
  const { filters, ...rest } = query as ListQuery<Record<string, QueryValue>> & Record<string, QueryValue>;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...rest, ...(filters ?? {}) })) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  return params;
}

export function apiUrl(path: string, query?: Record<string, QueryValue> | ListQuery<object>) {
  const qs = toSearchParams(query).toString();
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, QueryValue> | ListQuery<object>;
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const { error } = (await res.json()) as ApiErrorBody;
    return new ApiError(res.status, error.code, error.message, error.details);
  } catch {
    return new ApiError(res.status, 'http_error', res.statusText || `HTTP ${res.status}`);
  }
}

/** JSON request to the API. Sends the session cookie and the CSRF header. Returns undefined for 204. */
export async function api<T>(path: string, { method = 'GET', query, body, form, signal }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'fetch', Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(apiUrl(path, query), {
    method,
    headers,
    credentials: 'same-origin',
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    signal,
  });
  if (!res.ok) throw await toApiError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Downloads a file endpoint (xlsx exports and templates) and saves it under the server's filename. */
export async function downloadFile(path: string, query?: Record<string, QueryValue> | ListQuery<object>): Promise<string> {
  const res = await fetch(apiUrl(path, query), {
    headers: { 'X-Requested-With': 'fetch' },
    credentials: 'same-origin',
  });
  if (!res.ok) throw await toApiError(res);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'download.xlsx';
  const url = URL.createObjectURL(await res.blob());
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return name;
}

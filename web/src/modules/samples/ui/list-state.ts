import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

/**
 * List state kept in the URL (?q=&page=&status=…), so links from Home ("?status=Pending",
 * "?overdue=true") open the right view and Back/Forward and reloads keep it.
 * Any change other than `page` resets to page 1.
 */
export function useUrlState<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const get = (k: K | 'page' | 'q' | 'sort') => params.get(k) ?? '';
  const values = Object.fromEntries(keys.map((k) => [k, get(k)])) as Record<K, string>;
  const page = Math.max(1, Number(get('page')) || 1);

  function set(patch: Partial<Record<K | 'q' | 'sort' | 'page' | 'open', string | number | null>>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === undefined || v === '') next.delete(k);
          else next.set(k, String(v));
        }
        if (!('page' in patch)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  return { values, q: get('q'), sort: get('sort'), page, open: params.get('open'), set };
}

/** The value after it has stopped changing for `ms` (for search boxes). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * A search box bound to ?q=: the box updates at once, the URL (and so the query) 300 ms after
 * typing stops. Returns [text, setText].
 */
export function useSearchParam(url: { q: string; set: (patch: { q: string | null }) => void }) {
  const [text, setText] = useState(url.q);
  const debounced = useDebounced(text);
  useEffect(() => {
    if (debounced !== url.q) url.set({ q: debounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- url.set is recreated each render; only the text matters
  }, [debounced]);
  // Follow outside changes (e.g. "Clear filters").
  useEffect(() => {
    if (url.q !== debounced) setText(url.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url.q]);
  return [text, setText] as const;
}

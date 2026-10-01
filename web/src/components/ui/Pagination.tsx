import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  page: number; // 1-based
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** Page numbers with ellipses: 1 … 4 5 6 … 12 */
export function pageList(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

const SQUARE = 'flex h-7.5 min-w-7.5 items-center justify-center rounded-pager border px-1.5 text-sm tabular-nums';

/** Table footer, 52px: "Showing 1–15 of 43" on the left, 30px page squares on the right. */
export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Pagination" className="flex h-13 items-center justify-between gap-3 px-3.5 text-sm text-muted">
      <span>
        Showing {from}–{to} of {total}
      </span>
      <div className="flex gap-1.5">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={clsx(SQUARE, 'border-border bg-card text-muted hover:text-ink disabled:text-faint disabled:hover:text-faint')}
        >
          <ChevronLeft size={14} strokeWidth={1.8} aria-hidden />
        </button>
        {pageList(page, pageCount).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="flex w-5 items-center justify-center text-faint">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPageChange(p)}
              className={clsx(
                SQUARE,
                p === page ? 'border-primary bg-primary-light font-semibold text-primary' : 'border-border bg-card text-ink hover:bg-page',
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className={clsx(SQUARE, 'border-border bg-card text-muted hover:text-ink disabled:text-faint disabled:hover:text-faint')}
        >
          <ChevronRight size={14} strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    </nav>
  );
}

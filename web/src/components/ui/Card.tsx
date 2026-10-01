import { clsx } from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  /** Right side of the header: pills, links, a secondary button. */
  actions?: ReactNode;
  /** No body padding: for tables and lists that run edge to edge (Pending my action). */
  flush?: boolean;
}

/**
 * White surface, 1px border, 12px radius.
 * Padded cards inset everything 16px × 18px (Alerts). Flush cards put the header at 16px × 20px
 * and let rows run edge to edge (Pending my action).
 */
export function Card({ title, description, actions, flush, className, children, ...rest }: CardProps) {
  const hasHeader = title || actions;
  return (
    <section className={clsx('overflow-hidden rounded-lg border border-border bg-card', className)} {...rest}>
      {hasHeader && (
        <header className={clsx('flex items-center justify-between gap-3', flush ? 'px-5 py-4' : 'px-4.5 pb-3 pt-4')}>
          <div className="flex min-w-0 flex-col gap-0.5">
            {title && <h2 className="text-title font-semibold text-ink">{title}</h2>}
            {description && <p className="text-meta text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={clsx(!flush && (hasHeader ? 'px-4.5 pb-4' : 'px-4.5 py-4'))}>{children}</div>
    </section>
  );
}

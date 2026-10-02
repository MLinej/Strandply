import type { ReactNode } from 'react';

/** Page title, one-line description and the right-hand actions (one primary at most). */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1 font-bold tracking-tight">{title}</h1>
        {description && <p className="text-base text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

import { clsx } from 'clsx';
import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Usually one secondary button ("Clear filters"). Use primary only if nothing else on the screen is. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={clsx('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-muted">
        <Icon size={18} strokeWidth={1.8} aria-hidden />
      </div>
      <p className="text-title font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-base text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

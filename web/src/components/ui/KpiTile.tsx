import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { TONE_CLASSES } from '@/lib/status';
import { Skeleton } from './Skeleton';

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  icon?: LucideIcon;
  /**
   * `bad` tints the icon circle red and, in the compact form, colours the value and border.
   * Use it on ONE tile per group: the figure that needs attention (Payables due, ITC at risk, Overdue).
   * `warn` is the amber equivalent.
   */
  emphasis?: 'bad' | 'warn' | 'good';
  /** default: icon circle, 22px value (Home). compact: no icon, 20px value (Sales dashboard). */
  variant?: 'default' | 'compact';
  loading?: boolean;
  className?: string;
}

const CIRCLE = {
  none: TONE_CLASSES.neutral,
  bad: TONE_CLASSES.red,
  warn: TONE_CLASSES.amber,
  good: TONE_CLASSES.green,
};

export function KpiTile({ label, value, meta, icon: Icon, emphasis, variant = 'default', loading, className }: KpiTileProps) {
  if (variant === 'compact') {
    return (
      <div
        className={clsx(
          'flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-3.5 py-3',
          emphasis === 'bad' ? 'border-primary-border' : 'border-border',
          className,
        )}
      >
        <div className="truncate text-label-sm font-medium uppercase tracking-label text-faint">{label}</div>
        {loading ? (
          <Skeleton className="h-6 w-20" />
        ) : (
          <div
            className={clsx(
              'whitespace-nowrap text-kpi-sm font-bold tabular-nums',
              emphasis === 'bad' ? 'text-primary' : emphasis === 'warn' ? 'text-amber' : 'text-ink',
            )}
          >
            {value}
          </div>
        )}
        {meta && <div className="truncate text-caption text-muted">{meta}</div>}
      </div>
    );
  }

  return (
    <div className={clsx('flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4', className)}>
      {Icon && (
        <div className={clsx('flex h-8.5 w-8.5 items-center justify-center rounded-full', CIRCLE[emphasis ?? 'none'])}>
          <Icon size={16} strokeWidth={1.8} aria-hidden />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <div className="truncate text-label font-medium uppercase tracking-label text-faint">{label}</div>
        {loading ? (
          <Skeleton className="h-7 w-28" />
        ) : (
          <div className="whitespace-nowrap text-kpi font-bold tabular-nums text-ink">{value}</div>
        )}
        {meta && <div className="truncate text-meta text-muted">{meta}</div>}
      </div>
    </div>
  );
}

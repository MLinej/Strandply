import { clsx } from 'clsx';

/** Loading placeholder. Size it with utility classes: <Skeleton className="h-4 w-24" />. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={clsx('block animate-pulse rounded-sm bg-divider', className)} />;
}

/** A paragraph of placeholder lines; the last one is shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden className={clsx('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={clsx('h-3', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </span>
  );
}

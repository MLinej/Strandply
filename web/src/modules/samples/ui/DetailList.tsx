import { clsx } from 'clsx';
import type { ReactNode } from 'react';

/** Label/value grid used in detail views. `wide` items span the full row. */
export function DetailList({ items, cols = 2 }: { items: { label: string; value: ReactNode; wide?: boolean }[]; cols?: 2 | 3 }) {
  return (
    <dl className={clsx('grid gap-x-6 gap-y-2.5 text-base', cols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2')}>
      {items.map((i) => (
        <div key={i.label} className={clsx('flex min-w-0 flex-col gap-0.5', i.wide && 'col-span-full')}>
          <dt className="text-label font-semibold uppercase tracking-label text-faint">{i.label}</dt>
          <dd className="break-words text-ink">{i.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

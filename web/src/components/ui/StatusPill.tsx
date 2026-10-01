import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { STATUS_TONE, TONE_CLASSES, type Status, type Tone } from '@/lib/status';

const PILL = 'inline-flex items-center whitespace-nowrap rounded-full px-2.5 text-label font-semibold';

/** Workflow status. The colour comes from lib/status.ts; screens never choose it. */
export function StatusPill({ status, className }: { status: Status; className?: string }) {
  return <span className={clsx(PILL, 'h-5', TONE_CLASSES[STATUS_TONE[status]], className)}>{status}</span>;
}

/** Free-form pill for counts and flags ("7 overdue", "322 in all"). md is 22px, as in card headers. */
export function Pill({ tone = 'neutral', size = 'sm', children, className }: { tone?: Tone; size?: 'sm' | 'md'; children: ReactNode; className?: string }) {
  return <span className={clsx(PILL, size === 'sm' ? 'h-5' : 'h-5.5', TONE_CLASSES[tone], className)}>{children}</span>;
}

import { clsx } from 'clsx';
import { AlertTriangle, Check, RotateCcw } from 'lucide-react';
import type { OffPathEvent, TimelineStep } from '@contracts/sampletrack';

const at = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(/\bSep\b/, 'Sept');

/**
 * The tracking timeline (legacy viewTrackDetail): the six path steps with their times from
 * history, then the off-path events (Delayed, Returned).
 */
export function StatusTimeline({ timeline, offPath }: { timeline: TimelineStep[]; offPath: OffPathEvent[] }) {
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col">
        {timeline.map((s, i) => (
          <li key={s.status} className="relative flex gap-3 pb-4 last:pb-0">
            {i < timeline.length - 1 && (
              <span aria-hidden className={clsx('absolute left-[11px] top-6 h-[calc(100%-20px)] w-0.5', s.state === 'done' ? 'bg-green' : 'bg-divider')} />
            )}
            <span
              aria-hidden
              className={clsx(
                'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                s.state === 'done' && 'border-green bg-green text-card',
                s.state === 'current' && 'border-primary bg-primary-light',
                s.state === 'pending' && 'border-border bg-card',
              )}
            >
              {s.state === 'done' ? <Check size={13} strokeWidth={3} /> : s.state === 'current' ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
            </span>
            <span className="flex min-w-0 flex-col pt-0.5">
              <span className={clsx('text-base', s.state === 'pending' ? 'text-muted' : 'font-semibold text-ink')}>
                {s.status}
                <span className="sr-only"> ({s.state})</span>
              </span>
              <span className="text-caption text-faint">
                {s.at ? `${at(s.at)}${s.by ? ` · ${s.by}` : ''}` : s.state === 'done' ? 'Skipped' : s.state === 'current' ? 'Now' : 'Pending'}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {offPath.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-divider pt-3">
          {offPath.map((e, i) => (
            <li key={`${e.status}-${i}`} className={clsx('flex items-start gap-2 rounded px-2.5 py-1.5 text-base', e.current ? 'bg-primary-tint' : 'bg-page')}>
              {e.status === 'Delayed' ? (
                <AlertTriangle size={15} strokeWidth={1.8} className={clsx('mt-0.5 shrink-0', e.current ? 'text-primary' : 'text-amber')} aria-hidden />
              ) : (
                <RotateCcw size={15} strokeWidth={1.8} className="mt-0.5 shrink-0 text-muted" aria-hidden />
              )}
              <span className="min-w-0">
                <span className="font-semibold">{e.status}</span>
                {e.current && <span className="ml-1.5 text-caption font-semibold text-primary">current</span>}
                <span className="block text-caption text-faint">
                  {at(e.at)}
                  {e.by ? ` · ${e.by}` : ''}
                  {e.note ? ` · ${e.note}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

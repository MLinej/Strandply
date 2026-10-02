import { clsx } from 'clsx';
import { AlertTriangle, Building2, CheckCircle2, ChevronRight, ClipboardCheck, Package, Truck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { DashboardWidgets, StatusSlice, TrendPoint } from '@contracts/sampletrack';
import { useSession } from '@/app/session';
import { Card, EmptyState, KpiTile, Skeleton, StatusPill } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { toneFor, type Tone } from '@/lib/status';
import { useDashboard } from '../api';
import { PageHeader } from '../ui/PageHeader';

const WIDGETS: { key: keyof DashboardWidgets; label: string; meta: string; icon: typeof Truck }[] = [
  { key: 'total', label: 'Dispatches', meta: 'All time', icon: Truck },
  { key: 'pending', label: 'Requests pending', meta: 'Waiting for approval', icon: ClipboardCheck },
  { key: 'delivered', label: 'Delivered', meta: 'Dispatches delivered', icon: CheckCircle2 },
  { key: 'delayed', label: 'Delayed', meta: 'Dispatches marked delayed', icon: AlertTriangle },
  { key: 'parties', label: 'Parties', meta: 'Customers and leads', icon: Building2 },
  { key: 'couriers', label: 'Couriers', meta: 'In the courier master', icon: Package },
];

/** A round axis maximum: 1, 2, 5 × 10ⁿ. */
function niceMax(n: number) {
  if (n <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= n)!;
}

const SERIES = [
  { key: 'dispatched' as const, label: 'Dispatched', className: 'bg-chart-s1' },
  { key: 'delivered' as const, label: 'Delivered', className: 'bg-chart-s2' },
];

/**
 * Dispatched vs delivered for the last six months (computed from dates on the server).
 * Grouped bars with a 2px gap, 4px rounded tops on the baseline, a legend, a hover readout per
 * month and a table view (series 2 is under 3:1 on white).
 */
function TrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = niceMax(Math.max(0, ...points.flatMap((p) => [p.dispatched, p.delivered])));
  const ticks = [max, max / 2, 0];
  const empty = points.every((p) => p.dispatched === 0 && p.delivered === 0);
  return (
    <Card
      title="Dispatched vs delivered"
      description="Last six months, by dispatch date and delivery date"
      actions={
        <button type="button" className="text-sm font-semibold text-muted hover:text-ink" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      }
    >
      <ul className="mb-3 flex gap-4 text-sm text-muted" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className={clsx('h-2.5 w-2.5 rounded-sm', s.className)} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
      {asTable ? (
        <table className="w-full text-base">
          <thead>
            <tr className="h-row-head border-y border-divider bg-page text-left text-label font-semibold uppercase tracking-label text-muted">
              <th className="px-3 font-semibold">Month</th>
              <th className="px-3 text-right font-semibold">Dispatched</th>
              <th className="px-3 text-right font-semibold">Delivered</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.month} className="h-row border-b border-divider">
                <td className="px-3">{p.label}</td>
                <td className="px-3 text-right tabular-nums">{p.dispatched}</td>
                <td className="px-3 text-right tabular-nums">{p.delivered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          {empty && <p className="absolute inset-x-0 top-12 z-10 text-center text-base text-muted">No dispatches in the last six months.</p>}
          <div className="flex h-48 gap-2" role="img" aria-label={`Dispatched vs delivered by month: ${points.map((p) => `${p.label} ${p.dispatched} dispatched, ${p.delivered} delivered`).join('; ')}`}>
            <div className="flex w-6 flex-col justify-between pb-6 text-right text-caption tabular-nums text-faint" aria-hidden>
              {ticks.map((t) => (
                <span key={t} className="-translate-y-1.5">
                  {t}
                </span>
              ))}
            </div>
            <div className="relative flex flex-1 flex-col">
              {/* Recessive gridlines at the ticks. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between" aria-hidden>
                {ticks.map((t) => (
                  <span key={t} className={clsx('h-px', t === 0 ? 'bg-border' : 'bg-divider')} />
                ))}
              </div>
              <div className="relative flex flex-1 items-end">
                {points.map((p, i) => (
                  <div
                    key={p.month}
                    className="relative flex h-full flex-1 cursor-default flex-col items-center justify-end"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {hover === i && (
                      <div className="absolute bottom-full z-20 mb-1 whitespace-nowrap rounded border border-border bg-card px-2.5 py-1.5 text-sm shadow-overlay" role="tooltip">
                        <div className="font-semibold">{p.label}</div>
                        {SERIES.map((s) => (
                          <div key={s.key} className="flex items-center gap-1.5 text-muted">
                            <span className={clsx('h-2 w-2 rounded-sm', s.className)} aria-hidden />
                            {s.label} <span className="ml-auto pl-3 font-semibold tabular-nums text-ink">{p[s.key]}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className={clsx('flex h-full w-full items-end justify-center gap-0.5 rounded-sm', hover === i && 'bg-page')}>
                      {SERIES.map((s) => (
                        <span
                          key={s.key}
                          className={clsx('w-3.5 rounded-t-[4px]', s.className, hover !== null && hover !== i && 'opacity-50')}
                          style={{ height: `${(p[s.key] / max) * 100}%`, minHeight: p[s.key] ? 2 : 0 }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex h-6 items-end" aria-hidden>
                {points.map((p) => (
                  <span key={p.month} className="flex-1 text-center text-caption text-muted">
                    {p.label.split(' ')[0]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Solid bar colour for each status tone (the pills use the light tints). */
const BAR: Record<Tone, string> = { neutral: 'bg-faint', amber: 'bg-amber', purple: 'bg-purple', green: 'bg-green', red: 'bg-primary' };

/** Status breakdown: one labelled bar per status (status colours always come with their label). */
function StatusChart({ slices, breakdown }: { slices: StatusSlice[]; breakdown: { dispatches: number; requests: number } }) {
  const max = Math.max(1, ...slices.map((s) => s.count));
  return (
    <Card title="By status" description={`Pending includes ${breakdown.requests} pending request${breakdown.requests === 1 ? '' : 's'}, as in the old dashboard`}>
      <ul className="flex flex-col gap-2.5">
        {slices.map((s) => (
          <li key={s.status} className="grid grid-cols-[96px_minmax(0,1fr)_40px] items-center gap-3 text-base">
            <span className="text-muted">{s.status}</span>
            <span className="h-3 rounded-sm bg-page">
              <span className={clsx('block h-full rounded-sm', BAR[toneFor(s.status)])} style={{ width: `${(s.count / max) * 100}%`, minWidth: s.count ? 4 : 0 }} />
            </span>
            <span className="text-right font-semibold tabular-nums">{s.count}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** A list row that links only when the user can open the target page. */
function RowLink({ to, children }: { to: string | null; children: ReactNode }) {
  const cls = 'flex items-center gap-3 px-5 py-2.5';
  return to ? (
    <Link to={to} className={`${cls} hover:bg-page`}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}

/** Samples dashboard (legacy renderDashboard / drawCharts), role-aware and live. */
export function DashboardPage() {
  const { canDo, can } = useSession();
  const q = useDashboard();
  const d = q.data;
  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader title="Samples dashboard" description={`Live figures for your role · ${today}`} />
      {!d ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          {d.visibleWidgets.length > 0 && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {WIDGETS.filter((w) => d.widgets[w.key] !== undefined).map((w) => (
                <KpiTile key={w.key} label={w.label} value={d.widgets[w.key]!} meta={w.meta} icon={w.icon} emphasis={w.key === 'delayed' && d.widgets.delayed ? 'bad' : undefined} />
              ))}
            </div>
          )}
          {d.charts && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <TrendChart points={d.charts.trend} />
              <StatusChart slices={d.charts.statusDistribution} breakdown={d.charts.pendingBreakdown} />
            </div>
          )}
          {(d.recentDispatches || d.pendingRequests) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {d.recentDispatches && (
                <Card
                  flush
                  title="Recent dispatches"
                  actions={
                    can('samples.dispatch') && (
                      <Link to="/samples/dispatch" className="inline-flex items-center text-sm font-semibold text-muted hover:text-ink">
                        All <ChevronRight size={13} strokeWidth={2} aria-hidden />
                      </Link>
                    )
                  }
                >
                  {d.recentDispatches.length === 0 ? (
                    <EmptyState icon={Truck} title="No dispatches yet" />
                  ) : (
                    <ul>
                      {d.recentDispatches.map((r) => (
                        <li key={r.id} className="border-t border-divider">
                          <RowLink to={can('samples.dispatch') ? `/samples/dispatch?open=${r.id}` : can('samples.tracking') ? `/samples/tracking?open=${r.id}` : null}>
                            <span className="w-20 shrink-0 whitespace-nowrap font-semibold">{r.dspNo}</span>
                            <span className="min-w-0 flex-1 truncate">
                              {r.partyName}
                              {r.partyCity && <span className="text-faint"> · {r.partyCity}</span>}
                            </span>
                            <StatusPill status={r.status} />
                          </RowLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
              {d.pendingRequests && (
                <Card
                  flush
                  title="Pending requests"
                  actions={
                    can('samples.requests') && (
                      <Link to="/samples/requests?status=Pending" className="inline-flex items-center text-sm font-semibold text-muted hover:text-ink">
                        All <ChevronRight size={13} strokeWidth={2} aria-hidden />
                      </Link>
                    )
                  }
                >
                  {d.pendingRequests.length === 0 ? (
                    <EmptyState icon={ClipboardCheck} title="Nothing pending" />
                  ) : (
                    <ul>
                      {d.pendingRequests.map((r) => (
                        <li key={r.id} className="border-t border-divider">
                          <RowLink to={can('samples.requests') ? `/samples/requests?open=${r.id}` : null}>
                            <span className="w-20 shrink-0 whitespace-nowrap font-semibold">{r.reqNo}</span>
                            <span className="min-w-0 flex-1 truncate">
                              {r.partyName} <span className="text-faint">· {formatDate(r.date)}</span>
                            </span>
                            <StatusPill status={r.priority} />
                          </RowLink>
                        </li>
                      ))}
                    </ul>
                  )}
                  {canDo('approve') && d.pendingRequests.length > 0 && <p className="border-t border-divider px-5 py-2.5 text-caption text-faint">You can approve these from Sample requests.</p>}
                </Card>
              )}
            </div>
          )}
          {!d.charts && !d.recentDispatches && !d.pendingRequests && d.visibleWidgets.length === 0 && (
            <Card>
              <EmptyState icon={Package} title="Nothing on your dashboard" description="Your role has no dashboard widgets. Ask the administrator if you need some." />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

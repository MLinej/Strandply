import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { AlertCircle, AlertTriangle, ChevronRight, Info, ListChecks } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { ListResult, NotificationView } from '@contracts/sampletrack';
import { api } from '@/api/client';
import { FirmSwitcher } from '@/app/FirmSwitcher';
import { pagePath } from '@/app/modules';
import { useSession } from '@/app/session';
import { Card, EmptyState, KpiTile, Pill, Skeleton } from '@/components/ui';
import { timeAgo } from '@/lib/format';
import { stKeys } from '../samples/api/keys';
import { useSamplesHome } from '../samples/home';
import type { ModuleHome, PendingItem } from './contributions';

function greeting(hour: number) {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

const today = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Every module's Home hook, in sidebar order. A module adds one line here when it ships. */
function useContributions(): ModuleHome[] {
  const samples = useSamplesHome();
  return [samples].filter((c): c is ModuleHome => c !== null);
}

const PENDING_SHOWN = 8;

function PendingCard({ items, loading }: { items: (PendingItem & { moduleLabel: string })[]; loading: boolean }) {
  const [all, setAll] = useState(false);
  const overdue = items.filter((i) => i.critical).reduce((a, i) => a + i.count, 0);
  const total = items.reduce((a, i) => a + i.count, 0);
  // Critical first, then by count.
  const sorted = [...items].sort((a, b) => Number(!!b.critical) - Number(!!a.critical) || b.count - a.count);
  const shown = all ? sorted : sorted.slice(0, PENDING_SHOWN);
  return (
    <Card
      flush
      title="Pending my action"
      actions={
        items.length > 0 && (
          <div className="flex gap-1.5">
            {overdue > 0 && (
              <Pill tone="red" size="md">
                {overdue} overdue
              </Pill>
            )}
            <Pill size="md">{total} in all</Pill>
          </div>
        )
      }
    >
      {loading && items.length === 0 ? (
        <div className="flex flex-col gap-3 p-5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nothing waiting for you" description="Approvals and overdue items for your role show up here." />
      ) : (
        <table className="w-full text-base">
          <thead>
            <tr className="h-row-head border-y border-divider bg-page text-left text-label font-semibold uppercase tracking-label text-muted">
              <th className="px-5 font-semibold">Item</th>
              <th className="px-3 font-semibold">Module</th>
              <th className="px-3 text-right font-semibold">Count</th>
              <th className="w-20 px-5" aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id} className="h-row border-b border-divider last:border-b-0">
                <td className="px-5">
                  <span className="flex items-center gap-2">
                    <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', i.critical ? 'bg-primary' : 'bg-transparent')} aria-hidden />
                    <span className={i.critical ? 'font-semibold text-primary' : 'font-medium text-ink'}>{i.label}</span>
                  </span>
                </td>
                <td className="px-3 text-muted">{i.moduleLabel}</td>
                <td className="px-3 text-right font-semibold tabular-nums">{i.count}</td>
                <td className="px-5 text-right">
                  <Link to={i.href} className="inline-flex items-center gap-0.5 font-semibold text-ink hover:underline">
                    Open <ChevronRight size={14} strokeWidth={2} aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
          {sorted.length > PENDING_SHOWN && (
            <tfoot>
              <tr>
                <td colSpan={4} className="h-13 border-t border-divider text-center">
                  <button type="button" className="text-base font-semibold text-muted hover:text-ink" onClick={() => setAll((v) => !v)}>
                    {all ? 'Show fewer' : `Show ${sorted.length - PENDING_SHOWN} more`}
                  </button>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </Card>
  );
}

const ALERT_ICON = { danger: AlertCircle, warning: AlertTriangle, info: Info, success: Info } as const;
const ALERT_TONE = { danger: 'text-primary', warning: 'text-amber', info: 'text-purple', success: 'text-green' } as const;
const ALERTS_QUERY = { pageSize: 4, filters: { unread: true } } as const;

function notificationHref(n: NotificationView) {
  if (n.entityType === 'request') return `/samples/requests?open=${n.entityId}`;
  if (n.entityType === 'dispatch') return `/samples/tracking?open=${n.entityId}`;
  return '/';
}

/** Unread notifications (newest 4), from the notification service. */
function AlertsCard() {
  const { can } = useSession();
  const enabled = can('notifications.view');
  const q = useQuery({
    queryKey: stKeys.notifications.feed(ALERTS_QUERY),
    queryFn: ({ signal }) => api<ListResult<NotificationView>>('/sampletrack/notifications', { query: ALERTS_QUERY, signal }),
    enabled,
    refetchInterval: 30_000,
  });
  if (!enabled) return null;
  const rows = q.data?.rows ?? [];
  return (
    <Card title="Alerts">
      {q.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-base text-muted">No unread alerts.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((n) => {
            const Icon = ALERT_ICON[n.type];
            return (
              <li key={n.id}>
                <Link to={notificationHref(n)} className="flex gap-2.5 hover:underline">
                  <Icon size={16} strokeWidth={1.8} className={clsx('mt-0.5 shrink-0', ALERT_TONE[n.type])} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-base font-medium text-ink">{n.message ?? n.title}</span>
                    <span className="block text-caption text-faint">
                      {n.title} · {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Shortcuts to the built pages this user can open. */
function GoToCard() {
  const { visibleModules } = useSession();
  const pages = visibleModules.flatMap((m) => m.pages.filter((p) => p.built).map((p) => ({ ...p, href: pagePath(m.key, p.slug) })));
  if (pages.length === 0) return null;
  return (
    <Card title="Go to">
      <div className="flex flex-wrap gap-2">
        {pages.map((p) => (
          <Link key={p.href} to={p.href} className="rounded border border-border px-3 py-1.5 text-base font-medium text-ink hover:bg-page">
            {p.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}

/** Home — my work list (design-reference PDF p.2). */
export function HomePage() {
  const { user } = useSession();
  const now = new Date();
  const contributions = useContributions();
  const loading = contributions.some((c) => c.loading);
  const kpis = contributions.flatMap((c) => c.kpis).slice(0, 6);
  const pending = contributions.flatMap((c) => c.pending.map((p) => ({ ...p, moduleLabel: c.label })));
  const glance = contributions.map((c) => c.glance).filter((g) => g !== null);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1 font-bold tracking-tight">
            {greeting(now.getHours())}, {user.name}
          </h1>
          <p className="text-base text-muted">
            Pending approvals, overdue items and today’s figures for your role · {today.format(now).replace(/\bSep\b/, 'Sept')}
          </p>
        </div>
        <FirmSwitcher />
      </div>

      {kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => (
            <KpiTile key={k.id} label={k.label} value={k.value} meta={k.meta} icon={k.icon} emphasis={k.emphasis} />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <PendingCard items={pending} loading={loading} />
        <div className="flex flex-col gap-4">
          <AlertsCard />
          <GoToCard />
        </div>
      </div>

      {glance.length > 0 && (
        <section className="flex flex-col gap-3 pt-2" aria-labelledby="glance-heading">
          <h2 id="glance-heading" className="text-xl font-semibold">
            At a glance
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {glance.map((g) => (
              <Card
                key={g.title}
                title={g.title}
                actions={
                  <Link to={g.href} className="inline-flex items-center text-sm font-semibold text-muted hover:text-ink">
                    Open <ChevronRight size={13} strokeWidth={2} aria-hidden />
                  </Link>
                }
              >
                <dl className="flex flex-col">
                  {g.rows.map((r) => (
                    <div key={r.label} className="flex items-center justify-between border-b border-divider py-2 last:border-b-0">
                      <dt className="text-base text-muted">{r.label}</dt>
                      <dd className={clsx('text-base font-semibold tabular-nums', r.tone === 'bad' ? 'text-primary' : r.tone === 'warn' ? 'text-amber' : 'text-ink')}>
                        {r.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                {g.note && <p className="mt-2 text-caption text-faint">{g.note}</p>}
              </Card>
            ))}
          </div>
          <p className="text-caption text-faint">More cards appear here as each module is rebuilt.</p>
        </section>
      )}
    </div>
  );
}

import type { DashboardData, DashboardWidgets } from '../../../contracts/sampletrack';
import type { PermissionSet, WidgetKey } from '../../../domain/access';
import { businessDateOf, businessToday } from '../../../lib/dates';
import type { Clock } from '../../../lib/clock';
import type { DataLayer } from '../../../repos';
import type { DispatchService } from '../dispatches/dispatch-service';
import { collectAll } from '../masters/common';
import { lastMonths, monthlyTrend, statusDistribution } from './calc';

/** Computed from live data on every call. Only what the role may see is computed and returned. */
export class DashboardService {
  constructor(
    private readonly data: DataLayer,
    private readonly dispatches: DispatchService,
    private readonly clock: Clock,
  ) {}

  async get(perms: PermissionSet): Promise<DashboardData> {
    const { repos } = this.data;
    const today = businessToday(this.clock);
    const full = perms.actions.includes('dashboard_full');
    const allowed = new Set<WidgetKey>(perms.widgets);
    const show = (w: WidgetKey) => allowed.has(w);

    const needDispatchCounts = full || show('total') || show('delivered') || show('delayed');
    const needRequestCounts = full || show('pending');
    const [dispatchCounts, requestCounts] = await Promise.all([
      needDispatchCounts ? repos.dispatches.countByStatus({}) : null,
      needRequestCounts ? repos.requests.countByStatus({}) : null,
    ]);

    const widgets: DashboardWidgets = {};
    if (show('total')) widgets.total = Object.values(dispatchCounts!).reduce((a, b) => a + b, 0);
    if (show('pending')) widgets.pending = requestCounts!.Pending;
    if (show('delivered')) widgets.delivered = dispatchCounts!.Delivered;
    if (show('delayed')) widgets.delayed = dispatchCounts!.Delayed;
    if (show('parties')) widgets.parties = (await repos.parties.list({ pageSize: 1 })).total;
    if (show('couriers')) widgets.couriers = (await repos.couriers.list({ pageSize: 1 })).total;

    const out: DashboardData = { asOf: today, full, widgets, visibleWidgets: [...perms.widgets] };

    if (full || show('total')) {
      const { rows } = await this.dispatches.list({ sort: '-createdAt', pageSize: 5 });
      out.recentDispatches = rows.map(({ id, dspNo, date, partyName, partyCity, status }) => ({ id, dspNo, date, partyName, partyCity, status }));
    }
    if (full || show('pending')) {
      // Oldest first: the requests that have waited longest.
      const { rows } = await repos.requests.list({ filters: { status: 'Pending' }, sort: 'createdAt', pageSize: 5 });
      out.pendingRequests = rows.map(({ id, reqNo, date, partyName, priority }) => ({ id, reqNo, date, partyName, priority }));
    }

    if (full) {
      const months = lastMonths(today, 6);
      const inWindow = await collectAll((q) => repos.dispatches.list(q), { filters: { dateFrom: `${months[0]}-01` } });
      const delivered = await collectAll((q) => repos.dispatches.list(q), { filters: { status: 'Delivered' as const } });
      const at = await repos.dispatches.latestStatusAt('Delivered', delivered.map((d) => d.id));
      const deliveredOn = Object.fromEntries(Object.entries(at).map(([id, ts]) => [id, businessDateOf(ts)]));
      // Delivered dispatches dated before the window can still have been delivered inside it.
      // monthlyTrend only counts "dispatched" for dates inside the window, so including them is safe.
      const rows = [...new Map([...inWindow, ...delivered].map((d) => [d.id, d])).values()];
      const trend = monthlyTrend(months, rows, deliveredOn);
      const { slices, pendingBreakdown } = statusDistribution(dispatchCounts!, requestCounts!.Pending);
      out.charts = { trend, statusDistribution: slices, pendingBreakdown };
    }
    return out;
  }
}

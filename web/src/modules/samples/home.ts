import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardCheck, Layers, Truck } from 'lucide-react';
import type { DashboardData, DispatchView, ListResult, RequestListResult } from '@contracts/sampletrack';
import { api } from '@/api/client';
import { useSession } from '@/app/session';
import { formatCount } from '@/lib/format';
import type { HomeKpi, ModuleHome, PendingItem } from '../home/contributions';
import { stKeys } from './api/keys';

const COUNTS_QUERY = { pageSize: 1 } as const;
const OVERDUE_QUERY = { pageSize: 1, filters: { overdue: true } } as const;
const IN_TRANSIT_QUERY = { pageSize: 1, filters: { status: 'In Transit' } } as const;

/** Samples' part of Home: from the dashboard API, request tab counts and dispatch counts, each only if the user may see it. */
export function useSamplesHome(): ModuleHome | null {
  const { can, canDo } = useSession();
  const seeDashboard = can('samples.view') && can('samples.dashboard');
  const seeRequests = can('samples.view') && can('samples.requests');
  const seeDispatch = can('samples.view') && can('samples.dispatch');

  const dashboard = useQuery({
    queryKey: stKeys.dashboard,
    queryFn: ({ signal }) => api<DashboardData>('/sampletrack/dashboard', { signal }),
    enabled: seeDashboard,
  });
  const requests = useQuery({
    queryKey: stKeys.requests.list(COUNTS_QUERY),
    queryFn: ({ signal }) => api<RequestListResult>('/sampletrack/requests', { query: COUNTS_QUERY, signal }),
    enabled: seeRequests,
  });
  const overdue = useQuery({
    queryKey: stKeys.dispatches.list(OVERDUE_QUERY),
    queryFn: ({ signal }) => api<ListResult<DispatchView>>('/sampletrack/dispatches', { query: OVERDUE_QUERY, signal }),
    enabled: seeDispatch,
  });
  const inTransit = useQuery({
    queryKey: stKeys.dispatches.list(IN_TRANSIT_QUERY),
    queryFn: ({ signal }) => api<ListResult<DispatchView>>('/sampletrack/dispatches', { query: IN_TRANSIT_QUERY, signal }),
    enabled: seeDispatch,
  });

  if (!seeDashboard && !seeRequests && !seeDispatch) return null;

  const w = dashboard.data?.widgets ?? {};
  const counts = requests.data?.counts;
  const overdueCount = overdue.data?.total;

  const kpis: HomeKpi[] = [];
  if (w.pending !== undefined)
    kpis.push({ id: 'st-pending', label: 'Sample requests', value: formatCount(w.pending), meta: 'Pending approval', icon: ClipboardCheck });
  if (overdueCount !== undefined)
    kpis.push({
      id: 'st-overdue',
      label: 'Samples overdue',
      value: formatCount(overdueCount),
      meta: 'Past expected delivery',
      icon: AlertTriangle,
      emphasis: overdueCount > 0 ? 'bad' : undefined,
    });
  else if (w.total !== undefined)
    kpis.push({ id: 'st-total', label: 'Sample dispatches', value: formatCount(w.total), meta: 'All time', icon: Truck });

  const pending: PendingItem[] = [];
  if (overdueCount)
    pending.push({ id: 'st-overdue', label: 'Sample dispatches past expected delivery', count: overdueCount, href: '/samples/dispatch?overdue=true', critical: true });
  if (counts && canDo('approve') && counts.Pending)
    pending.push({ id: 'st-approve', label: 'Sample requests to approve', count: counts.Pending, href: '/samples/requests?status=Pending' });
  if (counts && seeDispatch && canDo('edit') && counts.Approved)
    pending.push({ id: 'st-dispatch', label: 'Samples to dispatch', count: counts.Approved, href: '/samples/requests?status=Approved' });
  if (w.delayed)
    pending.push({ id: 'st-delayed', label: 'Sample dispatches delayed', count: w.delayed, href: '/samples/dispatch?status=Delayed' });

  const rows = [
    ...(w.pending !== undefined ? [{ label: 'Requests pending', value: formatCount(w.pending) }] : []),
    ...(inTransit.data ? [{ label: 'Dispatches in transit', value: formatCount(inTransit.data.total) }] : []),
    ...(w.delayed !== undefined ? [{ label: 'Delayed', value: formatCount(w.delayed), tone: w.delayed ? ('warn' as const) : undefined }] : []),
    ...(w.delivered !== undefined ? [{ label: 'Delivered (all time)', value: formatCount(w.delivered) }] : []),
  ];

  return {
    module: 'samples',
    label: 'Samples',
    loading: dashboard.isLoading || requests.isLoading || overdue.isLoading,
    kpis,
    pending,
    glance: rows.length ? { title: 'Samples', href: seeDashboard ? '/samples/dashboard' : '/samples', rows } : null,
  };
}

export const SamplesIcon = Layers;

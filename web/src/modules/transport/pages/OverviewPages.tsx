import { Download, History, Plus, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { routeOf, type RateComparisonView } from '@contracts/transport';
import type { ActivityEntryView } from '@contracts/admin';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, Pagination, Pill, Skeleton, useToast, type Column } from '@/components/ui';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { BarList } from '../../purchase/ui';
import { exportTransport, useTransportAudit, useTransportDashboard, useTransportReports } from '../api';
import { d, inr, InquiryPill, stamp } from '../ui';

/** Transport dashboard (legacy renderDashboard): the flow in numbers, what waits for approval, recent inquiries. */
export function DashboardPage() {
  const navigate = useNavigate();
  const { canDo } = useSession();
  const v = useTransportDashboard().data;
  if (!v) return <Skeleton className="m-6 h-96" />;
  const tile = (to: string, label: string, value: string, meta: string) => (
    <Link to={`/transport/${to}`} className="block rounded-lg focus-visible:outline focus-visible:outline-2">
      <KpiTile label={label} value={value} meta={meta} />
    </Link>
  );
  const pending: Column<RateComparisonView>[] = [
    { id: 'no', header: 'Approval', width: '120px', className: 'font-mono text-sm font-semibold', cell: (r) => r.approvalNo },
    { id: 'route', header: 'Route', cell: (r) => `${routeOf(r.inquiry.from, r.inquiry.to)} · ${r.inquiry.vehicle}` },
    { id: 'sel', header: 'Selected', width: '200px', cell: (r) => `${inr(r.selectedPaise)} · ${r.quotes[r.selected ?? 0]?.transporterName ?? ''}` },
    { id: 'flag', header: 'Check', width: '120px', cell: (r) => (r.needsJustification ? <Pill tone="amber">Exception</Pill> : <Pill tone="green">Lowest</Pill>) },
  ];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Transport dashboard"
        description="Freight inquiry → rate comparison → approval → order form."
        actions={
          canDo('edit') && (
            <Button variant="primary" icon={Plus} onClick={() => navigate('/transport/inquiries?new=1')}>
              New inquiry
            </Button>
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-4">
        {tile('inquiries?status=open', 'Open inquiries', String(v.open), `${v.inquiries} in all`)}
        {tile('rates?status=draft', 'Draft comparisons', String(v.drafts), 'Not yet submitted')}
        {tile('approvals', 'Waiting for approval', String(v.pendingApproval), 'Freight approvals')}
        {tile('orders?status=issued', 'In transit', String(v.inTransit), `${v.orders} order forms`)}
        {tile('orders', 'Freight this month', inr(v.monthFreightPaise), 'Orders not cancelled')}
        {tile('reports', 'Lowest rate chosen', v.lowestShare === null ? '—' : `${v.lowestShare}%`, 'Of approved comparisons')}
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card title="Waiting for approval" flush>
          <DataTable label="Waiting for approval" columns={pending} rows={v.pending} getRowId={(r) => r.id} minWidth={560} onRowClick={(r) => navigate(`/transport/rates?open=${r.id}`)} empty={<EmptyState icon={History} title="Nothing waiting" />} />
        </Card>
        <Card title="Recent inquiries">
          {v.recentInquiries.length ? (
            <ul className="flex flex-col divide-y divide-divider">
              {v.recentInquiries.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-1.5">
                  <Link to={i.rcId ? `/transport/rates?open=${i.rcId}` : `/transport/rates?inquiry=${i.id}`} className="min-w-0 hover:underline">
                    <span className="font-mono text-sm font-semibold">{i.inqNo}</span> <span className="text-sm">{routeOf(i.from, i.to)}</span>
                    <span className="block text-caption text-muted">
                      {i.material} · {i.vehicle} · {d(i.date)}
                    </span>
                  </Link>
                  <InquiryPill s={i.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No inquiries yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Freight reports (a placeholder in the legacy app): spend by month, transporter, route and vehicle, and how rates were chosen. */
export function ReportsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['from', 'to'] as const);
  const v = url.values;
  const range = { from: v.from || undefined, to: v.to || undefined };
  const r = useTransportReports(range).data;
  const xl = (kind: 'inquiries' | 'orders') => void exportTransport(kind, range).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }));
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Freight reports"
        description="Order forms by date (cancelled ones left out); rate choices from approved comparisons."
        actions={
          canDo('export') && (
            <>
              <Button icon={Download} onClick={() => xl('inquiries')}>
                Inquiries
              </Button>
              <Button icon={Download} onClick={() => xl('orders')}>
                Order forms
              </Button>
            </>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="From date" type="date" value={v.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={v.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
      </div>
      {!r ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiTile label="Order forms" value={String(r.orders)} meta={`${r.delivered} delivered`} />
            <KpiTile label="Freight" value={inr(r.freightPaise)} meta={r.orders ? `${inr(Math.round(r.freightPaise / r.orders))} average` : '—'} />
            <KpiTile label="Lowest rate chosen" value={r.lowestShare === null ? '—' : `${r.lowestShare}%`} meta="Of approved comparisons" />
            <KpiTile label="Exceptions" value={String(r.exceptions)} meta="Not lowest or over budget" />
            <KpiTile label="Saved vs highest quote" value={inr(r.savedVsHighestPaise)} meta="Across approved comparisons" />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <Card title="Freight by month">
              <BarList rows={r.byMonth.map((x) => ({ label: x.name, value: x.value / 100 }))} format={(n) => inr(n * 100)} empty="No order forms" />
            </Card>
            <Card title="By transporter">
              <BarList rows={r.byTransporter.map((x) => ({ label: `${x.name} (${x.orders})`, value: x.freightPaise / 100 }))} format={(n) => inr(n * 100)} empty="No order forms" />
            </Card>
            <Card title="By route and vehicle">
              <table className="w-full text-sm" aria-label="By route and vehicle">
                <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Route</th>
                    <th className="px-3 py-1.5 text-right">Orders</th>
                    <th className="px-3 py-1.5 text-right">Freight</th>
                    <th className="px-3 py-1.5 text-right">Average</th>
                  </tr>
                </thead>
                <tbody>
                  {r.byRoute.map((x) => (
                    <tr key={x.route} className="border-t border-divider">
                      <td className="px-3 py-1.5">{x.route}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{x.orders}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{inr(x.freightPaise)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{inr(x.avgPaise)}</td>
                    </tr>
                  ))}
                  {!r.byRoute.length && (
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-muted">
                        No order forms
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
            <Card title="Order forms by vehicle">
              <BarList rows={r.byVehicle.map((x) => ({ label: x.name, value: x.value }))} format={String} empty="No order forms" />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const AREA: Record<string, string> = { transport_vehicle: 'Vehicle type', transport_transporter: 'Transporter', transport_inquiry: 'Inquiry', transport_rate: 'Rate comparison', transport_order: 'Order form', transport_export: 'Export' };

/** Every transport change, decision, export and print, newest first. */
export function AuditPage() {
  const url = useUrlState([] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useTransportAudit({ q: url.q || undefined, page: url.page });
  const columns: Column<ActivityEntryView>[] = [
    { id: 'when', header: 'When', width: '170px', className: 'text-muted tabular-nums', cell: (a) => stamp(a.createdAt) },
    {
      id: 'who',
      header: 'By',
      width: '170px',
      cell: (a) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{a.userName ?? 'System'}</span>
          {a.userRole && <span className="text-caption text-faint">{a.userRole}</span>}
        </span>
      ),
    },
    { id: 'area', header: 'Area', width: '140px', cell: (a) => <Pill>{AREA[a.entityType ?? ''] ?? a.entityType}</Pill> },
    { id: 'action', header: 'Action', width: '120px', cell: (a) => a.action },
    { id: 'details', header: 'Details', cell: (a) => a.details },
  ];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Transport audit trail" description="Every inquiry, rate comparison, approval, order form, master change, export and print, newest first." />
      <Input aria-label="Search audit trail" icon={Search} placeholder="User or details" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[280px]" />
      <DataTable
        label="Transport audit trail"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(a) => a.id}
        minWidth={900}
        loading={list.isLoading}
        empty={<EmptyState icon={History} title="Nothing recorded yet" />}
        footer={(list.data?.total ?? 0) > 50 && <Pagination page={url.page} pageSize={50} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
    </div>
  );
}

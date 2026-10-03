import { Download, Search, Truck, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { DispatchRow } from '@contracts/sales';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, Pagination, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { BarList } from '../../purchase/ui';
import { exportSales, useDispatchRegister, useFirmFilter } from '../api';
import { DispatchForm } from '../components/DispatchForm';
import { FirmPill, inr, useShowFirm } from '../ui';
import { useToast } from '@/components/ui';

const PAGE_SIZE = 20;

/** Dispatch Register (legacy dispatch_register): orders with a dispatch date or vehicle, with vehicle and transporter totals. */
export function DispatchPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const showFirm = useShowFirm();
  const firm = useFirmFilter();
  const url = useUrlState(['from', 'to'] as const);
  const [search, setSearch] = useSearchParam(url);
  const reg = useDispatchRegister({ firm, q: url.q || undefined, from: url.values.from || undefined, to: url.values.to || undefined, page: url.page, pageSize: PAGE_SIZE }).data;
  const [editing, setEditing] = useState<DispatchRow | null>(null);

  const columns: Column<DispatchRow>[] = [
    {
      id: 'so',
      header: 'SO',
      width: '120px',
      cell: (r) => (
        <Link to={`/sales/orders?open=${r.soId}`} className="font-semibold tabular-nums text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {r.soNo}
        </Link>
      ),
    },
    ...(showFirm ? [{ id: 'firm', header: 'Firm', width: '64px', cell: (r: DispatchRow) => <FirmPill firm={r.firm} /> }] : []),
    {
      id: 'ship',
      header: 'Ship to',
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{r.shipTo}</span>
          {(r.city || r.state) && <span className="text-caption text-faint">{[r.city, r.state].filter(Boolean).join(', ')}</span>}
        </span>
      ),
    },
    { id: 'vehicle', header: 'Vehicle', width: '130px', className: 'tabular-nums', cell: (r) => r.dispatch.vehicleNo ?? '—' },
    { id: 'transporter', header: 'Transporter', width: '220px', className: 'text-sm', cell: (r) => r.dispatch.transporter ?? '—' },
    { id: 'lr', header: 'LR no.', width: '100px', className: 'text-sm tabular-nums', cell: (r) => r.dispatch.lrNo ?? '—' },
    { id: 'driver', header: 'Driver', width: '160px', className: 'text-sm', cell: (r) => [r.dispatch.driverName, r.dispatch.driverMobile].filter(Boolean).join(' · ') || '—' },
    { id: 'date', header: 'Dispatched', width: '110px', className: 'tabular-nums', cell: (r) => (r.dispatch.date ? formatDate(r.dispatch.date) : '—') },
    { id: 'freight', header: 'Freight', width: '110px', align: 'right', className: 'tabular-nums', cell: (r) => (r.freightPaise ? inr(r.freightPaise) : '—') },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Dispatch register"
        description="Orders with dispatch details. Add or change them from the order (Dispatch details)."
        actions={
          canDo('export') && (
            <Button icon={Download} onClick={() => void exportSales('dispatch', { firm, from: url.values.from || undefined, to: url.values.to || undefined }).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
              Excel
            </Button>
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiTile label="Dispatches" value={String(reg?.kpis.dispatches ?? 0)} meta="Orders with dispatch details" />
        <KpiTile label="Freight" value={inr(reg?.kpis.freightPaise ?? 0)} meta="On those orders" />
        <KpiTile label="Vehicles" value={String(reg?.kpis.vehicles ?? 0)} meta="Distinct vehicle numbers" />
        <KpiTile label="Transporters" value={String(reg?.kpis.transporters ?? 0)} meta="Transport partners used" />
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search" icon={Search} placeholder="SO, party, vehicle, transporter, LR" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[280px]" />
        <Input aria-label="From date" type="date" value={url.values.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={url.values.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
        {(url.q || url.values.from || url.values.to) && (
          <Button variant="ghost" size="sm" icon={X} onClick={() => url.set({ q: null, from: null, to: null })}>
            Clear
          </Button>
        )}
      </div>
      <DataTable
        label="Dispatch register"
        columns={columns}
        rows={reg?.rows ?? []}
        getRowId={(r) => r.soId}
        minWidth={1180}
        loading={!reg}
        onRowClick={canDo('edit') ? (r) => setEditing(r) : undefined}
        empty={<EmptyState icon={Truck} title="No dispatches recorded" description="Vehicle and transporter details are added on the sales order." />}
        footer={(reg?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={reg!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card title="Dispatches by vehicle">
          <BarList rows={(reg?.byVehicle ?? []).slice(0, 12).map((v) => ({ label: v.name, value: v.value }))} format={(n) => String(n)} empty="No vehicles recorded" />
        </Card>
        <Card title="Freight by transporter">
          <BarList rows={(reg?.byTransporter ?? []).slice(0, 12).map((v) => ({ label: v.name, value: v.value }))} format={inr} empty="No transporters recorded" />
        </Card>
      </div>
      <DispatchForm order={editing ? { id: editing.soId, soNo: editing.soNo, dispatch: editing.dispatch } : null} onClose={() => setEditing(null)} />
    </div>
  );
}

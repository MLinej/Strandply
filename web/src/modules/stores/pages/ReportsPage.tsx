import { Download, FileClock, Search } from 'lucide-react';
import { STORE_MATERIALS, type GrnView, type PendingReportRow, type StoreMaterial } from '@contracts/stores';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, KpiTile, Select, Tabs, useToast, type Column } from '@/components/ui';
import { errorMessage } from '../../samples/ui/errors';
import { useDebounced, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportAccounting, exportPending, useAccounting, usePendingReport } from '../api';
import { AccountedPill, dateTime, DaysPill, itemsSummary, materialLabel, qtyFmt, stamp } from '../ui';

type Tab = 'pending' | 'accounting';

function PendingTab() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['vendor', 'material', 'minDays'] as const);
  const vendor = useDebounced(url.values.vendor);
  const query = { vendor: vendor || undefined, material: (url.values.material || undefined) as StoreMaterial | undefined, minDays: Number(url.values.minDays) || undefined };
  const report = usePendingReport(query);
  const k = report.data?.kpis;
  const columns: Column<PendingReportRow>[] = [
    { id: 'mrn', header: 'MRN', width: '140px', className: 'font-semibold tabular-nums', cell: (r) => r.mrnNo },
    { id: 'gate', header: 'Gate entry', width: '160px', cell: (r) => dateTime(r.date, r.time) },
    { id: 'vendor', header: 'Vendor', cell: (r) => <span className="block truncate">{r.vendorName}</span> },
    { id: 'vehicle', header: 'Vehicle', width: '120px', className: 'tabular-nums', cell: (r) => r.vehicleNo },
    { id: 'material', header: 'Material', width: '130px', cell: (r) => materialLabel(r.material) },
    { id: 'qty', header: 'Approx qty', width: '120px', align: 'right', className: 'tabular-nums', cell: (r) => `${qtyFmt(r.approxQty)} ${r.unit}` },
    { id: 'guard', header: 'Security', width: '130px', cell: (r) => r.securityName },
    { id: 'days', header: 'Waiting', width: '100px', cell: (r) => <DaysPill days={r.daysPending} /> },
  ];
  return (
    <div className="flex flex-col gap-3.5">
      {k && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile variant="compact" label="Pending items" value={k.items} meta={`Across ${k.mrns} MRN${k.mrns === 1 ? '' : 's'}`} />
          <KpiTile variant="compact" label="Oldest" value={`${k.oldestDays} days`} emphasis={k.oldestDays > 3 ? 'bad' : undefined} />
          <KpiTile variant="compact" label="Average wait" value={`${k.avgDays} days`} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Vendor" icon={Search} placeholder="Vendor name" value={url.values.vendor} onChange={(e) => url.set({ vendor: e.target.value })} containerClassName="w-[220px]" />
        <Select aria-label="Material" placeholder="All materials" options={STORE_MATERIALS.map((m) => ({ value: m.id, label: m.label }))} value={url.values.material} onChange={(e) => url.set({ material: e.target.value })} containerClassName="w-[160px]" />
        <Input aria-label="Minimum days waiting" type="number" min={0} placeholder="Min. days" value={url.values.minDays} onChange={(e) => url.set({ minDays: e.target.value })} containerClassName="w-[120px]" />
        {canDo('export') && (
          <Button icon={Download} className="ml-auto" onClick={() => void exportPending(query).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
            Excel
          </Button>
        )}
      </div>
      <DataTable
        label="MRN items waiting for a GRN"
        columns={columns}
        rows={report.data?.rows ?? []}
        getRowId={(r) => `${r.mrnId}-${r.material}-${r.approxQty}`}
        minWidth={1080}
        loading={report.isLoading}
        empty={<EmptyState icon={FileClock} title="Nothing overdue" description="No gate entry matching these filters is waiting for a GRN." />}
      />
    </div>
  );
}

function AccountingTab() {
  const toast = useToast();
  const { canDo } = useSession();
  const report = useAccounting({});
  const k = report.data?.kpis;
  const columns: Column<GrnView>[] = [
    { id: 'grn', header: 'GRN', width: '150px', className: 'font-semibold tabular-nums', cell: (g) => g.grnNo },
    { id: 'invoice', header: 'Invoice', width: '140px', className: 'tabular-nums', cell: (g) => g.invoiceNo },
    { id: 'vendor', header: 'Vendor', cell: (g) => <span className="block truncate">{g.vendorName}</span> },
    { id: 'items', header: 'Items', width: '180px', cell: (g) => <span className="block truncate">{itemsSummary(g.items)}</span> },
    { id: 'approved', header: 'Approved', width: '170px', className: 'text-sm', cell: (g) => stamp(g.approvedAt) },
    { id: 'status', header: 'Status', width: '160px', cell: (g) => <AccountedPill grn={g} /> },
    { id: 'voucher', header: 'Voucher', width: '140px', className: 'tabular-nums', cell: (g) => g.voucherNo ?? '—' },
  ];
  return (
    <div className="flex flex-col gap-3.5">
      {k && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile variant="compact" label="Accounted" value={k.accounted} />
          <KpiTile variant="compact" label="Pending accounting" value={k.pending} emphasis={k.pending ? 'warn' : undefined} />
          <KpiTile variant="compact" label="Accounted share" value={`${k.pct}%`} />
        </div>
      )}
      {canDo('export') && (
        <div className="flex justify-end">
          <Button icon={Download} onClick={() => void exportAccounting({}).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
            Excel
          </Button>
        </div>
      )}
      <DataTable label="Accounting status" columns={columns} rows={report.data?.rows ?? []} getRowId={(g) => g.id} minWidth={1000} loading={report.isLoading} empty={<EmptyState title="No approved GRNs yet" />} />
    </div>
  );
}

/** Stores reports: MRN prepared but GRN pending, and accounting status (legacy reportPending / reportAccounting). */
export function ReportsPage() {
  const url = useUrlState(['tab'] as const);
  const tab = (url.values.tab || 'pending') as Tab;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Stores reports" description="Deliveries still waiting for receiving, and approved GRNs against the accounts." />
      <Tabs<Tab>
        aria-label="Report"
        items={[
          { value: 'pending', label: 'MRN pending GRN' },
          { value: 'accounting', label: 'Accounting status' },
        ]}
        value={tab}
        onChange={(v) => url.set({ tab: v === 'pending' ? null : v })}
      />
      {tab === 'pending' ? <PendingTab /> : <AccountingTab />}
    </div>
  );
}

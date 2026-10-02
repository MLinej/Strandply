import { Download, Printer, Search, Truck } from 'lucide-react';
import { MATERIAL_IDS, MATERIALS, type MaterialId, type PurchaseEntryView } from '@contracts/purchase';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, Pagination, Pill, Select, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportEntries, useEntries, useEntry, useEntryStats } from '../api';
import { EntryDetail } from '../components/EntryDetail';
import { printEntry } from '../print';
import { FySelect, inr, MonthSelect, NotePill, materialLabel, qtyFmt, useFy } from '../ui';

const PAGE_SIZE = 20;

/** Every inward vehicle across all materials (legacy Truck-wise Purchase Register). */
export function TrucksPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['material', 'fy', 'month'] as const);
  const [search, setSearch] = useSearchParam(url);
  const { fy, fys } = useFy(url.values.fy);
  const material = (MATERIAL_IDS as readonly string[]).includes(url.values.material) ? (url.values.material as MaterialId) : undefined;
  const filters = { material, fy: url.values.month ? undefined : fy || undefined, month: url.values.month || undefined, posted: true };
  const list = useEntries({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters }, { enabled: !!fy });
  const stats = useEntryStats({ q: url.q || undefined, filters }).data;
  const opened = useEntry(url.open);
  const rows = list.data?.rows ?? [];

  const columns: Column<PurchaseEntryView>[] = [
    { id: 'date', header: 'Date', width: '104px', cell: (e) => formatDate(e.date) },
    { id: 'vehicle', header: 'Vehicle', width: '120px', className: 'font-mono text-sm font-semibold', cell: (e) => e.vehicleNo ?? '—' },
    { id: 'material', header: 'Material', width: '150px', cell: (e) => <Pill>{`${materialLabel(e.material)} ${e.lotNo}`}</Pill> },
    { id: 'vendor', header: 'Vendor', cell: (e) => <span className="block truncate">{e.vendorName}</span> },
    { id: 'invoice', header: 'Invoice', width: '140px', className: 'text-sm', cell: (e) => e.invoiceNo },
    { id: 'inv', header: 'Inv qty', width: '92px', align: 'right', className: 'tabular-nums', cell: (e) => qtyFmt(e.invQty) },
    { id: 'spl', header: 'SPL qty', width: '92px', align: 'right', className: 'tabular-nums', cell: (e) => qtyFmt(e.splQty) },
    {
      id: 'diff',
      header: 'Diff',
      width: '80px',
      align: 'right',
      cell: (e) => <span className={e.calc.diffQty < 0 ? 'text-primary' : e.calc.diffQty > 0 ? 'text-green' : 'text-faint'}>{e.calc.diffQty > 0 ? '+' : ''}{qtyFmt(e.calc.diffQty)}</span>,
    },
    { id: 'total', header: 'SPL total', width: '124px', align: 'right', className: 'tabular-nums font-semibold', cell: (e) => inr(e.calc.spl.total) },
    { id: 'note', header: 'DN/CN', width: '110px', cell: (e) => (e.calc.qtyNote ? <NotePill kind="qty" type={e.calc.qtyNote.type} /> : <span className="text-faint">—</span>) },
    {
      id: 'slip',
      header: <span className="sr-only">Slip</span>,
      width: '56px',
      align: 'right',
      cell: (e) =>
        canDo('print') && (
          <Button
            size="sm"
            variant="ghost"
            icon={Printer}
            aria-label={`Print slip for ${e.lotNo}`}
            onClick={(ev) => {
              ev.stopPropagation();
              void printEntry(e.id, 'slip').catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) }));
            }}
          />
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Truck register"
        description="Every inward vehicle, all materials."
        actions={
          canDo('export') && (
            <Button icon={Download} onClick={() => void exportEntries({ q: url.q || undefined, filters }).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
              Excel
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search trucks" icon={Search} placeholder="Vehicle, vendor, invoice, RST" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[280px]" />
        <Select aria-label="Material" placeholder="All materials" options={MATERIALS.map((m) => ({ value: m.id, label: m.label }))} value={url.values.material} onChange={(e) => url.set({ material: e.target.value })} containerClassName="w-[170px]" />
        <FySelect value={fy} fys={fys} onChange={(v) => url.set({ fy: v, month: null })} />
        <MonthSelect fy={fy} value={url.values.month} onChange={(m) => url.set({ month: m })} />
        {stats && (
          <span className="ml-auto text-sm text-muted">
            {stats.entries} vehicles · SPL total <strong className="text-ink">{inr(stats.splTotalPaise)}</strong>
          </span>
        )}
      </div>
      <DataTable
        label="Truck register"
        columns={columns}
        rows={rows}
        getRowId={(e) => e.id}
        minWidth={1180}
        loading={list.isLoading}
        onRowClick={(e) => url.set({ open: e.id, page: url.page })}
        empty={<EmptyState icon={Truck} title="No vehicles in this period" />}
        footer={(list.data?.total ?? 0) > 0 && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      {url.open && <EntryDetail entry={opened.data} onClose={() => url.set({ open: null, page: url.page })} />}
    </div>
  );
}

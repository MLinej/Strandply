import { Boxes, Download, MessageCircle, Printer, Search } from 'lucide-react';
import { DEPARTMENTS, FAMILIES, type Department, type Family, type SkuInfo } from '@contracts/stock';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, Pill, SegmentedControl, Select, useToast, type Column } from '@/components/ui';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportStock, useLiveStock, useStockMeta } from '../api';
import { printTableReport, shareTableReport, type TableReport } from '../print';
import { FamilyPill, isAlertDept, qtyFmt } from '../ui';

type View = 'sku' | 'dept';

/** Live stock (legacy renderStock): every SKU with a balance, SKU-wise or as department closing stock. */
export function LivePage() {
  const toast = useToast();
  const { canDo } = useSession();
  const company = useStockMeta().data?.company;
  const url = useUrlState(['view', 'family', 'dept'] as const);
  const [search, setSearch] = useSearchParam(url);
  const view = (url.values.view || 'sku') as View;
  const query = { family: (url.values.family || undefined) as Family | undefined, dept: (url.values.dept || undefined) as Department | undefined, q: url.q || undefined };
  const live = useLiveStock(query);
  const d = live.data;
  const guard = (title: string, fn: () => Promise<unknown>) => void fn().catch((err) => toast({ tone: 'error', title, description: errorMessage(err) }));

  const columns: Column<SkuInfo>[] = [
    {
      id: 'sku',
      header: 'SKU',
      width: '150px',
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <span className="font-semibold tabular-nums">{r.sku}</span>
          {isAlertDept(r.dept) && <Pill tone="red">REJ</Pill>}
        </span>
      ),
    },
    { id: 'label', header: 'Description', cell: (r) => <span className="block truncate">{r.label}</span> },
    { id: 'thick', header: 'Thick', width: '80px', cell: (r) => (r.thick ? `${r.thick} mm` : '—') },
    { id: 'size', header: 'Size', width: '100px', cell: (r) => r.size ?? '—' },
    { id: 'grade', header: 'Gr.', width: '60px', cell: (r) => r.grade ?? '—' },
    { id: 'family', header: 'Family', width: '110px', cell: (r) => <FamilyPill family={r.family} /> },
    { id: 'dept', header: 'Department', width: '200px', cell: (r) => <span className="block truncate text-sm">{r.dept}</span> },
    { id: 'qty', header: 'Closing', width: '120px', align: 'right', className: 'font-semibold tabular-nums', cell: (r) => <span className={r.qty < 0 ? 'text-primary' : undefined}>{`${qtyFmt(r.qty)} ${r.unit}`}</span> },
  ];
  const deptCols = columns.filter((c) => c.id !== 'dept' && c.id !== 'family');
  const filterText = [query.family && FAMILIES.find((f) => f.id === query.family)?.label, query.dept, query.q && `“${query.q}”`].filter(Boolean).join(' · ') || 'All items';
  const report: TableReport | null = d
    ? view === 'sku'
      ? {
          title: 'SKU-wise live stock',
          subtitle: filterText,
          sections: [
            { head: ['SKU', 'Description', 'Thick', 'Department', 'Qty'], numeric: [4], rows: d.rows.map((r) => [r.sku, r.label, r.thick ? `${r.thick} mm` : '—', r.dept, `${qtyFmt(r.qty)} ${r.unit}`]), foot: ['Total', '', '', '', qtyFmt(d.total)] },
          ],
        }
      : {
          title: 'Department-wise closing stock',
          subtitle: filterText,
          sections: d.byDept.map((x) => ({
            title: x.dept,
            head: ['SKU', 'Description', 'Thick', 'Size', 'Gr.', 'Closing'],
            numeric: [5],
            rows: d.rows.filter((r) => r.dept === x.dept).map((r) => [r.sku, r.label, r.thick ? `${r.thick} mm` : '—', r.size ?? '—', r.grade ?? '—', qtyFmt(r.qty)]),
            foot: ['Department total', '', '', '', '', qtyFmt(x.qty)],
          })),
        }
    : null;

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Live stock"
        description="Balances worked out from every opening entry, slip and reclassification."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => guard('Export failed', () => exportStock('stock', { family: query.family, dept: query.dept }))}>
                Excel
              </Button>
            )}
            {canDo('print') && (
              <Button icon={Printer} disabled={!report || !company} onClick={() => guard('Couldn’t print', () => printTableReport(company!, report!))}>
                Print
              </Button>
            )}
            <Button icon={MessageCircle} disabled={!report} onClick={() => shareTableReport(report!)}>
              WhatsApp
            </Button>
          </>
        }
      />
      {d && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile variant="compact" label="Total quantity" value={qtyFmt(d.total)} meta="All units added together" />
          <KpiTile variant="compact" label="SKUs in stock" value={d.rows.length} />
          <KpiTile variant="compact" label="Departments" value={d.byDept.length} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <SegmentedControl<View>
          aria-label="View"
          options={[
            { value: 'sku', label: 'SKU-wise' },
            { value: 'dept', label: 'Department-wise' },
          ]}
          value={view}
          onChange={(v) => url.set({ view: v === 'sku' ? null : v })}
        />
        <Input aria-label="Search stock" icon={Search} placeholder="SKU, description, department" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[240px]" />
        <Select aria-label="Family" placeholder="All families" options={FAMILIES.map((f) => ({ value: f.id, label: f.label }))} value={url.values.family} onChange={(e) => url.set({ family: e.target.value })} containerClassName="w-[150px]" />
        <Select aria-label="Department" placeholder="All departments" options={DEPARTMENTS.map((x) => ({ value: x, label: x }))} value={url.values.dept} onChange={(e) => url.set({ dept: e.target.value })} containerClassName="w-[220px]" />
      </div>
      {view === 'sku' ? (
        <DataTable label="Live stock" columns={columns} rows={d?.rows ?? []} getRowId={(r) => r.sku} minWidth={1080} loading={live.isLoading} empty={<EmptyState icon={Boxes} title="No stock" description="Enter opening stock or record slips." />} />
      ) : (
        <>
          {d && d.byDept.length === 0 && <EmptyState icon={Boxes} title="No stock" />}
          {d?.byDept.map((x) => (
            <Card
              key={x.dept}
              flush
              title={x.dept}
              description={`${x.skus} SKU${x.skus === 1 ? '' : 's'} in stock`}
              actions={<span className={isAlertDept(x.dept) ? 'font-semibold tabular-nums text-primary' : 'font-semibold tabular-nums'}>{qtyFmt(x.qty)}</span>}
            >
              <DataTable label={`${x.dept} closing stock`} columns={deptCols} rows={d.rows.filter((r) => r.dept === x.dept)} getRowId={(r) => r.sku} minWidth={760} className="rounded-none border-0" />
            </Card>
          ))}
          {d && d.byDept.length > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-ink px-4 py-3 text-card">
              <span className="font-semibold">Grand total, all departments</span>
              <span className="text-kpi-sm font-bold tabular-nums">{qtyFmt(d.total)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

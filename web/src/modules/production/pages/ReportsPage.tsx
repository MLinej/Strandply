import { Download, Printer } from 'lucide-react';
import type { ComponentType } from 'react';
import { DOC_KINDS, type DocKind } from '@contracts/production';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, Tabs, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { errorMessage } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportProduction, useDocs, useMattBatches, useProductionDashboard, type Range, type ViewByKind } from '../api';
import { columns as chippingCols } from './ChippingPage';
import { columns as cuttingCols } from './CuttingPage';
import { columns as hotpressCols } from './HotPressPage';
import { columns as mdoCols } from './MdoPage';
import { columns as planCols } from './PlanPage';
import { columns as resinCols } from './ResinPage';
import { columns as summaryCols } from './SummaryPage';
import { FySelect, kg, qtyFmt, WfPill } from '../ui';

type Tab = 'overview' | DocKind | 'matt';
const COLS: { [K in DocKind]: Column<ViewByKind[K]>[] } = { plan: planCols, hotpress: hotpressCols, chipping: chippingCols, resin: resinCols, cutting: cuttingCols, summary: summaryCols, mdo: mdoCols };

/** KPIs per module over the rows in range (legacy renderReports* tabs). */
function kpis<K extends DocKind>(kind: K, rows: ViewByKind[K][]): { label: string; value: string }[] {
  const sum = (f: (r: ViewByKind[K]) => number) => rows.reduce((s, r) => s + f(r), 0);
  switch (kind) {
    case 'plan':
      return [
        { label: 'Target boards', value: qtyFmt(sum((r) => (r as ViewByKind['plan']).calc.totalBoards)) },
        { label: 'Approved', value: String(rows.filter((r) => (r as ViewByKind['plan']).wfState === 'approved').length) },
      ];
    case 'hotpress':
      return [
        { label: 'Boards', value: qtyFmt(sum((r) => (r as ViewByKind['hotpress']).calc.totalBoards)) },
        { label: 'Charges', value: qtyFmt(sum((r) => (r as ViewByKind['hotpress']).calc.charges)) },
      ];
    case 'chipping':
      return [{ label: 'Chipped', value: kg(sum((r) => (r as ViewByKind['chipping']).totalKg)) }];
    case 'resin':
      return [{ label: 'Resin used', value: kg(sum((r) => (r as ViewByKind['resin']).lot.qty)) }];
    case 'cutting': {
      const cut = sum((r) => (r as ViewByKind['cutting']).cutPcs);
      const rej = sum((r) => (r as ViewByKind['cutting']).rejectPcs);
      const hp = sum((r) => (r as ViewByKind['cutting']).hpPcs);
      return [
        { label: 'Boards cut', value: qtyFmt(cut) },
        { label: 'Rejects', value: `${qtyFmt(rej)} (${hp ? Math.round((rej / hp) * 10000) / 100 : 0}%)` },
      ];
    }
    case 'summary':
      return [
        { label: 'Boards produced', value: qtyFmt(sum((r) => (r as ViewByKind['summary']).boards)) },
        { label: 'Resin', value: kg(sum((r) => (r as ViewByKind['summary']).resinKg)) },
        { label: 'Wet wood', value: kg(sum((r) => (r as ViewByKind['summary']).wetWoodKg)) },
      ];
    case 'mdo':
      return [
        { label: 'Pcs', value: qtyFmt(sum((r) => (r as ViewByKind['mdo']).totalPcs)) },
        { label: 'Paper wastage', value: qtyFmt(sum((r) => (r as ViewByKind['mdo']).paperWastage ?? 0)) },
      ];
  }
  return [];
}

function KindTab<K extends DocKind>({ kind, range }: { kind: K; range: Range }) {
  const list = useDocs(kind, { pageSize: 100, filters: range });
  const rows = list.data?.rows ?? [];
  const cols: Column<ViewByKind[K]>[] = [
    { id: 'no', header: 'Document', width: '120px', cell: (d) => <span className="font-semibold tabular-nums">{(d as { docNo: string }).docNo}</span> },
    { id: 'date', header: 'Date', width: '110px', cell: (d) => formatDate((d as { date: string }).date) },
    ...(COLS[kind] as Column<ViewByKind[K]>[]),
    { id: 'wf', header: 'Status', width: '140px', cell: (d) => <WfPill state={(d as ViewByKind['plan']).wfState} /> },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile variant="compact" label="Documents" value={list.data?.total ?? '—'} />
        {kpis(kind, rows).map((k) => (
          <KpiTile key={k.label} variant="compact" label={k.label} value={k.value} />
        ))}
      </div>
      {(list.data?.total ?? 0) > 100 && <p className="text-sm text-muted">Showing the latest 100 of {list.data!.total}; Excel has them all.</p>}
      <DataTable label={`${DOC_KINDS[kind].label} report`} columns={cols} rows={rows} getRowId={(d) => (d as { id: string }).id} minWidth={1100} loading={list.isLoading} empty={<EmptyState title="Nothing in this period" />} />
    </>
  );
}

function MattTab({ range }: { range: Range }) {
  const rows = useMattBatches({ pageSize: 100, filters: range }).data?.rows ?? [];
  const matts = rows.reduce((s, b) => s + b.stats.count, 0);
  const withMatts = rows.filter((b) => b.stats.count);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile variant="compact" label="Batches" value={rows.length} />
        <KpiTile variant="compact" label="Matts" value={qtyFmt(matts)} />
        <KpiTile variant="compact" label="Average pass rate" value={withMatts.length ? `${Math.round((withMatts.reduce((s, b) => s + b.stats.passRate, 0) / withMatts.length) * 10) / 10}%` : '—'} />
      </div>
      <DataTable
        label="Matt weight report"
        columns={[
          { id: 'no', header: 'Batch', width: '120px', cell: (b) => <span className="font-semibold tabular-nums">{b.docNo}</span> },
          { id: 'date', header: 'Date', width: '110px', cell: (b) => formatDate(b.date) },
          { id: 'p', header: 'Product', cell: (b) => `${b.product} · ${b.size}` },
          { id: 'sp', header: 'Setpoint', width: '110px', className: 'tabular-nums', cell: (b) => `${b.setpoint} ± ${b.band}` },
          { id: 'n', header: 'Matts', width: '80px', align: 'right', className: 'tabular-nums', cell: (b) => b.stats.count },
          { id: 'avg', header: 'Average', width: '100px', align: 'right', className: 'tabular-nums', cell: (b) => `${b.stats.avg} kg` },
          { id: 'sd', header: 'Std dev', width: '90px', align: 'right', className: 'tabular-nums', cell: (b) => b.stats.stdDev },
          { id: 'pr', header: 'Pass rate', width: '100px', align: 'right', className: 'tabular-nums', cell: (b) => `${b.stats.passRate}%` },
        ]}
        rows={rows}
        getRowId={(b) => b.id}
        minWidth={900}
        empty={<EmptyState title="Nothing in this period" />}
      />
    </>
  );
}

function Overview({ range }: { range: Range }) {
  const d = useProductionDashboard(range).data;
  if (!d) return null;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile variant="compact" label="Boards pressed" value={qtyFmt(d.kpis.boardsPressed)} />
        <KpiTile variant="compact" label="Boards cut" value={qtyFmt(d.kpis.cutPcs)} />
        <KpiTile variant="compact" label="Reject rate" value={`${d.kpis.rejectPct}%`} emphasis={d.kpis.rejectPct > 5 ? 'bad' : undefined} />
        <KpiTile variant="compact" label="Summaries" value={d.kpis.summaries} />
      </div>
      <Card flush title="Module summary">
        <table className="w-full text-sm" aria-label="Module summary">
          <thead className="border-b border-divider bg-page text-label font-semibold uppercase tracking-label text-muted">
            <tr>
              <th className="px-5 py-2 text-left">Module</th>
              <th className="px-5 py-2 text-right">Documents</th>
              <th className="px-5 py-2 text-right">Output</th>
            </tr>
          </thead>
          <tbody>
            {d.modules.map((m) => (
              <tr key={m.key} className="border-b border-divider last:border-0">
                <td className="px-5 py-2">{m.label}</td>
                <td className="px-5 py-2 text-right tabular-nums">{m.count}</td>
                <td className="px-5 py-2 text-right tabular-nums">{m.metric}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'plan', label: 'Planning' },
  { value: 'hotpress', label: 'Hot press' },
  { value: 'matt', label: 'Matt weight' },
  { value: 'chipping', label: 'Chipping' },
  { value: 'resin', label: 'Resin' },
  { value: 'cutting', label: 'Board cutting' },
  { value: 'summary', label: 'Summary' },
  { value: 'mdo', label: 'MDO' },
];

/** Reports and summary (legacy page-reports): cross-module KPIs and tables for a date range or FY, with Excel. */
export function ReportsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['tab', 'fy', 'from', 'to'] as const);
  const tab = (url.values.tab || 'overview') as Tab;
  const range: Range = { fy: url.values.fy || undefined, from: url.values.from || undefined, to: url.values.to || undefined };
  const Kind = KindTab as ComponentType<{ kind: DocKind; range: Range }>;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Production reports"
        description="Every production module for a period, with totals and Excel."
        actions={
          <>
            {canDo('export') && tab !== 'overview' && (
              <Button icon={Download} onClick={() => void exportProduction(tab, range).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
            {canDo('print') && (
              <Button icon={Printer} onClick={() => window.print()}>
                Print
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <FySelect value={url.values.fy} onChange={(v) => url.set({ fy: v })} />
        <Input aria-label="From date" type="date" value={url.values.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={url.values.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
      </div>
      <Tabs<Tab> aria-label="Module" items={TABS} value={tab} onChange={(v) => url.set({ tab: v === 'overview' ? null : v })} />
      {tab === 'overview' ? <Overview range={range} /> : tab === 'matt' ? <MattTab range={range} /> : <Kind key={tab} kind={tab} range={range} />}
    </div>
  );
}

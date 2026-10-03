import { BookOpen, Download, MessageCircle, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DEPARTMENTS, skuCode, type Department, type LedgerLeg } from '@contracts/stock';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, Select, Tabs, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { errorMessage } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportStock, useDeptLedger, useMovements, useSkuLedger, useStockMeta, type MovementRow } from '../api';
import { SlipDetail } from './SlipsPage';
import { printTableReport, shareTableReport, type TableReport } from '../print';
import { KindPill, qtyFmt } from '../ui';

type View = 'sku' | 'dept' | 'daily';
const rangeText = (from: string, to: string) => (from || to ? `${from ? formatDate(from) : 'Start'} – ${to ? formatDate(to) : 'today'}` : 'All dates');
const outCell = (l: LedgerLeg) => (l.qty < 0 ? <span className="font-semibold text-primary">{qtyFmt(-l.qty)}</span> : <span className="text-faint">—</span>);
const inCell = (l: LedgerLeg) => (l.qty > 0 ? <span className="font-semibold text-green">{qtyFmt(l.qty)}</span> : <span className="text-faint">—</span>);

function ReportActions({ report, kind, query }: { report: TableReport | null; kind: 'sku-ledger' | 'dept-ledger' | 'movements'; query: Record<string, string | undefined> }) {
  const toast = useToast();
  const { canDo } = useSession();
  const company = useStockMeta().data?.company;
  const guard = (title: string, fn: () => Promise<unknown>) => void fn().catch((err) => toast({ tone: 'error', title, description: errorMessage(err) }));
  return (
    <div className="ml-auto flex gap-2">
      {canDo('export') && (
        <Button icon={Download} onClick={() => guard('Export failed', () => exportStock(kind, query))}>
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
    </div>
  );
}

function SkuView({ from, to, sku, setSku, onOpen }: { from: string; to: string; sku: string; setSku: (s: string) => void; onOpen: (l: LedgerLeg) => void }) {
  const groups = useStockMeta().data?.groups ?? [];
  const codes = useMemo(() => groups.flatMap((g) => (g.thicknesses.length ? g.thicknesses.map((t) => skuCode(g, t)) : [g.prefix])), [groups]);
  const l = useSkuLedger({ sku: sku || undefined, from: from || undefined, to: to || undefined });
  const d = l.data;
  const columns: Column<LedgerLeg>[] = [
    { id: 'date', header: 'Date', width: '110px', cell: (x) => formatDate(x.date) },
    { id: 'doc', header: 'Document', width: '150px', className: 'tabular-nums', cell: (x) => x.docNo },
    { id: 'kind', header: 'Type', width: '90px', cell: (x) => <KindPill kind={x.kind} /> },
    { id: 'sku', header: 'SKU', className: 'tabular-nums', cell: (x) => x.sku },
    { id: 'out', header: 'Out (−)', width: '110px', align: 'right', className: 'tabular-nums', cell: outCell },
    { id: 'in', header: 'In (+)', width: '110px', align: 'right', className: 'tabular-nums', cell: inCell },
    { id: 'bal', header: 'Balance', width: '110px', align: 'right', className: 'font-semibold tabular-nums', cell: (x) => qtyFmt(x.balance ?? 0) },
  ];
  const report: TableReport | null = d
    ? {
        title: 'SKU-wise stock ledger',
        subtitle: `${sku || 'All SKUs'} · ${rangeText(from, to)}`,
        sections: [
          {
            head: ['Date', 'Document', 'SKU', 'Out (−)', 'In (+)', 'Balance'],
            numeric: [3, 4, 5],
            rows: [
              ...(sku && from ? [[formatDate(from), 'Brought forward', sku, '', '', qtyFmt(d.openingQty)]] : []),
              ...d.legs.map((x) => [formatDate(x.date), x.docNo, x.sku, x.qty < 0 ? qtyFmt(-x.qty) : '—', x.qty > 0 ? qtyFmt(x.qty) : '—', qtyFmt(x.balance ?? 0)]),
            ],
            foot: ['Total', '', '', qtyFmt(d.totals.out), qtyFmt(d.totals.in), sku ? qtyFmt(d.closingQty) : qtyFmt(d.totals.net)],
          },
        ],
      }
    : null;
  return (
    <>
      <div className="flex flex-wrap items-end gap-2.5">
        <div>
          <Input label="SKU" list="sku-codes" placeholder="All SKUs" value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} containerClassName="w-[200px]" />
          <datalist id="sku-codes">
            {codes.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <ReportActions report={report} kind="sku-ledger" query={{ sku: sku || undefined, from: from || undefined, to: to || undefined }} />
      </div>
      {d && sku && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile variant="compact" label="Brought forward" value={qtyFmt(d.openingQty)} />
          <KpiTile variant="compact" label="Out (−)" value={qtyFmt(d.totals.out)} />
          <KpiTile variant="compact" label="In (+)" value={qtyFmt(d.totals.in)} />
          <KpiTile variant="compact" label="Closing" value={qtyFmt(d.closingQty)} />
        </div>
      )}
      {!sku && <p className="text-sm text-muted">With all SKUs, the balance column runs per SKU. Pick a SKU for its own ledger with the balance brought forward.</p>}
      <DataTable
        label="SKU ledger"
        columns={columns}
        rows={d?.legs ?? []}
        getRowId={(x) => `${x.docId}-${x.sku}-${x.qty}`}
        minWidth={860}
        loading={l.isLoading}
        onRowClick={(x) => onOpen(x)}
        empty={<EmptyState icon={BookOpen} title="No movements" />}
      />
    </>
  );
}

function DeptView({ from, to, onOpen }: { from: string; to: string; onOpen: (l: LedgerLeg) => void }) {
  const url = useUrlState(['dept'] as const);
  const dept = (url.values.dept || undefined) as Department | undefined;
  const l = useDeptLedger({ dept, from: from || undefined, to: to || undefined });
  const d = l.data;
  const columns: Column<LedgerLeg>[] = [
    { id: 'date', header: 'Date', width: '110px', cell: (x) => formatDate(x.date) },
    { id: 'doc', header: 'Document', width: '150px', className: 'tabular-nums', cell: (x) => x.docNo },
    { id: 'kind', header: 'Type', width: '90px', cell: (x) => <KindPill kind={x.kind} /> },
    { id: 'sku', header: 'SKU', className: 'tabular-nums', cell: (x) => x.sku },
    { id: 'thick', header: 'Thick', width: '80px', cell: (x) => (x.thick ? `${x.thick} mm` : '—') },
    { id: 'out', header: 'Out (−)', width: '110px', align: 'right', className: 'tabular-nums', cell: outCell },
    { id: 'in', header: 'In (+)', width: '110px', align: 'right', className: 'tabular-nums', cell: inCell },
  ];
  const report: TableReport | null = d
    ? {
        title: 'Department-wise stock ledger',
        subtitle: `${dept ?? 'All departments'} · ${rangeText(from, to)}`,
        sections: d.depts.map((x) => ({
          title: x.dept,
          head: ['Date', 'Document', 'SKU', 'Out (−)', 'In (+)'],
          numeric: [3, 4],
          rows: x.legs.map((g) => [formatDate(g.date), g.docNo, g.sku, g.qty < 0 ? qtyFmt(-g.qty) : '—', g.qty > 0 ? qtyFmt(g.qty) : '—']),
          foot: ['Total', '', `Net ${qtyFmt(x.net)}`, qtyFmt(x.out), qtyFmt(x.in)],
        })),
      }
    : null;
  return (
    <>
      <div className="flex flex-wrap items-end gap-2.5">
        <Select label="Department" placeholder="All departments" options={DEPARTMENTS.map((x) => ({ value: x, label: x }))} value={url.values.dept} onChange={(e) => url.set({ dept: e.target.value })} containerClassName="w-[260px]" />
        <ReportActions report={report} kind="dept-ledger" query={{ dept, from: from || undefined, to: to || undefined }} />
      </div>
      {d && d.depts.length === 0 && <EmptyState icon={BookOpen} title="No movements" />}
      {d?.depts.map((x) => (
        <Card
          key={x.dept}
          flush
          title={x.dept}
          actions={
            <span className="flex gap-3 text-sm tabular-nums">
              <span className="text-primary">Out {qtyFmt(x.out)}</span>
              <span className="text-green">In {qtyFmt(x.in)}</span>
              <span className="font-semibold">Net {qtyFmt(x.net)}</span>
            </span>
          }
        >
          <DataTable label={`${x.dept} ledger`} columns={columns} rows={x.legs} getRowId={(g) => `${g.docId}-${g.sku}-${g.qty}`} minWidth={820} onRowClick={onOpen} className="rounded-none border-0" />
        </Card>
      ))}
    </>
  );
}

function DailyView({ from, to, onOpen }: { from: string; to: string; onOpen: (r: MovementRow) => void }) {
  const m = useMovements({ from: from || undefined, to: to || undefined });
  const d = m.data;
  const columns: Column<MovementRow>[] = [
    { id: 'date', header: 'Date', width: '110px', cell: (r) => formatDate(r.date) },
    { id: 'doc', header: 'Document', width: '140px', className: 'tabular-nums', cell: (r) => r.docNo },
    { id: 'kind', header: 'Type', width: '70px', cell: (r) => <KindPill kind={r.kind} /> },
    { id: 'from', header: 'From dept', cell: (r) => <span className="block truncate text-sm">{r.fromDept ?? '—'}</span> },
    { id: 'to', header: 'To dept', cell: (r) => <span className="block truncate text-sm">{r.toDept ?? '—'}</span> },
    {
      id: 'product',
      header: 'Product',
      width: '240px',
      cell: (r) => (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="font-semibold tabular-nums">
            {r.fromSku} → {r.toSku}
          </span>
          <span className="truncate text-caption text-faint">{r.label}</span>
        </span>
      ),
    },
    { id: 'thick', header: 'Thick', width: '70px', cell: (r) => (r.thick ? `${r.thick} mm` : '—') },
    { id: 'qty', header: 'Qty', width: '90px', align: 'right', className: 'font-semibold tabular-nums', cell: (r) => qtyFmt(r.qty) },
  ];
  const report: TableReport | null = d
    ? {
        title: 'Daily movement summary',
        subtitle: rangeText(from, to),
        sections: [
          {
            head: ['Date', 'Document', 'Type', 'From dept', 'To dept', 'Product', 'Thick', 'Qty'],
            numeric: [7],
            rows: d.rows.map((r) => [formatDate(r.date), r.docNo, r.kind, r.fromDept ?? '—', r.toDept ?? '—', `${r.fromSku} → ${r.toSku}`, r.thick ? `${r.thick} mm` : '—', qtyFmt(r.qty)]),
            foot: ['Total movements', '', '', '', '', '', '', qtyFmt(d.totalQty)],
          },
        ],
      }
    : null;
  return (
    <>
      <div className="flex">
        <ReportActions report={report} kind="movements" query={{ from: from || undefined, to: to || undefined }} />
      </div>
      <DataTable
        label="Daily movement"
        columns={columns}
        rows={d?.rows ?? []}
        getRowId={(r) => r.docId}
        minWidth={1100}
        loading={m.isLoading}
        onRowClick={onOpen}
        empty={<EmptyState icon={BookOpen} title="No movements in this period" />}
      />
      {d && d.rows.length > 0 && <p className="text-right text-sm font-semibold tabular-nums">Total {qtyFmt(d.totalQty)}</p>}
    </>
  );
}

/** Stock ledger (legacy renderLedger): SKU-wise with running balance, department-wise, and daily movement. */
export function LedgerPage() {
  const url = useUrlState(['view', 'from', 'to', 'sku'] as const);
  const view = (url.values.view || 'sku') as View;
  const [slip, setSlip] = useState<string | null>(null);
  // Slips open in place; reclass and opening documents live on their own pages.
  const open = (x: { kind: string; docId: string }) => (x.kind === 'SIS' || x.kind === 'SRS') && setSlip(x.docId);
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Stock ledger" description="Every movement, including opening stock and reclassification, with IN / OUT totals." />
      <Tabs<View>
        aria-label="Ledger view"
        items={[
          { value: 'sku', label: 'SKU-wise' },
          { value: 'dept', label: 'Department-wise' },
          { value: 'daily', label: 'Daily movement' },
        ]}
        value={view}
        onChange={(v) => url.set({ view: v === 'sku' ? null : v })}
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="From date" type="date" value={url.values.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={url.values.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
        {(url.values.from || url.values.to) && (
          <Button size="sm" variant="ghost" onClick={() => url.set({ from: null, to: null })}>
            Clear dates
          </Button>
        )}
      </div>
      {view === 'sku' && <SkuView from={url.values.from} to={url.values.to} sku={url.values.sku} setSku={(s) => url.set({ sku: s })} onOpen={open} />}
      {view === 'dept' && <DeptView from={url.values.from} to={url.values.to} onOpen={open} />}
      {view === 'daily' && <DailyView from={url.values.from} to={url.values.to} onOpen={open} />}
      <SlipDetail id={slip} onClose={() => setSlip(null)} />
    </div>
  );
}

import { ArrowLeft, Download, FileBarChart, Printer, X } from 'lucide-react';
import { REPORT_DEFS, type ReportCell, type ReportColumn, type ReportId, type ReportResult } from '@contracts/sales';
import { firmScopeLabel, useFirmScope, useSession } from '@/app/session';
import { Button, Card, Input, KpiTile, Skeleton, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { errorMessage } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportReport, useFirmFilter, useReport } from '../api';
import { printReport } from '../print';
import { inr, qtyFmt, sqmFmt } from '../ui';

function fmt(c: ReportColumn, x: ReportCell | undefined) {
  if (x === null || x === undefined || x === '') return '';
  if (typeof x === 'number') {
    if (c.kind === 'money') return inr(x);
    if (c.kind === 'sqm') return sqmFmt(x);
    if (c.kind === 'pct') return `${x}%`;
    return qtyFmt(x);
  }
  return c.kind === 'date' ? formatDate(x) : x;
}
const numeric = (c: ReportColumn) => !!c.kind && c.kind !== 'text' && c.kind !== 'date';

function ReportView({ r }: { r: ReportResult }) {
  const t = r.table;
  return (
    <div className="flex flex-col gap-3">
      {r.kpis && (
        <div className="grid gap-3 sm:grid-cols-3">
          {r.kpis.map((k) => (
            <KpiTile key={k.label} label={k.label} value={String(k.value)} meta={k.note} />
          ))}
        </div>
      )}
      {r.pivot ? (
        <Card title="Balance to dispatch, by EDD">
          <table className="w-full text-sm" aria-label={r.label}>
            <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
              <tr>
                <th className="px-3 py-1.5 text-left">Order / EDD / ship to / product</th>
                <th className="px-3 py-1.5 text-right">Balance pcs</th>
                <th className="px-3 py-1.5 text-right">Balance amount</th>
              </tr>
            </thead>
            <tbody>
              {r.pivot.orders.map((o) => [
                <tr key={o.soId} className="border-t border-divider bg-primary-tint font-bold">
                  <td className="px-3 py-1.5">
                    {o.soNo} <span className="font-normal text-muted">· EDD {o.edd ? formatDate(o.edd) : '—'} · {o.shipTo}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{qtyFmt(o.pcs)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{inr(o.amountPaise)}</td>
                </tr>,
                ...o.lines.map((l, i) => (
                  <tr key={`${o.soId}-${i}`} className="border-t border-divider">
                    <td className="px-3 py-1.5 pl-8 text-muted">{l.itemName}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{qtyFmt(l.pcs)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{inr(l.amountPaise)}</td>
                  </tr>
                )),
              ])}
              <tr className="border-t-2 border-ink font-bold">
                <td className="px-3 py-1.5">Grand total</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{qtyFmt(r.pivot.pcs)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{inr(r.pivot.amountPaise)}</td>
              </tr>
            </tbody>
          </table>
          <h3 className="mb-1.5 mt-4 text-label font-semibold uppercase tracking-label text-faint">Product-wise balance</h3>
          <table className="w-full text-sm" aria-label="Product-wise balance">
            <tbody>
              {r.pivot.products.map((p) => (
                <tr key={p.itemName} className="border-t border-divider">
                  <td className="px-3 py-1.5">{p.itemName}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{qtyFmt(p.pcs)} pcs</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        t && (
          <Card>
            {t.rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm" aria-label={r.label}>
                  <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
                    <tr>
                      {t.columns.map((c) => (
                        <th key={c.key} className={`px-3 py-1.5 ${numeric(c) ? 'text-right' : 'text-left'}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((row, i) => (
                      <tr key={i} className="border-t border-divider">
                        {t.columns.map((c) => (
                          <td key={c.key} className={`px-3 py-1.5 ${numeric(c) ? 'text-right tabular-nums' : ''}`}>
                            {fmt(c, row[c.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {t.totals && (
                      <tr className="border-t-2 border-ink font-bold">
                        {t.columns.map((c) => (
                          <td key={c.key} className={`px-3 py-1.5 ${numeric(c) ? 'text-right tabular-nums' : ''}`}>
                            {fmt(c, t.totals![c.key])}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">No data for this period.</p>
            )}
          </Card>
        )
      )}
    </div>
  );
}

/** Sales reports hub (legacy REPORT_DEFS / openReportModal), with date range, Excel and print. */
export function ReportsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const scope = useFirmScope();
  const firm = useFirmFilter();
  const url = useUrlState(['report', 'from', 'to'] as const);
  const id = (REPORT_DEFS.some((d) => d.id === url.values.report) ? url.values.report : null) as ReportId | null;
  const range = { firm, from: url.values.from || undefined, to: url.values.to || undefined };
  const q = useReport(id, range);
  const def = REPORT_DEFS.find((d) => d.id === id);
  const scopeText = `${firmScopeLabel(scope)} · ${range.from || range.to ? `${range.from ? formatDate(range.from) : '…'} – ${range.to ? formatDate(range.to) : '…'}` : 'All dates'}`;

  if (!id)
    return (
      <div className="flex flex-col gap-3.5 p-6">
        <PageHeader title="Sales reports" description="Pick a report. Each can be narrowed by dates, exported to Excel and printed." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REPORT_DEFS.map((d) => (
            <button key={d.id} type="button" onClick={() => url.set({ report: d.id })} className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left hover:border-ink">
              <FileBarChart size={20} className="mt-0.5 shrink-0 text-faint" aria-hidden />
              <span>
                <span className="block text-title font-semibold">{d.label}</span>
                <span className="text-sm text-muted">{d.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title={def!.label}
        description={def!.description}
        actions={
          <>
            <Button icon={ArrowLeft} onClick={() => url.set({ report: null })}>
              All reports
            </Button>
            {canDo('print') && q.data && (
              <Button icon={Printer} onClick={() => void printReport(q.data!, null, scopeText).catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) }))}>
                Print
              </Button>
            )}
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportReport(id, range).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="From date" type="date" value={url.values.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={url.values.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
        {(range.from || range.to) && (
          <Button variant="ghost" size="sm" icon={X} onClick={() => url.set({ from: null, to: null })}>
            All dates
          </Button>
        )}
        <span className="text-sm text-muted">{firmScopeLabel(scope)}</span>
      </div>
      {q.data ? <ReportView r={q.data} /> : <Skeleton className="h-64" />}
    </div>
  );
}

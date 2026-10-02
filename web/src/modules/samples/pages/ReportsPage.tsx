import { clsx } from 'clsx';
import { BarChart3, Download, FileText, Printer } from 'lucide-react';
import { useState } from 'react';
import { REPORT_KEYS, type ReportCell, type ReportColumn, type ReportFilters, type ReportKey, type ReportTable } from '@contracts/sampletrack';
import { useSession } from '@/app/session';
import { Button, Card, EmptyState, Input, KpiTile, Select, Skeleton, useToast } from '@/components/ui';
import { formatAmount, formatDate } from '@/lib/format';
import { exportReport, useCouriers, useParties, useReport } from '../api';
import { printReport } from '../print/documents';
import { errorMessage } from '../ui/errors';
import { useUrlState } from '../ui/list-state';
import { PageHeader } from '../ui/PageHeader';

const ABOUT: Record<ReportKey, { title: string; note: string }> = {
  'dispatch-register': { title: 'Dispatch register', note: 'Every dispatch with all columns, records and total freight' },
  pending: { title: 'Pending samples', note: 'Open dispatches and pending requests, oldest first' },
  'party-wise': { title: 'Party-wise', note: 'Dispatches grouped by party, with freight' },
  'courier-performance': { title: 'Courier performance', note: 'Delivery rate and freight per courier' },
  'cost-tracking': { title: 'Cost tracking', note: 'Freight totals, average, and share by mode' },
  'product-analysis': { title: 'Product analysis', note: 'How often each product is requested' },
  'marketing-performance': { title: 'Marketing performance', note: 'Requests and success rate per person' },
};
/** Reports built from requests have no courier. */
const NO_COURIER: ReportKey[] = ['product-analysis', 'marketing-performance'];

function show(v: ReportCell, type: ReportColumn['type']) {
  if (v === null || v === '') return '—';
  if (type === 'money' && typeof v === 'number') return formatAmount(v / 100, { symbol: true });
  if (type === 'percent') return `${v}%`;
  if (type === 'date' && typeof v === 'string') return formatDate(v);
  if (type === 'number' && typeof v === 'number') return formatAmount(v, { decimals: 0 });
  return String(v);
}
const right = (t: ReportColumn['type']) => t === 'number' || t === 'money' || t === 'percent';

function TableView({ t, multiple }: { t: ReportTable; multiple: boolean }) {
  return (
    <Card flush title={multiple ? t.title : undefined}>
      {t.rows.length === 0 ? (
        <EmptyState icon={FileText} title="Nothing in this range" description="Widen the dates or clear the filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-base">
            <thead>
              <tr className="h-row-head border-y border-divider bg-page text-label font-semibold uppercase tracking-label text-muted">
                {t.columns.map((c) => (
                  <th key={c.key} className={clsx('whitespace-nowrap px-3 font-semibold', right(c.type) ? 'text-right' : 'text-left')}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => (
                <tr key={i} className="h-row border-b border-divider">
                  {t.columns.map((c, j) => (
                    <td key={c.key} className={clsx('whitespace-nowrap px-3 py-1.5', right(c.type) && 'text-right tabular-nums', j === 0 && 'font-medium')}>
                      {show(r[c.key] ?? null, c.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {t.totals && (
              <tfoot>
                <tr className="h-row bg-page font-semibold">
                  {t.columns.map((c) => (
                    <td key={c.key} className={clsx('px-3', right(c.type) && 'text-right tabular-nums')}>
                      {t.totals![c.key] === undefined ? '' : show(t.totals![c.key] ?? null, c.type)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Card>
  );
}

/** Reports & analytics (legacy genReport / exportRptExcel / exportRptCSV), all computed on the server. */
export function ReportsPage() {
  const toast = useToast();
  const { can, canDo } = useSession();
  const url = useUrlState(['report', 'dateFrom', 'dateTo', 'partyId', 'courierId'] as const);
  const key = (REPORT_KEYS as readonly string[]).includes(url.values.report) ? (url.values.report as ReportKey) : 'dispatch-register';
  const filters: ReportFilters = {
    dateFrom: url.values.dateFrom || undefined,
    dateTo: url.values.dateTo || undefined,
    partyId: url.values.partyId || undefined,
    courierId: NO_COURIER.includes(key) ? undefined : url.values.courierId || undefined,
  };
  const report = useReport(key, filters);
  // The party and courier filters need those lists; roles without the pages just don't get the filter.
  const parties = useParties({ pageSize: 100, sort: 'name' }, { enabled: can('samples.parties') });
  const couriers = useCouriers({ pageSize: 100, sort: 'name' }, { enabled: can('samples.couriers') });
  const [csvTable, setCsvTable] = useState('');
  const r = report.data;

  async function guard(title: string, fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      toast({ tone: 'error', title, description: errorMessage(err) });
    }
  }

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Sample reports"
        description="Figures are worked out on the server from live data, for the dates and filters you choose."
        actions={
          r && (
            <>
              {canDo('export') && (
                <>
                  {r.tables.length > 1 && (
                    <Select aria-label="Table for CSV" options={r.tables.map((t) => ({ value: t.name, label: `CSV: ${t.title}` }))} value={csvTable || r.tables[0]!.name} onChange={(e) => setCsvTable(e.target.value)} containerClassName="w-[200px]" />
                  )}
                  <Button icon={Download} onClick={() => guard('Export failed', () => exportReport(key, filters, 'csv', csvTable || undefined))}>
                    CSV
                  </Button>
                  <Button icon={Download} onClick={() => guard('Export failed', () => exportReport(key, filters, 'xlsx'))}>
                    Excel
                  </Button>
                </>
              )}
              {canDo('print') && (
                <Button icon={Printer} onClick={() => guard('Couldn’t print', () => printReport(key, filters))}>
                  Print
                </Button>
              )}
            </>
          )
        }
      />

      <div role="tablist" aria-label="Report" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {REPORT_KEYS.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={k === key}
            onClick={() => url.set({ report: k, courierId: NO_COURIER.includes(k) ? null : url.values.courierId || null })}
            className={clsx('flex flex-col gap-0.5 rounded border p-3 text-left transition-colors', k === key ? 'border-primary-border bg-primary-tint' : 'border-border bg-card hover:bg-page')}
          >
            <span className={clsx('text-base font-semibold', k === key ? 'text-primary' : 'text-ink')}>{ABOUT[k].title}</span>
            <span className="text-caption text-muted">{ABOUT[k].note}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        <Input label="From" type="date" value={url.values.dateFrom} max={url.values.dateTo || undefined} onChange={(e) => url.set({ dateFrom: e.target.value })} containerClassName="w-[170px]" />
        <Input label="To" type="date" value={url.values.dateTo} min={url.values.dateFrom || undefined} onChange={(e) => url.set({ dateTo: e.target.value })} containerClassName="w-[170px]" />
        {can('samples.parties') && (
          <Select label="Party" placeholder="All parties" options={(parties.data?.rows ?? []).map((p) => ({ value: p.id, label: p.name }))} value={url.values.partyId} onChange={(e) => url.set({ partyId: e.target.value })} containerClassName="w-[220px]" />
        )}
        {can('samples.couriers') && !NO_COURIER.includes(key) && (
          <Select label="Courier" placeholder="All couriers" options={(couriers.data?.rows ?? []).map((c) => ({ value: c.id, label: c.name }))} value={url.values.courierId} onChange={(e) => url.set({ courierId: e.target.value })} containerClassName="w-[200px]" />
        )}
        {(url.values.dateFrom || url.values.dateTo || url.values.partyId || url.values.courierId) && (
          <Button variant="ghost" onClick={() => url.set({ dateFrom: null, dateTo: null, partyId: null, courierId: null })}>
            Clear
          </Button>
        )}
      </div>

      {report.isError ? (
        <Card>
          <EmptyState icon={BarChart3} title="Couldn’t build this report" description={errorMessage(report.error)} />
        </Card>
      ) : !r ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className={clsx('flex flex-col gap-3.5 transition-opacity', report.isFetching && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {r.summary.map((s) => (
              <KpiTile key={s.label} variant="compact" label={s.label} value={show(s.value, s.type)} />
            ))}
          </div>
          {r.tables.map((t) => (
            <TableView key={t.name} t={t} multiple={r.tables.length > 1} />
          ))}
        </div>
      )}
    </div>
  );
}

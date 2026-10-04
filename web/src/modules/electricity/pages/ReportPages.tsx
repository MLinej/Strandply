import { Download, Printer } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DayRow, DayTotals } from '@contracts/electricity';
import { useSession } from '@/app/session';
import { Button, Card, Input, KpiTile, SegmentedControl, Skeleton, useToast } from '@/components/ui';
import { PAGES, printHtml } from '@/lib/print';
import { BarList } from '../../purchase/ui';
import { errorMessage } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportElectricity, useDaily, useElectricityDashboard, useElectricityMeta, type Range } from '../api';
import { d, inr, kwh, monthLabel, monthRange, PfCell } from '../ui';

type View = '12' | '24';
interface Col {
  head: string;
  group?: 'AM' | 'PM';
  cell: (r: DayRow) => React.ReactNode;
  total?: (t: DayTotals) => React.ReactNode;
  strong?: boolean;
}

/** Column sets for the three legacy tables (12-hr, 24-hr, monthly report). */
function columns(view: View | 'report'): Col[] {
  const tail: Col[] = [
    { head: 'Energy', cell: (r) => inr(r.energyPaise), total: (t) => inr(t.energyPaise) },
    { head: 'Fuel', cell: (r) => inr(r.fuelPaise), total: (t) => inr(t.fuelPaise) },
    { head: 'Fixed', cell: (r) => inr(r.fixedPaise), total: (t) => inr(t.fixedPaise) },
    { head: 'Total', cell: (r) => inr(r.totalPaise), total: (t) => inr(t.totalPaise), strong: true },
  ];
  if (view === '12')
    return [
      { head: 'Time', group: 'AM', cell: (r) => r.am?.time ?? '—' },
      { head: 'Reading', group: 'AM', cell: (r) => kwh(r.am?.kwh) },
      { head: 'Diff', group: 'AM', cell: (r) => kwh(r.amDiff), total: (t) => kwh(t.amDiff) },
      { head: 'Time', group: 'PM', cell: (r) => r.pm?.time ?? '—' },
      { head: 'Reading', group: 'PM', cell: (r) => kwh(r.pm?.kwh) },
      { head: 'Diff', group: 'PM', cell: (r) => kwh(r.pmDiff), total: (t) => kwh(t.pmDiff) },
      { head: 'PF', cell: (r) => <PfCell pf={r.pf} />, total: (t) => (t.avgPf === null ? '—' : t.avgPf.toFixed(3)) },
      { head: 'Day diff', cell: (r) => kwh(r.raw), total: (t) => kwh(t.raw) },
      { head: 'Net kWh', cell: (r) => kwh(r.net), total: (t) => kwh(t.net), strong: true },
      ...tail,
    ];
  if (view === '24')
    return [
      { head: 'Reading', group: 'AM', cell: (r) => kwh(r.am?.kwh) },
      { head: 'Diff', group: 'AM', cell: (r) => kwh(r.amDiff), total: (t) => kwh(t.amDiff) },
      { head: 'Net kWh', group: 'AM', cell: (r) => kwh(r.amNet), total: (t) => kwh(t.amNet) },
      { head: 'Reading', group: 'PM', cell: (r) => kwh(r.pm?.kwh) },
      { head: 'Diff', group: 'PM', cell: (r) => kwh(r.pmDiff), total: (t) => kwh(t.pmDiff) },
      { head: 'Net kWh', group: 'PM', cell: (r) => kwh(r.pmNet), total: (t) => kwh(t.pmNet) },
      { head: '24-hr diff', cell: (r) => kwh(r.raw), total: (t) => kwh(t.raw) },
      { head: 'Net kWh', cell: (r) => kwh(r.net), total: (t) => kwh(t.net), strong: true },
      { head: 'MF', cell: (r) => `×${r.mf}` },
      { head: 'PF', cell: (r) => <PfCell pf={r.pf} />, total: (t) => (t.avgPf === null ? '—' : t.avgPf.toFixed(3)) },
      ...tail,
    ];
  return [
    { head: 'Reading', group: 'AM', cell: (r) => kwh(r.am?.kwh) },
    { head: 'Diff', group: 'AM', cell: (r) => kwh(r.amDiff), total: (t) => kwh(t.amDiff) },
    { head: 'Reading', group: 'PM', cell: (r) => kwh(r.pm?.kwh) },
    { head: 'Diff', group: 'PM', cell: (r) => kwh(r.pmDiff), total: (t) => kwh(t.pmDiff) },
    { head: 'Day diff', cell: (r) => kwh(r.raw), total: (t) => kwh(t.raw) },
    { head: 'Net kWh', cell: (r) => kwh(r.net), total: (t) => kwh(t.net), strong: true },
    { head: 'MF', cell: (r) => `×${r.mf}` },
    { head: 'PF', cell: (r) => <PfCell pf={r.pf} />, total: (t) => (t.avgPf === null ? '—' : t.avgPf.toFixed(3)) },
    ...tail,
  ];
}

/** The day table with grouped AM / PM headers and a total row. `print` renders plain markup for the print frame. */
function DayTable({ label, rows, totals, cols, print = false }: { label: string; rows: DayRow[]; totals: DayTotals; cols: Col[]; print?: boolean }) {
  const groups = (['AM', 'PM'] as const).map((g) => ({ g, n: cols.filter((c) => c.group === g).length }));
  const th = print ? { padding: '1mm 1.5mm', borderBottom: '1px solid #ccc', fontSize: 7, textAlign: 'right' as const } : undefined;
  const td = print ? { padding: '0.8mm 1.5mm', borderBottom: '1px solid #eee', fontSize: 7.5, textAlign: 'right' as const } : undefined;
  const cls = (strong?: boolean) => (print ? undefined : `px-2.5 py-1.5 text-right tabular-nums ${strong ? 'font-semibold' : ''}`);
  return (
    <table className={print ? undefined : 'w-full min-w-[1100px] text-sm'} style={print ? { width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter, Arial, sans-serif' } : undefined} aria-label={label}>
      <thead className={print ? undefined : 'bg-page text-label font-semibold uppercase tracking-label text-muted'}>
        <tr>
          <th rowSpan={2} className={print ? undefined : 'px-2.5 py-1.5 text-left'} style={th && { ...th, textAlign: 'left' }}>
            Date
          </th>
          {groups.map(({ g, n }) =>
            n ? (
              <th key={g} colSpan={n} className={print ? undefined : 'border-b border-divider px-2.5 py-1 text-center'} style={th && { ...th, textAlign: 'center' }}>
                {g} shift
              </th>
            ) : null,
          )}
          {cols
            .filter((c) => !c.group)
            .map((c, i) => (
              <th key={i} rowSpan={2} className={print ? undefined : 'px-2.5 py-1.5 text-right'} style={th}>
                {c.head}
              </th>
            ))}
        </tr>
        <tr>
          {cols
            .filter((c) => c.group)
            .map((c, i) => (
              <th key={i} className={print ? undefined : 'px-2.5 py-1 text-right'} style={th}>
                {c.head}
              </th>
            ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.date} className={print ? undefined : 'border-t border-divider'}>
            <td className={print ? undefined : 'px-2.5 py-1.5 font-medium tabular-nums'} style={td && { ...td, textAlign: 'left' }}>
              {d(r.date)}
            </td>
            {[...cols.filter((c) => c.group), ...cols.filter((c) => !c.group)].map((c, i) => (
              <td key={i} className={cls(c.strong)} style={td}>
                {c.cell(r)}
              </td>
            ))}
          </tr>
        ))}
        {rows.length > 0 && (
          <tr className={print ? undefined : 'border-t-2 border-border bg-page font-semibold'} style={print ? { fontWeight: 700 } : undefined}>
            <td className={print ? undefined : 'px-2.5 py-1.5'} style={td && { ...td, textAlign: 'left' }}>
              Total
            </td>
            {[...cols.filter((c) => c.group), ...cols.filter((c) => !c.group)].map((c, i) => (
              <td key={i} className={cls(true)} style={td}>
                {c.total?.(totals) ?? '—'}
              </td>
            ))}
          </tr>
        )}
        {!rows.length && (
          <tr>
            <td colSpan={cols.length + 1} className="px-3 py-6 text-center text-muted">
              No readings in this period
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

async function printDays(title: string, subtitle: string, rows: DayRow[], totals: DayTotals, cols: Col[]) {
  await printHtml({
    page: PAGES.register,
    marginMm: 10,
    css: 'html, body { width: auto; min-height: 0; }',
    title,
    bodyHtml: renderToStaticMarkup(
      <div style={{ fontFamily: 'Inter, Arial, sans-serif', color: '#172033' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #D71920', paddingBottom: '1.5mm', marginBottom: '3mm' }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 8.5, color: '#667085' }}>{subtitle}</div>
        </div>
        <DayTable label={title} rows={rows} totals={totals} cols={cols} print />
      </div>,
    ),
  });
}

function Kpis({ t }: { t: DayTotals }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiTile label="Net kWh" value={kwh(t.net)} meta={`Meter diff ${kwh(t.raw)} · AM ${kwh(t.amNet)} · PM ${kwh(t.pmNet)}`} />
      <KpiTile label="Energy + fuel" value={inr(t.energyPaise + t.fuelPaise)} meta={`Energy ${inr(t.energyPaise)} · fuel ${inr(t.fuelPaise)}`} />
      <KpiTile label="Fixed" value={inr(t.fixedPaise)} meta={`${t.days} day${t.days === 1 ? '' : 's'} × month ÷ 30`} />
      <KpiTile label="Total estimate" value={inr(t.totalPaise)} meta={t.avgPf === null ? 'No PF readings' : `Average PF ${t.avgPf.toFixed(3)}`} />
    </div>
  );
}

/** 12-hr and 24-hr views of a month (legacy 12-Hr View / 24-Hr View). */
export function DailyPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const today = useElectricityMeta().data?.today;
  const url = useUrlState(['month', 'view'] as const);
  const month = url.values.month || today?.slice(0, 7) || '';
  const view: View = url.values.view === '24' ? '24' : '12';
  const range = month ? monthRange(month) : {};
  const r = useDaily(range, { enabled: !!month }).data;
  const cols = columns(view);
  const title = `${view === '12' ? '12-hr' : '24-hr'} view · ${month ? monthLabel(month) : ''}`;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="12 / 24-hr view"
        description="One row per day: the last AM and PM readings and what each shift used. 24-hr adds each shift’s net units."
        actions={
          <>
            {canDo('print') && r && (
              <Button icon={Printer} onClick={() => void printDays(title, `${r.totals.days} days`, r.rows, r.totals, cols)}>
                Print
              </Button>
            )}
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportElectricity('daily', range).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <SegmentedControl<View>
          aria-label="View"
          options={[
            { value: '12', label: '12-hr view' },
            { value: '24', label: '24-hr view' },
          ]}
          value={view}
          onChange={(x) => url.set({ view: x === '12' ? null : x })}
        />
        <Input aria-label="Month" type="month" value={month} max={today?.slice(0, 7)} onChange={(e) => url.set({ month: e.target.value })} containerClassName="w-[170px]" />
      </div>
      {!r ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <Kpis t={r.totals} />
          <Card flush>
            <div className="overflow-x-auto">
              <DayTable label={title} rows={r.rows} totals={r.totals} cols={cols} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/** Daily AM / PM split with costs for any date range (legacy Monthly Report). */
export function MonthlyReportPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const today = useElectricityMeta().data?.today;
  const url = useUrlState(['from', 'to'] as const);
  const range: Range = { from: url.values.from || (today ? `${today.slice(0, 7)}-01` : undefined), to: url.values.to || today };
  const r = useDaily(range, { enabled: !!range.from }).data;
  const cols = columns('report');
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Monthly report"
        description="Daily AM / PM split with energy, fuel and fixed cost for the period."
        actions={
          <>
            {canDo('print') && r && (
              <Button icon={Printer} onClick={() => void printDays('Electricity report', `${d(range.from)} – ${d(range.to)}`, r.rows, r.totals, cols)}>
                Print
              </Button>
            )}
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportElectricity('daily', range).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="From date" type="date" value={range.from ?? ''} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={range.to ?? ''} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
      </div>
      {!r ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <Kpis t={r.totals} />
          <Card flush>
            <div className="overflow-x-auto">
              <DayTable label="Electricity report" rows={r.rows} totals={r.totals} cols={cols} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/** Electricity dashboard (legacy Dashboard): range totals, monthly consumption, month-wise cost. */
export function DashboardPage() {
  const today = useElectricityMeta().data?.today;
  const url = useUrlState(['from', 'to'] as const);
  // Default: the current financial year to date.
  const fyStart = today ? `${Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0)}-04-01` : undefined;
  const range: Range = { from: url.values.from || fyStart, to: url.values.to || today };
  const r = useElectricityDashboard(range).data;
  const t = r?.totals;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Electricity dashboard" description="Consumption and estimated cost from the meter readings." />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="From date" type="date" value={range.from ?? ''} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={range.to ?? ''} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
      </div>
      {!r || !t ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile label="Net kWh" value={kwh(t.net)} meta={`Meter diff ${kwh(t.raw)} kWh`} />
            <KpiTile label="Energy cost" value={inr(t.energyPaise)} />
            <KpiTile label="Fuel cost" value={inr(t.fuelPaise)} />
            <KpiTile label="Fixed cost" value={inr(t.fixedPaise)} />
            <KpiTile label="Total estimate" value={inr(t.totalPaise)} meta="Energy + fuel + fixed" />
            <KpiTile label="Average PF" value={t.avgPf === null ? '—' : t.avgPf.toFixed(3)} meta="All readings" />
            <KpiTile label="Days read" value={String(t.days)} meta={`AM ${t.amReadings} · PM ${t.pmReadings}`} />
            <KpiTile label="Average daily net" value={t.avgDailyNet === null ? '—' : `${kwh(t.avgDailyNet)} kWh`} meta="Days that used power" />
          </div>
          <Card title="Monthly consumption" description="Net kWh per month">
            <BarList rows={r.months.map((m) => ({ label: monthLabel(m.month), value: m.net }))} format={(n) => `${kwh(n)} kWh`} empty="No readings in this period" />
          </Card>
          <Card title="Month-wise cost" flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm" aria-label="Month-wise cost">
                <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
                  <tr>
                    {['Month', 'AM days', 'PM days', 'Meter diff', 'Net kWh', 'Avg PF', 'Energy', 'Fuel', 'Fixed', 'Total'].map((h, i) => (
                      <th key={h} className={`px-3 py-1.5 ${i ? 'text-right' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...r.months.map((m) => ({ label: monthLabel(m.month), ...m })), { label: 'Total', ...t, month: 'total' }].map((m) => (
                    <tr key={m.month} className={`border-t border-divider ${m.month === 'total' ? 'bg-page font-semibold' : ''}`}>
                      <td className="px-3 py-1.5 font-medium">{m.label}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{m.amReadings}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{m.pmReadings}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{kwh(m.raw)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{kwh(m.net)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <PfCell pf={m.avgPf} />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{inr(m.energyPaise)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{inr(m.fuelPaise)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{inr(m.fixedPaise)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{inr(m.totalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

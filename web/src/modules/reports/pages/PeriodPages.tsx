import { Download, Printer } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HubPeriod } from '@contracts/hub';
import { useSession } from '@/app/session';
import { Button, Card, Input, KpiTile, Pill, Select, Skeleton, useToast } from '@/components/ui';
import { PAGES, printHtml } from '@/lib/print';
import { errorMessage } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportHub, usePeriod, useYears, type Range } from '../api';
import { d, inr, inrShort, monthLabel, num, SimpleTable } from '../ui';

type Kind = 'daily' | 'monthly' | 'fy';
const TITLE: Record<Kind, string> = { daily: 'Daily report', monthly: 'Monthly report', fy: 'Financial year report' };

/** The sections of a period report, as table data (used on screen and in the print). */
function sections(p: HubPeriod) {
  const pu = p.purchase;
  const e = p.electricity;
  return [
    { title: 'Purchase', head: ['Material', 'Entries', 'Quantity', 'Value'], rows: pu.byMaterial.map((m) => [m.label, String(m.entries), `${num(m.qty, 2)} ${m.unit}`, inr(m.valuePaise)]), total: ['Total', String(pu.entries), '', inr(pu.valuePaise)] },
    { title: 'Production (hot press)', head: ['Product', 'Reports', 'Boards'], rows: p.production.byProduct.map((x) => [x.product, String(x.reports), num(x.boards)]), total: ['Total', String(p.production.reports), num(p.production.boards)] },
    {
      title: 'Electricity',
      head: ['', 'kWh', 'Amount'],
      rows: [[`Meter readings (${e.readings})`, num(e.meteredUnits), inr(e.meteredPaise)], ...e.billList.map((b) => [`PGVCL bill ${d(b.billDate)}`, num(b.units), inr(b.totalPaise)])],
      total: undefined,
    },
    { title: 'Sales invoices', head: ['Date', 'Invoice', 'Party', 'Weight (T)', 'Amount'], rows: p.sales.recent.map((i) => [d(i.date), i.invNo, i.party, num(i.tons, 1), inr(i.totalPaise)]), total: ['Total', `${p.sales.invoices} invoices`, '', num(p.sales.tons, 1), inr(p.sales.revenuePaise)] },
    { title: 'Pending sales orders (now)', head: ['SO', 'Party', 'Status', 'Weight (T)', 'Value'], rows: p.sales.pendingOrders.map((o) => [o.soNo, o.party, o.status, num(o.tons, 1), inr(o.valuePaise)]), total: ['Total', '', `${p.sales.pendingOrders.length} orders`, num(p.sales.pendingTons, 1), inr(p.sales.pendingPaise)] },
    { title: 'Maintenance (open)', head: ['WO', 'Title', 'Priority', 'Assigned to', 'Due', 'Status'], rows: p.maintenance.openList.map((w) => [w.woNo, w.title, w.priority, w.assignee, d(w.dueDate), w.status]), total: undefined },
  ];
}

async function printPeriod(title: string, p: HubPeriod) {
  const th = { padding: '1mm 1.5mm', borderBottom: '1px solid #ccc', fontSize: 7.5, textAlign: 'left' as const, color: '#667085', textTransform: 'uppercase' as const };
  const td = { padding: '0.9mm 1.5mm', borderBottom: '1px solid #eee', fontSize: 8 };
  const k = [
    ['Purchase', inrShort(p.purchase.valuePaise), `${p.purchase.entries} entries`],
    ['Boards', num(p.production.boards), `${p.production.reports} reports`],
    ['Power', inrShort(p.electricity.meteredPaise), `${num(p.electricity.meteredUnits)} kWh`],
    ['Sales', inrShort(p.sales.revenuePaise), `${p.sales.invoices} invoices`],
    ['Work orders', String(p.maintenance.workOrders), `${p.maintenance.open} open`],
    ['Complaints', String(p.others.complaints), `${p.others.complaintsOpen} open`],
  ];
  await printHtml({
    page: PAGES.requestSlip,
    marginMm: 12,
    css: 'html, body { width: auto; min-height: 0; } tr { break-inside: avoid; }',
    title,
    bodyHtml: renderToStaticMarkup(
      <div style={{ fontFamily: 'Inter, Arial, sans-serif', color: '#172033' }}>
        <div style={{ borderBottom: '2.5px solid #C8102E', paddingBottom: '2mm', marginBottom: '3mm', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 9, color: '#667085', alignSelf: 'flex-end' }}>
            {p.from === p.to ? d(p.from) : `${d(p.from)} – ${d(p.to)}`}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '2mm', marginBottom: '3mm' }}>
          {k.map(([a, b, c]) => (
            <div key={a} style={{ border: '1px solid #E6E8EC', borderRadius: 3, padding: '1.5mm 2mm' }}>
              <div style={{ fontSize: 7, color: '#98A2B3', textTransform: 'uppercase' }}>{a}</div>
              <div style={{ fontSize: 11, fontWeight: 800 }}>{b}</div>
              <div style={{ fontSize: 7, color: '#667085' }}>{c}</div>
            </div>
          ))}
        </div>
        {sections(p).map((s) => (
          <div key={s.title} style={{ marginBottom: '3mm', breakInside: 'avoid' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#C8102E', margin: '2mm 0 1mm', textTransform: 'uppercase' }}>{s.title}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {s.head.map((h, i) => (
                    <th key={i} style={{ ...th, textAlign: i > 0 && /Value|Amount|kWh|Boards|Weight|Entries|Reports|Quantity/.test(h) ? 'right' : 'left' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j} style={{ ...td, textAlign: j > 0 && /Value|Amount|kWh|Boards|Weight|Entries|Reports|Quantity/.test(s.head[j] ?? '') ? 'right' : 'left' }}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
                {!s.rows.length && (
                  <tr>
                    <td colSpan={s.head.length} style={{ ...td, color: '#98A2B3', textAlign: 'center' }}>
                      Nothing recorded
                    </td>
                  </tr>
                )}
                {s.rows.length > 0 && s.total && (
                  <tr style={{ fontWeight: 700 }}>
                    {s.total.map((c, j) => (
                      <td key={j} style={{ ...td, textAlign: j > 0 && /Value|Amount|kWh|Boards|Weight|Entries|Reports|Quantity/.test(s.head[j] ?? '') ? 'right' : 'left' }}>
                        {c}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
        <div style={{ fontSize: 8, color: '#667085' }}>
          Also: {p.others.freightOrders} freight order form(s) for {inr(p.others.freightPaise)}; {p.others.plans} DWPAS plan(s){p.others.plansAchievedPct === null ? '' : `, average achievement ${p.others.plansAchievedPct}%`}.
        </div>
      </div>,
    ),
  });
}

/** One period's report on screen (legacy Daily / Monthly / FY Report): KPIs and the sections, with print and Excel. */
function PeriodReport({ kind, range, picker, heading }: { kind: Kind; range: Range; picker: React.ReactNode; heading: string }) {
  const toast = useToast();
  const { canDo } = useSession();
  const p = usePeriod(range, !!(range.fy || (range.from && range.to))).data;
  const title = `${TITLE[kind]} · ${heading}`;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title={TITLE[kind]}
        description="Purchase, production, power, sales and maintenance for the period, with other modules’ activity."
        actions={
          <>
            {canDo('print') && p && (
              <Button icon={Printer} onClick={() => void printPeriod(title, p)}>
                Print
              </Button>
            )}
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportHub(range).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
          </>
        }
      />
      {picker}
      {!p ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <KpiTile label="Purchase" value={inrShort(p.purchase.valuePaise)} meta={`${p.purchase.entries} entries`} />
            <KpiTile label="Boards pressed" value={num(p.production.boards)} meta={`${p.production.reports} reports`} />
            <KpiTile label="Power" value={inrShort(p.electricity.meteredPaise)} meta={`${num(p.electricity.meteredUnits)} kWh · ${p.electricity.bills} bill(s)`} />
            <KpiTile label="Sales" value={inrShort(p.sales.revenuePaise)} meta={`${p.sales.invoices} invoices`} />
            <KpiTile label="Work orders" value={String(p.maintenance.workOrders)} meta={`${p.maintenance.open} open · ${p.maintenance.overdue} overdue`} />
            <KpiTile label="Complaints" value={String(p.others.complaints)} meta={`${p.others.complaintsOpen} still open`} />
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-muted">
            <Pill>{p.others.freightOrders} freight order form(s)</Pill>
            <Pill>{p.others.plans} DWPAS plan(s)</Pill>
            {p.others.plansAchievedPct !== null && <Pill tone={p.others.plansAchievedPct >= 95 ? 'green' : p.others.plansAchievedPct >= 80 ? 'amber' : 'red'}>{`Plan achievement ${p.others.plansAchievedPct}%`}</Pill>}
          </div>
          <div className="grid gap-3.5 xl:grid-cols-2">
            {sections(p).map((s) => (
              <Card key={s.title} title={s.title} flush>
                <SimpleTable label={s.title} head={s.head} rows={s.rows} total={s.total} align={s.head.map((h, i) => (i > 0 && /Value|Amount|kWh|Boards|Weight|Entries|Reports|Quantity/.test(h) ? 'right' : 'left'))} empty="Nothing recorded" />
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export function DailyPage() {
  const url = useUrlState(['date'] as const);
  const date = url.values.date || todayLocal();
  return <PeriodReport kind="daily" range={{ from: date, to: date }} heading={d(date)} picker={<Input aria-label="Date" type="date" value={date} onChange={(e) => url.set({ date: e.target.value })} containerClassName="w-[170px]" />} />;
}

export function MonthlyPage() {
  const url = useUrlState(['month'] as const);
  const month = url.values.month || todayLocal().slice(0, 7);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return <PeriodReport kind="monthly" range={{ from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }} heading={monthLabel(month)} picker={<Input aria-label="Month" type="month" value={month} onChange={(e) => url.set({ month: e.target.value })} containerClassName="w-[170px]" />} />;
}

export function FyPage() {
  const years = useYears().data ?? [];
  const url = useUrlState(['fy'] as const);
  const fy = url.values.fy || years[0] || '';
  return <PeriodReport kind="fy" range={{ fy: fy || undefined }} heading={`FY ${fy}`} picker={<Select aria-label="Financial year" options={years.map((x) => ({ value: x, label: `FY ${x}` }))} value={fy} onChange={(e) => url.set({ fy: e.target.value })} containerClassName="w-[170px]" />} />;
}

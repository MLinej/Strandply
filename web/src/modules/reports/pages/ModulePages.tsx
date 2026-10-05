import { Database, Download } from 'lucide-react';
import { Link } from 'react-router';
import { MATERIALS } from '@contracts/purchase';
import { useSession } from '@/app/session';
import { Button, Card, KpiTile, Pill, Select, Skeleton, useToast } from '@/components/ui';
import { errorMessage } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportHub, useAnalytics, useElectricity, useMaintenance, useOverview, useProduction, usePurchase, useSales, useSources, useStock, useYears, type Range } from '../api';
import { BarList, d, inr, inrShort, MonthChart, monthLabel, num, SimpleTable, useRangeFilter } from '../ui';

/** Axis ticks are round numbers: ₹50 L, not ₹50.00 L. */
const rupeeAxis = (p: number) => inrShort(p).replace(/\.0+(?= )/, '');

function ExcelButton({ range }: { range: Range }) {
  const toast = useToast();
  const { canDo } = useSession();
  if (!canDo('export')) return null;
  return (
    <Button icon={Download} onClick={() => void exportHub(range).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
      Excel
    </Button>
  );
}

/** Reports Hub dashboard (legacy Dashboard): the period across modules, month by month. */
export function DashboardPage() {
  const { range, picker } = useRangeFilter();
  const o = useOverview(range).data;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Reports hub" description="Purchase, production, power, sales and maintenance together, from each module’s own records." actions={<ExcelButton range={range} />} />
      {picker}
      {!o ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <p className="text-sm text-muted">
            {d(o.from)} – {d(o.to)}
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Link to="/reports/purchase" className="rounded-lg focus-visible:outline focus-visible:outline-2">
              <KpiTile label="Purchase value" value={inrShort(o.purchasePaise)} meta={`${o.purchaseEntries} entries`} />
            </Link>
            <Link to="/reports/production" className="rounded-lg focus-visible:outline focus-visible:outline-2">
              <KpiTile label="Boards pressed" value={num(o.boards)} meta={`${o.hpReports} hot press reports`} />
            </Link>
            <Link to="/reports/electricity" className="rounded-lg focus-visible:outline focus-visible:outline-2">
              <KpiTile label="Power cost" value={inrShort(o.powerPaise)} meta={`${num(o.powerUnits)} kWh metered`} />
            </Link>
            <Link to="/reports/sales" className="rounded-lg focus-visible:outline focus-visible:outline-2">
              <KpiTile label="Sales revenue" value={inrShort(o.revenuePaise)} meta={`${o.invoices} invoices`} />
            </Link>
            <Link to="/reports/analytics" className="rounded-lg focus-visible:outline focus-visible:outline-2">
              <KpiTile label="Cost per board" value={o.costPerBoardPaise === null ? '—' : inr(o.costPerBoardPaise)} meta="Raw material + power" />
            </Link>
            <Link to="/reports/maintenance" className="rounded-lg focus-visible:outline focus-visible:outline-2">
              <KpiTile label="Open work orders" value={String(o.openWorkOrders)} meta="Maintenance" />
            </Link>
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <MonthChart title="Purchase value" months={o.months.map((m) => m.month)} series={[{ label: 'Purchase', className: 'bg-chart-s1', values: o.months.map((m) => m.purchasePaise) }]} format={rupeeAxis} />
            <MonthChart title="Boards pressed" months={o.months.map((m) => m.month)} series={[{ label: 'Boards', className: 'bg-chart-s1', values: o.months.map((m) => m.boards) }]} format={(v) => num(v)} />
            <MonthChart title="Power cost" description="Meter readings costed at the tariff in force" months={o.months.map((m) => m.month)} series={[{ label: 'Power', className: 'bg-chart-s1', values: o.months.map((m) => m.powerPaise) }]} format={rupeeAxis} />
            <MonthChart title="Sales revenue" months={o.months.map((m) => m.month)} series={[{ label: 'Revenue', className: 'bg-chart-s1', values: o.months.map((m) => m.revenuePaise) }]} format={rupeeAxis} />
          </div>
          <Card title="Purchase by material">
            <BarList rows={o.materialShare.map((x) => ({ label: x.name, value: x.value }))} format={(v) => inrShort(v)} empty="No purchases in this period" />
          </Card>
        </>
      )}
    </div>
  );
}

/** Purchase report (legacy Purchase Report). */
export function PurchasePage() {
  const { range, picker } = useRangeFilter();
  const url = useUrlState(['material'] as const);
  const p = usePurchase({ ...range, material: url.values.material || undefined }).data;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Purchase report" description="Purchase entries submitted or approved (drafts left out), valued at the SPL total with tax and other charges." />
      <div className="flex flex-wrap items-center gap-2.5">
        {picker}
        <Select aria-label="Material" placeholder="All materials" options={MATERIALS.map((m) => ({ value: m.id, label: m.label }))} value={url.values.material} onChange={(e) => url.set({ material: e.target.value })} containerClassName="w-[170px]" />
      </div>
      {!p ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Purchase value" value={inrShort(p.valuePaise)} meta={`${p.entries} entries`} />
            <KpiTile label="Vendors" value={String(p.vendors)} />
            <KpiTile label="Awaiting approval" value={String(p.pendingEntries)} meta="Submitted entries" />
            <KpiTile label="Materials" value={String(p.byMaterial.length)} />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <MonthChart title="Value by month" months={p.byMonth.map((m) => m.month)} series={[{ label: 'Value', className: 'bg-chart-s1', values: p.byMonth.map((m) => m.value) }]} format={rupeeAxis} />
            <Card title="Top vendors">
              <BarList rows={p.topVendors.map((x) => ({ label: x.name, value: x.value }))} format={(v) => inrShort(v)} />
            </Card>
          </div>
          <Card title="By material" flush>
            <SimpleTable
              label="By material"
              head={['Material', 'Entries', 'Quantity', 'Value']}
              rows={p.byMaterial.map((m) => [m.label, m.entries, `${num(m.qty, 2)} ${m.unit}`, inr(m.valuePaise)])}
              total={['Total', p.entries, '', inr(p.valuePaise)]}
            />
          </Card>
          <Card title="Latest entries" flush>
            <SimpleTable label="Latest entries" head={['Date', 'Material', 'Vendor', 'Invoice', 'Quantity', 'Value']} align={['left', 'left', 'left', 'left', 'right', 'right']} rows={p.recent.map((e) => [d(e.date), e.material, e.vendor, e.invoiceNo, `${num(e.qty, 2)} ${e.unit}`, inr(e.valuePaise)])} />
          </Card>
        </>
      )}
    </div>
  );
}

/** Production report (legacy Production Report): hot press boards. */
export function ProductionPage() {
  const { range, picker } = useRangeFilter();
  const p = useProduction(range).data;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Production report" description="Boards pressed, from the hot press reports in Production." />
      {picker}
      {!p ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Boards" value={num(p.boards)} meta={`${p.reports} hot press reports`} />
            <KpiTile label="Average per report" value={p.reports ? num(p.boards / p.reports, 1) : '—'} />
            <KpiTile label="Products" value={String(p.byProduct.length)} />
            <KpiTile label="Shifts" value={String(p.byShift.length)} />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <MonthChart title="Boards by month" months={p.byMonth.map((m) => m.month)} series={[{ label: 'Boards', className: 'bg-chart-s1', values: p.byMonth.map((m) => m.value) }]} format={(v) => num(v)} />
            <Card title="By shift">
              <BarList rows={p.byShift.map((x) => ({ label: x.name, value: x.value }))} format={(v) => num(v)} />
            </Card>
          </div>
          <Card title="By product" flush>
            <SimpleTable label="By product" head={['Product', 'Reports', 'Boards', 'Average']} rows={p.byProduct.map((x) => [x.product, x.reports, num(x.boards), num(x.boards / x.reports, 1)])} total={['Total', p.reports, num(p.boards), '']} />
          </Card>
        </>
      )}
    </div>
  );
}

/** Stock report (legacy Stock estimate, now the real ledgers): raw material for a FY and SKU stock now. */
export function StockPage() {
  const years = useYears().data ?? [];
  const url = useUrlState(['fy'] as const);
  const s = useStock(url.values.fy || undefined).data;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Stock report" description="Raw material from the Purchase inventory ledger (opening + purchases − returns − consumption), and SKU stock now from Stock." />
      <Select aria-label="Financial year" placeholder="This FY" options={years.map((y) => ({ value: y, label: `FY ${y}` }))} value={url.values.fy} onChange={(e) => url.set({ fy: e.target.value })} containerClassName="w-[170px]" />
      {!s ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <Card title={`Raw material · FY ${s.fy}`} flush>
            <SimpleTable
              label="Raw material"
              head={['Material', 'Opening', 'Purchased', 'Consumed', 'Closing', 'Closing value']}
              rows={s.raw.map((r) => [r.label, `${num(r.openQty, 2)} ${r.unit}`, num(r.purchQty, 2), num(r.consumeQty, 2), <span className={r.closingQty < 0 ? 'font-semibold text-primary' : ''}>{num(r.closingQty, 2)}</span>, inr(r.closingPaise)])}
              total={['Total', '', '', '', '', inr(s.rawClosingPaise)]}
              empty="No raw material ledger for this year"
            />
          </Card>
          <Card title="SKU stock now, by department" flush>
            <SimpleTable label="SKU stock" head={['Department', 'SKUs', 'Quantity']} rows={s.sku.map((x) => [x.dept, x.skus, num(x.qty, 2)])} empty="No SKU stock" />
          </Card>
        </>
      )}
    </div>
  );
}

/** Electricity report (legacy Electricity): bills and the metered estimate. */
export function ElectricityPage() {
  const { range, picker } = useRangeFilter();
  const e = useElectricity(range).data;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Electricity report" description="PGVCL bills dated in the period, and what the meter readings cost day by day at the tariff in force." />
      {picker}
      {!e ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Metered units" value={`${num(e.meteredUnits)} kWh`} meta={`${e.readings} readings`} />
            <KpiTile label="Metered estimate" value={inrShort(e.meteredPaise)} meta={e.meteredUnits ? `${inr(Math.round(e.meteredPaise / e.meteredUnits))} per kWh` : ''} />
            <KpiTile label="Billed" value={inrShort(e.billedPaise)} meta={`${e.bills} bill(s) · ${num(e.billedUnits)} kWh`} />
            <KpiTile label="Unpaid bills" value={String(e.billList.filter((b) => !b.paidDate).length)} />
          </div>
          <MonthChart
            title="Power cost by month"
            description="Billed amounts fall in the bill’s month; the estimate in the reading’s month."
            months={e.byMonth.map((m) => m.month)}
            series={[
              { label: 'Metered estimate', className: 'bg-chart-s1', values: e.byMonth.map((m) => m.meteredPaise) },
              { label: 'Billed', className: 'bg-chart-s2', values: e.byMonth.map((m) => m.billedPaise) },
            ]}
            format={rupeeAxis}
          />
          <Card title="Bills" flush>
            <SimpleTable
              label="Bills"
              head={['Bill date', 'Due', 'Units', 'Amount', 'Status']}
              align={['left', 'left', 'right', 'right', 'left']}
              rows={e.billList.map((b) => [d(b.billDate), d(b.dueDate), num(b.units), inr(b.totalPaise), b.paidDate ? <Pill tone="green">Paid {d(b.paidDate)}</Pill> : <Pill tone="amber">Pending</Pill>])}
              empty="No bills in this period"
            />
          </Card>
        </>
      )}
    </div>
  );
}

/** Sales report (legacy Sales): invoices in the period, and orders still open. */
export function SalesPage() {
  const { range, picker } = useRangeFilter();
  const url = useUrlState(['firm'] as const);
  const s = useSales({ ...range, firm: url.values.firm || undefined }).data;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Sales report" description="Invoices dated in the period; pending sales orders are every order still open, whatever its date." />
      <div className="flex flex-wrap items-center gap-2.5">
        {picker}
        <Select
          aria-label="Firm"
          placeholder="Both firms"
          options={[
            { value: 'llp', label: 'LLP' },
            { value: 'osb', label: 'OSB' },
          ]}
          value={url.values.firm}
          onChange={(e) => url.set({ firm: e.target.value })}
          containerClassName="w-[140px]"
        />
      </div>
      {!s ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <KpiTile label="Revenue" value={inrShort(s.revenuePaise)} meta={`${s.invoices} invoices`} />
            <KpiTile label="Dispatched" value={`${num(s.tons, 1)} T`} />
            <KpiTile label="Average invoice" value={s.invoices ? inrShort(s.revenuePaise / s.invoices) : '—'} />
            <KpiTile label="Awaiting approval" value={String(s.pendingApproval)} meta="Invoices" />
            <KpiTile label="Pending orders" value={inrShort(s.pendingPaise)} meta={`${s.pendingOrders.length} orders`} />
            <KpiTile label="Pending weight" value={`${num(s.pendingTons, 1)} T`} meta="Not yet dispatched" />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <MonthChart title="Revenue by month" months={s.byMonth.map((m) => m.month)} series={[{ label: 'Revenue', className: 'bg-chart-s1', values: s.byMonth.map((m) => m.value) }]} format={rupeeAxis} />
            <Card title="Top customers">
              <BarList rows={s.topCustomers.map((x) => ({ label: x.name, value: x.value }))} format={(v) => inrShort(v)} />
            </Card>
          </div>
          <Card title="Order pipeline" flush>
            <SimpleTable label="Order pipeline" head={['Status', 'Orders', 'Value']} rows={s.pipeline.map((x) => [x.status, x.orders, inr(x.valuePaise)])} empty="No sales orders" />
          </Card>
          <Card title="Pending sales orders" flush>
            <SimpleTable
              label="Pending sales orders"
              head={['SO', 'Party', 'Status', 'Weight (T)', 'Value']}
              align={['left', 'left', 'left', 'right', 'right']}
              rows={s.pendingOrders.map((o) => [o.soNo, o.party, <Pill tone="amber">{o.status}</Pill>, num(o.tons, 1), inr(o.valuePaise)])}
              total={['Total', '', `${s.pendingOrders.length} orders`, num(s.pendingTons, 1), inr(s.pendingPaise)]}
              empty="No pending sales orders"
            />
          </Card>
          <Card title="Latest invoices" flush>
            <SimpleTable label="Latest invoices" head={['Date', 'Invoice', 'Party', 'Weight (T)', 'Amount']} align={['left', 'left', 'left', 'right', 'right']} rows={s.recent.map((i) => [d(i.date), i.invNo, i.party, num(i.tons, 1), inr(i.totalPaise)])} empty="No invoices in this period" />
          </Card>
        </>
      )}
    </div>
  );
}

/** Maintenance report (legacy Maintenance): work orders touched in the period. */
export function MaintenancePage() {
  const { range, picker } = useRangeFilter();
  const m = useMaintenance(range).data;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Maintenance report" description="Work orders raised, due or worked on in the period. Overdue is as of today." />
      {picker}
      {!m ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Work orders" value={String(m.workOrders)} />
            <KpiTile label="Open" value={String(m.open)} />
            <KpiTile label="Overdue" value={String(m.overdue)} meta={m.overdue ? 'Needs attention' : 'None'} emphasis={m.overdue ? 'bad' : undefined} />
            <KpiTile label="Completed" value={String(m.completed)} />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <Card title="By category">
              <BarList rows={m.byCategory.map((x) => ({ label: x.name, value: x.value }))} format={String} />
            </Card>
            <Card title="By priority">
              <BarList rows={m.byPriority.map((x) => ({ label: x.name, value: x.value }))} format={String} />
            </Card>
          </div>
          <Card title="Open work orders" flush>
            <SimpleTable
              label="Open work orders"
              head={['WO', 'Title', 'Category', 'Priority', 'Assigned to', 'Due', 'Status']}
              align={['left', 'left', 'left', 'left', 'left', 'left', 'left']}
              rows={m.openList.map((w) => [
                <Link to={`/maintenance/work-orders?open=${w.id}`} className="font-mono hover:underline">
                  {w.woNo}
                </Link>,
                w.title,
                w.category,
                w.priority,
                w.assignee,
                <span className={w.overdue ? 'font-semibold text-primary' : ''}>{d(w.dueDate)}</span>,
                w.status,
              ])}
              empty="No open work orders"
            />
          </Card>
        </>
      )}
    </div>
  );
}

/** Cost per board (legacy Cross-Module Analytics): raw material and power against boards pressed. */
export function AnalyticsPage() {
  const { range, picker } = useRangeFilter();
  const a = useAnalytics(range).data;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Cost per board" description="Raw material purchased plus power (meter readings costed at the tariff), against boards pressed. A rough guide: purchases are counted when received, not when used." />
      {picker}
      {!a ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Combined cost" value={inrShort(a.costPaise)} meta="Raw material + power" />
            <KpiTile label="Cost per board" value={a.costPerBoardPaise === null ? '—' : inr(a.costPerBoardPaise)} meta={`${num(a.boards)} boards`} />
            <KpiTile label="kWh per 1,000 boards" value={num(a.kwhPerThousand, 1)} meta="Power efficiency" />
            <KpiTile label="Raw material share" value={a.rawShare === null ? '—' : `${a.rawShare}%`} meta="Of combined cost" />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <MonthChart
              title="Raw material and power by month"
              months={a.byMonth.map((m) => m.month)}
              series={[
                { label: 'Raw material', className: 'bg-chart-s1', values: a.byMonth.map((m) => m.rawPaise) },
                { label: 'Power', className: 'bg-chart-s2', values: a.byMonth.map((m) => m.powerPaise) },
              ]}
              format={rupeeAxis}
            />
            <MonthChart title="kWh per 1,000 boards" months={a.byMonth.map((m) => m.month)} series={[{ label: 'kWh / 1,000 boards', className: 'bg-chart-s1', values: a.byMonth.map((m) => m.kwhPerThousand ?? 0) }]} format={(v) => num(v)} />
          </div>
          <Card title="Month by month" flush>
            <SimpleTable
              label="Cost per board by month"
              head={['Month', 'Boards', 'Raw material', 'Power', 'kWh', 'Cost per board', 'kWh / 1,000']}
              rows={a.byMonth.map((m) => [monthLabel(m.month), num(m.boards), inr(m.rawPaise), inr(m.powerPaise), num(m.units), m.costPerBoardPaise === null ? '—' : inr(m.costPerBoardPaise), num(m.kwhPerThousand, 1)])}
            />
          </Card>
        </>
      )}
    </div>
  );
}

/** Data sources (legacy Data Sources, which checked browser storage): what each module holds. */
export function SourcesPage() {
  const s = useSources().data;
  return (
    <div className="flex max-w-4xl flex-col gap-3.5 p-6">
      <PageHeader title="Data sources" description="The hub reads each module’s records directly; this is what each one holds and when it last changed." />
      {!s ? (
        <Skeleton className="h-80" />
      ) : (
        <Card flush>
          <ul className="flex flex-col divide-y divide-divider" aria-label="Data sources">
            {s.map((x) => (
              <li key={x.module} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Database size={16} className={x.records ? 'text-green' : 'text-faint'} aria-hidden />
                <Link to={x.page} className="w-36 font-medium hover:underline">
                  {x.module}
                </Link>
                <span className="flex-1 text-muted">
                  {num(x.records)} {x.label}
                </span>
                <span className="text-caption text-faint">{x.updatedAt ? `Updated ${d(x.updatedAt.slice(0, 10))}` : 'No data yet'}</span>
                {x.records ? <Pill tone="green">Has data</Pill> : <Pill>Empty</Pill>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}


import { X } from 'lucide-react';
import { Link } from 'react-router';
import { Button, Card, Input, KpiTile, Skeleton } from '@/components/ui';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { BarList, monthLabel } from '../../purchase/ui';
import { useFirmFilter, useSalesDashboard } from '../api';
import { inr, lakh, qtyFmt, tons } from '../ui';

/** Sales dashboard (legacy dashboardCalc): invoices in the period, pending orders, grade summary, top customers, trend. */
export function DashboardPage() {
  const firm = useFirmFilter();
  const url = useUrlState(['from', 'to'] as const);
  const range = { firm, from: url.values.from || undefined, to: url.values.to || undefined };
  const d = useSalesDashboard(range).data;
  const period = range.from || range.to ? 'In the period' : 'All time';
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Sales dashboard" description="Invoiced sales, dispatch and pending orders. Pick dates to narrow the period." />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="From date" type="date" value={url.values.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={url.values.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
        {(range.from || range.to) && (
          <Button variant="ghost" size="sm" icon={X} onClick={() => url.set({ from: null, to: null })}>
            All dates
          </Button>
        )}
      </div>
      {!d ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <KpiTile label="Sales value" value={lakh(d.totalPaise)} meta={`${d.invoiceCount} invoices · ${period.toLowerCase()}`} />
            <KpiTile label="Basic amount" value={lakh(d.basicPaise)} meta="Before freight and tax" />
            <KpiTile label="Material dispatched" value={tons(d.tons)} meta={`${qtyFmt(d.pcs)} pcs`} />
            <KpiTile label="Pending orders" value={String(d.pendingOrders)} meta="Not completed or cancelled" />
            <KpiTile label="Outstanding" value={lakh(d.outstandingPaise)} meta="Invoiced (no receipts tracked yet)" />
            <KpiTile label="Top customer" value={d.topCustomer ?? '—'} meta="By invoice value" />
            <KpiTile label="Top product" value={d.topProduct ?? '—'} meta="By sales value" />
            <KpiTile label="Dispatch pending" value={String(d.dispatchPending)} meta={`${d.pendingApproval} invoices await approval`} />
          </div>
          <Card title="Product group summary">
            {d.grades.length ? (
              <table className="w-full text-sm" aria-label="Product group summary">
                <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Grade</th>
                    <th className="px-3 py-1.5 text-right">Tons</th>
                    <th className="px-3 py-1.5 text-right">Pcs</th>
                    <th className="px-3 py-1.5 text-right">Basic amount</th>
                  </tr>
                </thead>
                <tbody>
                  {d.grades.map((g) => (
                    <tr key={g.grade} className="border-t border-divider">
                      <td className="px-3 py-1.5 font-medium">{g.grade}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{g.tons.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{qtyFmt(g.pcs)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{inr(g.basicPaise)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-divider font-bold">
                    <td className="px-3 py-1.5">Total</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{d.grades.reduce((s, g) => s + g.tons, 0).toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{qtyFmt(d.pcs)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{inr(d.basicPaise)}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted">No invoices in this period.</p>
            )}
          </Card>
          <div className="grid gap-3.5 lg:grid-cols-3">
            <Card title="Top customers">
              <BarList rows={d.topCustomers.map((c) => ({ label: c.name, value: c.value }))} format={lakh} empty="No invoices" />
            </Card>
            <Card title="Monthly sales">
              <BarList rows={d.months.map((m) => ({ label: monthLabel(m.name), value: m.value }))} format={lakh} empty="No invoices" />
            </Card>
            <Card title="By state (ship to)">
              <BarList rows={d.states.slice(0, 10).map((s) => ({ label: s.name, value: s.value }))} format={lakh} empty="No invoices" />
            </Card>
          </div>
          <p className="text-sm text-muted">
            More in <Link to="/sales/reports" className="font-medium text-primary hover:underline">Sales reports</Link>.
          </p>
        </>
      )}
    </div>
  );
}

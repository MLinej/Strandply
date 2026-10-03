import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { useSession } from '@/app/session';
import { Button, Card, Input, KpiTile, Skeleton } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { BarList } from '../../purchase/ui';
import { useStockDashboard } from '../api';
import { KindPill, qtyFmt } from '../ui';

/** Stock dashboard (legacy renderDash). Stage stock is the real balance; the date range filters slip counts. */
export function DashboardPage() {
  const { can, canDo } = useSession();
  const url = useUrlState(['from', 'to'] as const);
  const d = useStockDashboard({ from: url.values.from || undefined, to: url.values.to || undefined }).data;
  const filtered = !!(url.values.from || url.values.to);
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Stock dashboard"
        description="Stock at each stage of the process, and slip activity."
        actions={
          can('stock.slips') &&
          canDo('edit') && (
            <>
              <Link to="/stock/slips?new=SRS">
                <Button icon={ArrowUpFromLine}>New SRS</Button>
              </Link>
              <Link to="/stock/slips?new=SIS">
                <Button variant="primary" icon={ArrowDownToLine}>
                  New SIS
                </Button>
              </Link>
            </>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="From date" type="date" value={url.values.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={url.values.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
        {filtered && (
          <Button size="sm" variant="ghost" onClick={() => url.set({ from: null, to: null })}>
            Clear
          </Button>
        )}
      </div>
      {!d ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <KpiTile variant="compact" label="Total stock" value={qtyFmt(d.totalQty)} meta="All units added together" />
            <KpiTile variant="compact" label={filtered ? 'Slips (period)' : 'Slips'} value={d.slips.total} meta={`${d.slips.sis} SIS · ${d.slips.srs} SRS · ${d.reclasses} STR`} />
            <KpiTile variant="compact" label="Issues (SIS)" value={d.slips.sis} />
            <KpiTile variant="compact" label="Receipts (SRS)" value={d.slips.srs} />
            <KpiTile variant="compact" label="Rejected + scrap" value={qtyFmt(d.alertQty)} emphasis={d.alertQty > 0 ? 'bad' : undefined} meta="Reject bay and scrap yard" />
          </div>
          <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
            <Card title="Stage-wise stock" actions={can('stock.ledger') && <Link to="/stock/live?view=dept" className="inline-flex items-center text-sm font-semibold text-muted hover:text-ink">Live stock <ChevronRight size={13} aria-hidden /></Link>}>
              <BarList rows={d.stages.map((s) => ({ label: s.alert && s.qty > 0 ? `⚠ ${s.label}` : s.label, value: Math.max(0, s.qty) }))} format={qtyFmt} />
              {d.alertQty > 0 && (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-primary">
                  <AlertTriangle size={14} aria-hidden /> {qtyFmt(d.alertQty)} in rejected and scrap.
                </p>
              )}
            </Card>
            <Card flush title="Recent slips" actions={can('stock.slips') && <Link to="/stock/slips" className="inline-flex items-center text-sm font-semibold text-muted hover:text-ink">All <ChevronRight size={13} aria-hidden /></Link>}>
              <ul>
                {d.recent.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 border-t border-divider px-5 py-2 text-sm first:border-0">
                    <KindPill kind={s.type} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold tabular-nums">{s.slipNo}</span>
                      <span className="block truncate text-caption text-faint">
                        {s.from.sku} → {s.to.sku} · {formatDate(s.date)}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{qtyFmt(s.qty)}</span>
                  </li>
                ))}
                {d.recent.length === 0 && <li className="px-5 py-3 text-sm text-muted">No slips yet.</li>}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

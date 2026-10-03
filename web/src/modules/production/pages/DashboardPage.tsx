import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { DOC_KINDS, type DocKind } from '@contracts/production';
import { useSession } from '@/app/session';
import { Button, Card, Input, KpiTile, Skeleton } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { BarList } from '../../purchase/ui';
import { useProductionDashboard } from '../api';
import { FySelect, kg, perKg, qtyFmt, WfPill } from '../ui';

/** Where each module's page is, and the permission that opens it. */
export const MODULE_LINK: Record<string, { slug: string; perm: string }> = {
  hotpress: { slug: 'hot-press', perm: 'production.press' },
  chipping: { slug: 'chipping', perm: 'production.materials' },
  matt: { slug: 'matt', perm: 'production.matt' },
  resin: { slug: 'resin', perm: 'production.materials' },
  cutting: { slug: 'board-cutting', perm: 'production.press' },
  plan: { slug: 'planning', perm: 'production.planning' },
  summary: { slug: 'summary', perm: 'production.planning' },
  mdo: { slug: 'mdo', perm: 'production.press' },
};

/** Production dashboard (legacy renderDashboard): FY or date range. */
export function DashboardPage() {
  const { can } = useSession();
  const url = useUrlState(['fy', 'from', 'to'] as const);
  const d = useProductionDashboard({ fy: url.values.fy || undefined, from: url.values.from || undefined, to: url.values.to || undefined }).data;
  const go = (key: string, label: string, extra = '') => {
    const m = MODULE_LINK[key];
    return m && can(m.perm) ? (
      <Link to={`/production/${m.slug}${extra}`} className="hover:underline">
        {label}
      </Link>
    ) : (
      label
    );
  };
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Production dashboard" description="Live overview of plans, pressing, cutting, materials and summaries." />
      <div className="flex flex-wrap items-center gap-2.5">
        <FySelect value={url.values.fy} onChange={(v) => url.set({ fy: v })} />
        <Input aria-label="From date" type="date" value={url.values.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={url.values.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
        {(url.values.fy || url.values.from || url.values.to) && (
          <Button size="sm" variant="ghost" onClick={() => url.set({ fy: null, from: null, to: null })}>
            Clear
          </Button>
        )}
      </div>
      {!d ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiTile variant="compact" label="Hot press reports" value={d.kpis.hotpress} />
            <KpiTile variant="compact" label="Boards pressed" value={qtyFmt(d.kpis.boardsPressed)} />
            <KpiTile variant="compact" label="Production summaries" value={d.kpis.summaries} />
            <KpiTile variant="compact" label="Chipping reports" value={d.kpis.chipping} />
            <KpiTile variant="compact" label="Board rejects" value={`${qtyFmt(d.kpis.rejectPcs)} (${d.kpis.rejectPct}%)`} emphasis={d.kpis.rejectPct > 5 ? 'bad' : undefined} />
            <KpiTile variant="compact" label="Waiting for sign-off" value={d.awaiting.review + d.awaiting.approval} meta={`${d.awaiting.review} to review · ${d.awaiting.approval} to approve`} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card flush title="All modules">
              <table className="w-full text-sm" aria-label="Module summary">
                <tbody>
                  {d.modules.map((m) => (
                    <tr key={m.key} className="border-t border-divider first:border-0">
                      <td className="px-5 py-2 font-medium">{go(m.key, m.label)}</td>
                      <td className="px-5 py-2 text-right tabular-nums">{m.count}</td>
                      <td className="px-5 py-2 text-right text-muted tabular-nums">{m.metric}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Boards pressed by product">
              <BarList rows={d.byProduct} format={qtyFmt} empty="No hot press reports in this period" />
            </Card>
          </div>
          <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
            <Card flush title="Recent documents">
              <ul>
                {d.recent.map((r) => (
                  <li key={`${r.kind}-${r.id}`} className="flex items-center gap-3 border-t border-divider px-5 py-2 text-sm first:border-0">
                    <span className="w-24 shrink-0 font-semibold tabular-nums">{go(r.kind, r.docNo, `?open=${r.id}`)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{r.detail}</span>
                      <span className="text-caption text-faint">
                        {DOC_KINDS[r.kind as DocKind].label} · {formatDate(r.date)}
                      </span>
                    </span>
                    <WfPill state={r.wfState} />
                  </li>
                ))}
                {d.recent.length === 0 && <li className="px-5 py-3 text-sm text-muted">Nothing in this period.</li>}
              </ul>
            </Card>
            <Card
              flush
              title="Nilgiri lot stock"
              actions={
                can('production.materials') && (
                  <Link to="/production/chipping" className="inline-flex items-center text-sm font-semibold text-muted hover:text-ink">
                    Chipping <ChevronRight size={13} aria-hidden />
                  </Link>
                )
              }
            >
              <ul>
                {d.nilgiriLots.map((l) => (
                  <li key={l.purchaseEntryId} className="flex items-center gap-3 border-t border-divider px-5 py-2 text-sm first:border-0">
                    <span className="w-12 shrink-0 font-semibold">{l.lotNo}</span>
                    <span className="min-w-0 flex-1 truncate">{l.vendorName}</span>
                    <span className="tabular-nums">{kg(l.availKg)}</span>
                    <span className="hidden w-24 text-right text-muted tabular-nums md:block">{perKg(l.netRatePaise)}</span>
                  </li>
                ))}
                {d.nilgiriLots.length === 0 && <li className="px-5 py-3 text-sm text-muted">No Nilgiri lots with stock.</li>}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { MATERIAL_BY_ID } from '@contracts/purchase';
import { useSession } from '@/app/session';
import { Card, KpiTile, Skeleton } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { usePurchaseDashboard } from '../api';
import { BarList, EntryStatusPill, FySelect, inr, inrShort, materialLabel, monthLabel, MonthSelect, NotePill, qtyFmt, qtyWithUnit, useFy } from '../ui';

/** Purchase management dashboard (legacy renderDashboard): live figures for the FY or a month. */
export function DashboardPage() {
  const { can } = useSession();
  const url = useUrlState(['fy', 'month'] as const);
  const { fy, fys } = useFy(url.values.fy);
  const q = usePurchaseDashboard({ fy: fy || undefined, month: url.values.month || undefined });
  const d = q.data;
  const linkTo = (path: string, perm: string, children: React.ReactNode) =>
    can(perm) ? (
      <Link to={path} className="inline-flex items-center text-sm font-semibold text-muted hover:text-ink">
        {children} <ChevronRight size={13} strokeWidth={2} aria-hidden />
      </Link>
    ) : null;

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Purchase dashboard"
        description={`Raw material purchases, FY ${fy}${url.values.month ? `, ${monthLabel(url.values.month)}` : ''}.`}
        actions={
          <>
            <FySelect value={fy} fys={fys} onChange={(v) => url.set({ fy: v, month: null })} />
            <MonthSelect fy={fy} value={url.values.month} onChange={(m) => url.set({ month: m })} />
          </>
        }
      />
      {!d ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiTile label="Purchase value" value={inrShort(d.kpis.totalSplPaise)} meta={`${d.kpis.entries} entries · incl. GST`} />
            <KpiTile label="Vendors" value={d.kpis.vendors} meta="Supplied in this period" />
            <KpiTile label="Awaiting approval" value={d.kpis.pendingApproval} meta="Posted entries" />
            <KpiTile label="Stock value" value={inrShort(d.kpis.inventoryPaise)} meta={`Closing, FY ${fy}`} />
            <KpiTile variant="compact" label="Open debit notes" value={d.kpis.pendingDebitNotes.count} meta={inrShort(d.kpis.pendingDebitNotes.paise)} />
            <KpiTile variant="compact" label="Open credit notes" value={d.kpis.pendingCreditNotes.count} meta={inrShort(d.kpis.pendingCreditNotes.paise)} />
            <KpiTile variant="compact" label="Today’s inward" value={d.kpis.todayInward.count} meta={inrShort(d.kpis.todayInward.paise)} />
            <KpiTile variant="compact" label="Average per entry" value={d.kpis.entries ? inrShort(Math.round(d.kpis.totalSplPaise / d.kpis.entries)) : '—'} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Monthly purchase value">
              <BarList rows={d.monthly.map((m) => ({ label: monthLabel(m.label), value: m.value }))} format={inrShort} />
            </Card>
            <Card title="Top vendors by value">
              <BarList rows={d.topVendors} format={inrShort} />
            </Card>
          </div>
          <Card flush title="By material" actions={linkTo('/purchase/register', 'purchase.entries', 'Register')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-y border-divider bg-page text-label font-semibold uppercase tracking-label text-muted">
                  <tr>
                    <th className="px-4 py-2 text-left">Material</th>
                    <th className="px-4 py-2 text-right">Entries</th>
                    <th className="px-4 py-2 text-right">SPL quantity</th>
                    <th className="px-4 py-2 text-right">Average rate</th>
                    <th className="px-4 py-2 text-right">Basic</th>
                    <th className="px-4 py-2 text-right">With GST</th>
                    <th className="px-4 py-2 text-right">With notes</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byMaterial.map((m) => (
                    <tr key={m.material} className="border-b border-divider last:border-0">
                      <td className="px-4 py-2 font-medium">
                        {can('purchase.entries') ? (
                          <Link to={`/purchase/register?material=${m.material}`} className="hover:underline">
                            {materialLabel(m.material)}
                          </Link>
                        ) : (
                          materialLabel(m.material)
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{m.entries || '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{m.entries ? qtyWithUnit(m.material, m.splQty, { tons: true }) : '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{m.avgRatePaise === null ? '—' : `${inr(m.avgRatePaise)}/${MATERIAL_BY_ID[m.material].rateBasis === 'ton' ? 'Ton' : MATERIAL_BY_ID[m.material].unit}`}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{m.entries ? inrShort(m.basicSplPaise) : '—'}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">{m.entries ? inrShort(m.totalSplPaise) : '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{m.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
            <Card title="Vehicles by quantity received">
              <BarList rows={d.topVehicles} format={(v) => qtyFmt(v)} />
            </Card>
            <Card flush title="Recent entries" actions={linkTo('/purchase/trucks', 'purchase.entries', 'All')}>
              <ul>
                {d.recent.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 border-t border-divider px-5 py-2 text-sm first:border-0">
                    <span className="w-28 shrink-0">
                      <span className="block font-semibold">
                        {materialLabel(e.material)} {e.lotNo}
                      </span>
                      <span className="text-caption text-faint">{formatDate(e.date)}</span>
                    </span>
                    <span className="min-w-0 flex-1 truncate">{e.vendorName}</span>
                    <span className="shrink-0 tabular-nums">{inr(e.calc.spl.total)}</span>
                    <span className="hidden w-24 shrink-0 md:block">{e.calc.qtyNote && <NotePill kind="qty" type={e.calc.qtyNote.type} />}</span>
                    <EntryStatusPill status={e.status} />
                  </li>
                ))}
                {d.recent.length === 0 && <li className="px-5 py-3 text-sm text-muted">No entries in this period.</li>}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

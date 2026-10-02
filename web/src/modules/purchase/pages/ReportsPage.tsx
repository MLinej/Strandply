import { Download } from 'lucide-react';
import { MATERIAL_BY_ID, MATERIAL_IDS, MATERIALS, type MaterialId } from '@contracts/purchase';
import { useSession } from '@/app/session';
import { Button, Card, KpiTile, Select, Skeleton, Tabs, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { errorMessage } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportReport, usePurchaseReports } from '../api';
import { BarList, FySelect, inr, inrShort, materialLabel, monthLabel, MonthSelect, qtyFmt, qtyWithUnit, useFy } from '../ui';

type Tab = 'daywise' | 'product-day' | 'materials' | 'vendors' | 'rate' | 'yield';
const TABS: { value: Tab; label: string }[] = [
  { value: 'daywise', label: 'Day-wise' },
  { value: 'product-day', label: 'Product × day' },
  { value: 'materials', label: 'Materials' },
  { value: 'vendors', label: 'Vendors' },
  { value: 'rate', label: 'Rate variance' },
  { value: 'yield', label: 'Yield & consumption' },
];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayName = (d: string) => DAY[new Date(`${d}T00:00:00Z`).getUTCDay()];

function Table({ head, children, foot, minWidth = 900 }: { head: string[]; children: React.ReactNode; foot?: React.ReactNode; minWidth?: number }) {
  return (
    <Card flush>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth }}>
          <thead className="border-b border-divider bg-page text-label font-semibold uppercase tracking-label text-muted">
            <tr>
              {head.map((h, i) => (
                <th key={h} className={`px-3 py-2 ${i < 3 ? 'text-left' : 'text-right'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
          {foot && <tfoot className="bg-page font-semibold">{foot}</tfoot>}
        </table>
      </div>
    </Card>
  );
}
const td = 'px-3 py-1.5 text-right tabular-nums';
const tdl = 'px-3 py-1.5';

/** Purchase analytics (legacy Analytics & Reports tabs), worked out on the server. */
export function ReportsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['tab', 'fy', 'month', 'material'] as const);
  const { fy, fys } = useFy(url.values.fy);
  const tab = (TABS.find((t) => t.value === url.values.tab)?.value ?? 'daywise') as Tab;
  const material = (MATERIAL_IDS as readonly string[]).includes(url.values.material) ? (url.values.material as MaterialId) : undefined;
  const scope = { fy: fy || undefined, month: url.values.month || undefined, material };
  const q = usePurchaseReports(scope);
  const r = q.data;
  const exp = (kind: 'daywise' | 'product-day') => void exportReport(scope, kind).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }));

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Purchase reports"
        description="Figures for posted entries (drafts left out)."
        actions={
          canDo('export') && (
            <>
              <Button icon={Download} onClick={() => exp('daywise')}>
                Day-wise Excel
              </Button>
              <Button icon={Download} onClick={() => exp('product-day')}>
                Product × day Excel
              </Button>
            </>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <FySelect value={fy} fys={fys} onChange={(v) => url.set({ fy: v, month: null })} />
        <MonthSelect fy={fy} value={url.values.month} onChange={(m) => url.set({ month: m })} />
        <Select aria-label="Material" placeholder="All materials" options={MATERIALS.map((m) => ({ value: m.id, label: m.label }))} value={url.values.material} onChange={(e) => url.set({ material: e.target.value })} containerClassName="w-[170px]" />
      </div>
      <Tabs aria-label="Report" value={tab} onChange={(t) => url.set({ tab: t })} items={TABS} />
      {!r ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <div className={q.isFetching ? 'opacity-60 transition-opacity' : ''}>
          {tab === 'daywise' && (
            <Table
              head={['Date', 'Material', 'Vendor', 'Invoice', 'Inv qty', 'SPL qty', 'Rate', 'Basic (inv)', 'Basic (SPL)', 'Total (SPL)']}
              minWidth={1100}
              foot={
                <tr>
                  <td className={tdl} colSpan={4}>
                    Total, {r.daywise.length} entries
                  </td>
                  <td className={td}>{qtyFmt(r.daywise.reduce((s, e) => s + e.invQty, 0))}</td>
                  <td className={td}>{qtyFmt(r.daywise.reduce((s, e) => s + e.splQty, 0))}</td>
                  <td />
                  <td className={td}>{inr(r.daywise.reduce((s, e) => s + e.calc.invoice.basic, 0))}</td>
                  <td className={td}>{inr(r.daywise.reduce((s, e) => s + e.calc.spl.basic, 0))}</td>
                  <td className={td}>{inr(r.daywise.reduce((s, e) => s + e.calc.spl.total, 0))}</td>
                </tr>
              }
            >
              {r.daywise.map((e) => (
                <tr key={e.id} className="border-b border-divider">
                  <td className={tdl}>
                    {formatDate(e.date)} <span className="text-faint">{dayName(e.date)}</span>
                  </td>
                  <td className={tdl}>
                    {materialLabel(e.material)} {e.lotNo}
                  </td>
                  <td className={`${tdl} max-w-[220px] truncate`}>{e.vendorName}</td>
                  <td className={td}>{e.invoiceNo}</td>
                  <td className={td}>{qtyFmt(e.invQty)}</td>
                  <td className={td}>{qtyFmt(e.splQty)}</td>
                  <td className={td}>{inr(e.ratePaise)}</td>
                  <td className={td}>{inr(e.calc.invoice.basic)}</td>
                  <td className={td}>{inr(e.calc.spl.basic)}</td>
                  <td className={`${td} font-semibold`}>{inr(e.calc.spl.total)}</td>
                </tr>
              ))}
            </Table>
          )}
          {tab === 'product-day' && (
            <Table head={['Date', 'Material', 'Entries', 'Inv qty', 'SPL qty', 'Avg rate', 'Basic (inv)', 'Basic (SPL)', 'Total (SPL)']}>
              {r.productDay.map((p) => (
                <tr key={`${p.date}|${p.material}`} className="border-b border-divider">
                  <td className={tdl}>
                    {formatDate(p.date)} <span className="text-faint">{dayName(p.date)}</span>
                  </td>
                  <td className={tdl}>{materialLabel(p.material)}</td>
                  <td className={tdl}>{p.entries}</td>
                  <td className={td}>{qtyFmt(p.invQty)}</td>
                  <td className={td}>{qtyFmt(p.splQty)}</td>
                  <td className={td}>{inr(p.avgRatePaise)}</td>
                  <td className={td}>{inr(p.basicInvPaise)}</td>
                  <td className={td}>{inr(p.basicSplPaise)}</td>
                  <td className={`${td} font-semibold`}>{inr(p.totalSplPaise)}</td>
                </tr>
              ))}
            </Table>
          )}
          {tab === 'materials' && (
            <div className="grid gap-3 lg:grid-cols-3">
              <Card title="Value by material">
                <BarList rows={r.byMaterial.filter((m) => m.entries).map((m) => ({ label: materialLabel(m.material), value: m.totalSplPaise }))} format={inrShort} />
              </Card>
              <Card title="Monthly value">
                <BarList rows={r.monthly.map((m) => ({ label: monthLabel(m.month), value: m.totalSplPaise }))} format={inrShort} />
              </Card>
              <Card title="Average rate by month">
                <BarList rows={r.monthly.map((m) => ({ label: monthLabel(m.month), value: m.avgRatePaise }))} format={inr} />
                {!material && r.monthly.length > 0 && <p className="mt-2 text-caption text-muted">Mixes per-ton and per-piece rates. Pick a material for a meaningful trend.</p>}
              </Card>
            </div>
          )}
          {tab === 'vendors' && (
            <Table head={['Vendor', 'Entries', 'Rate notes', 'Invoice qty', 'SPL qty', 'Qty variance', 'Value']} minWidth={800}>
              {r.vendors.map((v) => (
                <tr key={v.vendorName} className="border-b border-divider">
                  <td className={`${tdl} font-medium`}>{v.vendorName}</td>
                  <td className={tdl}>{v.entries}</td>
                  <td className={tdl}>{v.rateNotes || '—'}</td>
                  <td className={td}>{qtyFmt(v.invQty)}</td>
                  <td className={td}>{qtyFmt(v.splQty)}</td>
                  <td className={`${td} ${v.qtyVariancePct > 2 ? 'font-semibold text-primary' : ''}`}>{v.qtyVariancePct}%</td>
                  <td className={`${td} font-semibold`}>{inrShort(v.totalSplPaise)}</td>
                </tr>
              ))}
            </Table>
          )}
          {tab === 'rate' && (
            <Table head={['Date', 'Vendor', 'Material', 'Invoice', 'Invoice rate', 'Agreed rate', 'Difference', 'Impact (basic)']} minWidth={980}>
              {r.rateVariance.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-muted" colSpan={8}>
                    No rate differences in this period.
                  </td>
                </tr>
              )}
              {r.rateVariance.map((v) => (
                <tr key={v.entryId} className="border-b border-divider">
                  <td className={tdl}>{formatDate(v.date)}</td>
                  <td className={`${tdl} max-w-[220px] truncate`}>{v.vendorName}</td>
                  <td className={tdl}>{materialLabel(v.material)}</td>
                  <td className={td}>{v.invoiceNo}</td>
                  <td className={td}>{inr(v.invoiceRatePaise)}</td>
                  <td className={td}>{inr(v.agreedRatePaise)}</td>
                  <td className={`${td} ${v.diffPaise > 0 ? 'text-primary' : 'text-green'}`}>{v.diffPaise > 0 ? '+' : ''}{inr(v.diffPaise)}</td>
                  <td className={`${td} font-semibold`}>{inr(v.impactPaise)}</td>
                </tr>
              ))}
            </Table>
          )}
          {tab === 'yield' && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiTile variant="compact" label="Nilgiri purchased" value={qtyWithUnit('nilgiri', r.nilgiriYield.purchasedQty, { tons: true })} meta={`FY ${r.fy}`} />
                <KpiTile variant="compact" label="Nilgiri consumed" value={qtyWithUnit('nilgiri', r.nilgiriYield.consumedQty, { tons: true })} meta="From the stock ledger" />
                <KpiTile variant="compact" label="Consumed of purchased" value={r.nilgiriYield.consumedPct === null ? '—' : `${r.nilgiriYield.consumedPct}%`} />
                <KpiTile variant="compact" label="Not yet consumed" value={qtyWithUnit('nilgiri', Math.max(0, r.nilgiriYield.purchasedQty - r.nilgiriYield.consumedQty), { tons: true })} />
              </div>
              <Table head={['Material', 'Species', 'Purchased', '', 'Consumed', 'Consumed %']} minWidth={640}>
                {r.nilgiriYield.byspecies.map((s) => (
                  <tr key={s.species} className="border-b border-divider">
                    <td className={tdl}>Nilgiri Wood</td>
                    <td className={tdl}>{s.species}</td>
                    <td className={td}>{qtyWithUnit('nilgiri', s.purchasedQty)}</td>
                    <td />
                    <td className={td}>{qtyWithUnit('nilgiri', s.consumedQty)}</td>
                    <td className={td}>{s.purchasedQty ? `${Math.round((s.consumedQty / s.purchasedQty) * 1000) / 10}%` : '—'}</td>
                  </tr>
                ))}
                {r.consumption
                  .filter((c) => c.material !== 'nilgiri')
                  .map((c) => (
                    <tr key={c.material} className="border-b border-divider">
                      <td className={tdl}>{MATERIAL_BY_ID[c.material].label}</td>
                      <td className={tdl}>—</td>
                      <td className={td}>{qtyWithUnit(c.material, c.purchasedQty)}</td>
                      <td />
                      <td className={td}>{qtyWithUnit(c.material, c.consumedQty)}</td>
                      <td className={td}>{c.purchasedQty ? `${Math.round((c.consumedQty / c.purchasedQty) * 1000) / 10}%` : '—'}</td>
                    </tr>
                  ))}
              </Table>
              <p className="text-caption text-muted">Consumption is entered on the Raw material stock page from the chipping / production reports. Stock ageing is on that page too.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

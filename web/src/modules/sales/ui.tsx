import { APPROVAL_LABEL, FIRM_LABEL, PI_STATUS_LABEL, SO_STATUS_LABEL, type ApprovalStatus, type DocTotals, type Firm, type PiStatus, type SoStatus } from '@contracts/sales';
import { Pill, Select } from '@/components/ui';
import { formatAmount } from '@/lib/format';
import type { Tone } from '@/lib/status';
import { useFirmScope } from '@/app/session';

const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const sqmNum = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
export const qtyFmt = (n: number) => num.format(n);
/** Sq m always shows 4 decimals (legacy fmtSqm). */
export const sqmFmt = (n: number) => sqmNum.format(n);
/** ₹ from paise. */
export const inr = (paise: number) => formatAmount(paise / 100, { symbol: true });
/** ₹ from paise, no decimals. */
export const inr0 = (paise: number) => formatAmount(Math.round(paise / 100), { symbol: true, decimals: 0 });
/** "₹12.34 L" for big figures (legacy fmtLakh). */
export const lakh = (paise: number) => (Math.abs(paise) >= 1e7 ? `₹${(paise / 1e7).toFixed(2)} L` : inr0(paise));
export const tons = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(2)} KT` : `${t.toFixed(2)} T`);
export const stamp = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
/** Rupees text → paise ('' → 0). */
export const toPaise = (s: string) => Math.round((Number(s) || 0) * 100);
export const rupeesText = (paise: number) => (paise ? String(paise / 100) : '');
export const firmShort = (f: Firm) => (f === 'llp' ? 'LLP' : 'OSB');
export { FIRM_LABEL };

const SO_TONE: Record<SoStatus, Tone> = { draft: 'neutral', confirmed: 'purple', planned: 'purple', ready: 'amber', partial: 'amber', completed: 'green', cancelled: 'red' };
const PI_TONE: Record<PiStatus, Tone> = { draft: 'neutral', sent: 'purple', confirmed: 'green', cancelled: 'red' };
const APPROVAL_TONE: Record<ApprovalStatus, Tone> = { pending: 'amber', approved: 'green', rejected: 'red' };

export const SoPill = ({ status }: { status: SoStatus }) => <Pill tone={SO_TONE[status]}>{SO_STATUS_LABEL[status]}</Pill>;
export const PiPill = ({ status }: { status: PiStatus }) => <Pill tone={PI_TONE[status]}>{PI_STATUS_LABEL[status]}</Pill>;
export const ApprovalPill = ({ status }: { status: ApprovalStatus }) => <Pill tone={APPROVAL_TONE[status]}>{APPROVAL_LABEL[status]}</Pill>;
export const FirmPill = ({ firm }: { firm: Firm }) => <Pill tone={firm === 'llp' ? 'neutral' : 'purple'}>{firmShort(firm)}</Pill>;

/** Show the firm column only when the shell shows both firms. */
export const useShowFirm = () => useFirmScope() === 'both';

/** The default firm for a new document: the shell's firm, or LLP when it shows both. */
export function useDefaultFirm(): Firm {
  const scope = useFirmScope();
  return scope === 'both' ? 'llp' : scope;
}

export function FirmSelect({ value, onChange, disabled }: { value: Firm; onChange: (f: Firm) => void; disabled?: boolean }) {
  return <Select label="Firm" options={(['llp', 'osb'] as const).map((f) => ({ value: f, label: FIRM_LABEL[f] }))} value={value} onChange={(e) => onChange(e.target.value as Firm)} disabled={disabled} />;
}

/** Items, freight, GST split and total, right-aligned. */
export function TotalsBlock({ t, gstPct, label = 'Total' }: { t: DocTotals; gstPct: number; label?: string }) {
  const row = (k: string, v: string, strong = false) => (
    <div className={`flex justify-between gap-6 ${strong ? 'border-t border-divider pt-1 text-md font-bold' : 'text-sm'}`}>
      <span className={strong ? '' : 'text-muted'}>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
  return (
    <div className="ml-auto flex w-full max-w-xs flex-col gap-1" aria-label="Totals">
      {row('Items', inr(t.itemsPaise))}
      {t.freightPaise > 0 && row('Freight', inr(t.freightPaise))}
      {t.cgst > 0 && row(`CGST ${gstPct / 2}%`, inr(t.cgst))}
      {t.sgst > 0 && row(`SGST ${gstPct / 2}%`, inr(t.sgst))}
      {t.igst > 0 && row(`IGST ${gstPct}%`, inr(t.igst))}
      {row(label, inr(t.total), true)}
    </div>
  );
}

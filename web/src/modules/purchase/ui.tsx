import type { EntryStatus, MaterialId, NoteStatus } from '@contracts/purchase';
import { fyStartYear, MATERIAL_BY_ID, rateUnitOf } from '@contracts/purchase';
import { Pill, Select } from '@/components/ui';
import { formatAmount } from '@/lib/format';
import type { Tone } from '@/lib/status';
import { usePurchaseMeta } from './api';

/** ₹ from paise, two decimals. */
export const inr = (paise: number) => formatAmount(paise / 100, { symbol: true });
/** ₹ from paise in lakh / crore for tiles: ₹2.31 Cr, ₹98.0 L, ₹12,400. */
export function inrShort(paise: number) {
  const r = paise / 100;
  const abs = Math.abs(r);
  if (abs >= 1e7) return `₹${(r / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(r / 1e5).toFixed(2)} L`;
  return formatAmount(r, { symbol: true, decimals: 0 });
}
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
export const qtyFmt = (n: number) => num.format(n);
/** "12,730 Kg" — or "12.73 MT" for per-ton materials when `tons`. */
export function qtyWithUnit(material: MaterialId, qty: number, { tons = false } = {}) {
  const m = MATERIAL_BY_ID[material];
  if (tons && m.rateBasis === 'ton') return `${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(qty / 1000)} MT`;
  return `${num.format(qty)} ${m.unit}`;
}
/** "₹7,700.00/Ton" */
export const rateFmt = (material: MaterialId, paise: number) => `${inr(paise)}/${rateUnitOf(MATERIAL_BY_ID[material])}`;
export const materialLabel = (m: MaterialId) => MATERIAL_BY_ID[m].label;

const STATUS: Record<EntryStatus, { tone: Tone; label: string }> = {
  draft: { tone: 'neutral', label: 'Draft' },
  pending: { tone: 'amber', label: 'Awaiting approval' },
  approved: { tone: 'green', label: 'Approved' },
};
export function EntryStatusPill({ status }: { status: EntryStatus | 'pending' | 'approved' }) {
  const s = STATUS[status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export function NotePill({ kind, type }: { kind: 'qty' | 'rate'; type: 'dn' | 'cn' }) {
  if (kind === 'qty') return <Pill tone={type === 'dn' ? 'red' : 'green'}>{type === 'dn' ? 'Debit note' : 'Credit note'}</Pill>;
  return <Pill tone={type === 'dn' ? 'amber' : 'green'}>{type === 'dn' ? 'Rate DN' : 'Rate CN'}</Pill>;
}

export const NOTE_STATUS_TONE: Record<NoteStatus, Tone> = { Pending: 'amber', 'Under Review': 'amber', Issued: 'purple', Settled: 'green', Cancelled: 'neutral' };

/** The FY in the URL, or the current FY once the meta has loaded. */
export function useFy(urlFy: string) {
  const meta = usePurchaseMeta().data;
  return { fy: urlFy || meta?.currentFy || '', fys: meta?.fys ?? [], meta };
}

export function FySelect({ value, fys, onChange }: { value: string; fys: string[]; onChange: (fy: string) => void }) {
  return (
    <Select
      aria-label="Financial year"
      options={(fys.length ? fys : [value]).filter(Boolean).map((f) => ({ value: f, label: `FY ${f}` }))}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      containerClassName="w-[130px]"
    />
  );
}

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
/** The twelve months of an FY as YYYY-MM. */
export function fyMonths(fy: string) {
  if (!fy) return [];
  const y = fyStartYear(fy);
  return MONTHS.map((label, i) => {
    const year = i < 9 ? y : y + 1;
    const month = ((i + 3) % 12) + 1;
    return { value: `${year}-${String(month).padStart(2, '0')}`, label: `${label} ${year}` };
  });
}

export function MonthSelect({ fy, value, onChange }: { fy: string; value: string; onChange: (m: string) => void }) {
  return <Select aria-label="Month" placeholder="Whole year" options={fyMonths(fy)} value={value} onChange={(e) => onChange(e.target.value)} containerClassName="w-[150px]" />;
}

/** Labelled horizontal bars with the value printed (colour never carries meaning alone). */
export function BarList({ rows, format, empty = 'No data' }: { rows: { label: string; value: number }[]; format: (v: number) => string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="truncate text-base">{r.label}</span>
          <span className="text-base font-semibold tabular-nums">{format(r.value)}</span>
          <span className="col-span-2 h-1.5 rounded-full bg-subtle">
            <span className="block h-full rounded-full bg-chart-s1" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
/** "2026-04" → "Apr 2026" */
export const monthLabel = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

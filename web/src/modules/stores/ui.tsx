import { Check } from 'lucide-react';
import { qualityLabel, storeItemLabel, storeMaterialLabel, type GrnStatus, type GrnView, type MrnStatus, type QualityStatus, type StoreProductOption, type StoreUnit } from '@contracts/stores';
import { Pill } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { Tone } from '@/lib/status';

const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
export const qtyFmt = (n: number) => num.format(n);
export const materialLabel = storeMaterialLabel;

/** "Nilgiri Wood, Resin +1 more" (legacy mrnItemsSummary). */
/** The store unit closest to a product-master unit. */
export function storeUnitFor(productUnit: string): StoreUnit {
  const u = productUnit.toLowerCase();
  if (u === 'kg' || u === 'gram') return 'Kg';
  if (u === 'mt') return 'MT';
  if (u === 'sheets') return 'Sheets';
  if (u === 'bundle') return 'Bundle';
  if (u === 'litre' || u === 'ml') return 'Litre';
  if (u === 'roll') return 'Roll';
  return 'Nos';
}

/** Product master options for a line picker; older lines (a material, no product) stay pickable under their material's name. */
export function productComboOptions(products: StoreProductOption[], keep: { itemId: string | null; material: string | null }[]) {
  const opts = products.map((p) => ({ id: p.id, label: p.name, hint: p.categoryName || null }));
  for (const k of keep) if (!k.itemId && k.material && !opts.some((o) => o.id === `mat:${k.material}`)) opts.push({ id: `mat:${k.material}`, label: storeMaterialLabel(k.material), hint: 'material, before products were picked' });
  return opts;
}

export function itemsSummary(items: { material: string; itemName?: string | null }[]) {
  if (!items.length) return '—';
  const names = items.map(storeItemLabel);
  return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
}
/** "12,000 Kg + 500 Kg" */
export const qtySummary = (items: { qty: number; unit: string }[]) => (items.length ? items.map((i) => `${qtyFmt(i.qty)} ${i.unit}`).join(' + ') : '—');

/** "28 Sept 2026, 10:15" */
export const dateTime = (date: string, time: string) => `${formatDate(date)}, ${time}`;
export const stamp = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';

export function MrnStatusPill({ status }: { status: MrnStatus }) {
  return status === 'pending_grn' ? <Pill tone="amber">Pending GRN</Pill> : <Pill tone="green">GRN created</Pill>;
}

const GRN_STATUS: Record<GrnStatus, { tone: Tone; label: string }> = {
  draft: { tone: 'neutral', label: 'Draft' },
  reviewed: { tone: 'amber', label: 'Reviewed' },
  approved: { tone: 'green', label: 'Approved' },
};
export const grnStatusLabel = (s: GrnStatus) => GRN_STATUS[s].label;
export function GrnStatusPill({ status }: { status: GrnStatus }) {
  return <Pill tone={GRN_STATUS[status].tone}>{GRN_STATUS[status].label}</Pill>;
}

const QUALITY_TONE: Record<QualityStatus, Tone> = { ok: 'green', excess: 'amber', partial: 'amber', short: 'red', damaged: 'red' };
export function QualityPill({ quality }: { quality: QualityStatus | null }) {
  if (!quality) return <span className="text-muted">—</span>;
  return <Pill tone={QUALITY_TONE[quality]}>{qualityLabel(quality)}</Pill>;
}

export function AccountedPill({ grn }: { grn: Pick<GrnView, 'status' | 'accounted'> }) {
  if (grn.status !== 'approved') return <span className="text-muted">—</span>;
  return grn.accounted ? <Pill tone="green">Accounted</Pill> : <Pill tone="amber">Pending accounting</Pill>;
}

/** Waiting time: grey up to a day, amber 2–3 days, red after (legacy thresholds). */
export function DaysPill({ days }: { days: number }) {
  const tone: Tone = days > 3 ? 'red' : days > 1 ? 'amber' : 'neutral';
  return <Pill tone={tone}>{days === 1 ? '1 day' : `${days} days`}</Pill>;
}

/** Draft → Reviewed → Approved with the current step marked (legacy statusFlowHtml). */
export function StatusFlow({ status }: { status: GrnStatus }) {
  const steps: GrnStatus[] = ['draft', 'reviewed', 'approved'];
  const at = steps.indexOf(status);
  return (
    <ol className="flex items-center gap-1 text-caption" aria-label={`Status: ${grnStatusLabel(status)}`}>
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span
            className={
              i < at ? 'inline-flex items-center gap-0.5 font-medium text-green' : i === at ? 'rounded bg-subtle px-1.5 py-0.5 font-semibold text-ink' : 'text-faint'
            }
            aria-current={i === at ? 'step' : undefined}
          >
            {i < at && <Check size={11} strokeWidth={2.5} aria-hidden />}
            {grnStatusLabel(s)}
          </span>
          {i < steps.length - 1 && <span className="text-faint" aria-hidden>→</span>}
        </li>
      ))}
    </ol>
  );
}

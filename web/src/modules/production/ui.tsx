import type { MattStatus, WfState, WfStep } from '@contracts/production';
import { Pill, Select } from '@/components/ui';
import { formatAmount } from '@/lib/format';
import type { Tone } from '@/lib/status';
import { useProductionMeta } from './api';

const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
export const qtyFmt = (n: number) => num.format(n);
export const kg = (n: number) => `${num.format(n)} kg`;
/** ₹ from paise. */
export const inr = (paise: number) => formatAmount(paise / 100, { symbol: true });
/** "₹7.50/kg" from paise per ton. */
export const perKg = (paisePerTon: number) => `${formatAmount(paisePerTon / 100_000, { symbol: true })}/kg`;
export const mins = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;
export const stamp = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

const WF: Record<WfState, { tone: Tone; label: string }> = {
  draft: { tone: 'neutral', label: 'Draft' },
  review: { tone: 'amber', label: 'Sent for review' },
  reviewed: { tone: 'purple', label: 'Reviewed' },
  approved: { tone: 'green', label: 'Approved' },
};
export const wfLabel = (s: WfState) => WF[s].label;
export function WfPill({ state }: { state: WfState }) {
  return <Pill tone={WF[state].tone}>{WF[state].label}</Pill>;
}

const STEP: Record<WfStep['action'], string> = { send: 'Sent for review', review: 'Reviewed', return: 'Returned', approve: 'Approved', reject: 'Rejected', edit: 'Edited' };
export function Trail({ steps }: { steps: WfStep[] }) {
  if (!steps.length) return <p className="text-sm text-muted">Not sent for review yet.</p>;
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Review history">
      {steps.map((s, i) => (
        <li key={i} className="text-sm">
          <span className="font-semibold">{STEP[s.action]}</span> <span className="text-muted">by {s.byName ?? '—'}, {stamp(s.at)}</span>
          {s.note && <span className="block text-caption text-muted">“{s.note}”</span>}
        </li>
      ))}
    </ol>
  );
}

const MATT: Record<MattStatus, { tone: Tone; label: string }> = { pass: { tone: 'green', label: 'Pass' }, warn: { tone: 'amber', label: 'Warn' }, fail: { tone: 'red', label: 'Reject' } };
export function MattPill({ status }: { status: MattStatus }) {
  return <Pill tone={MATT[status].tone}>{MATT[status].label}</Pill>;
}

/** Reject % colour: green ≤ 2, amber ≤ 5, red above (legacy thresholds). */
export const rejectTone = (pct: number): Tone => (pct > 5 ? 'red' : pct > 2 ? 'amber' : 'green');

export function FySelect({ value, onChange }: { value: string; onChange: (fy: string) => void }) {
  const fys = useProductionMeta().data?.fys ?? [];
  return <Select aria-label="Financial year" placeholder="All years" options={fys.map((f) => ({ value: f, label: `FY ${f}` }))} value={value} onChange={(e) => onChange(e.target.value)} containerClassName="w-[130px]" />;
}

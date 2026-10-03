import { ALERT_DEPTS, familyLabel, type Department, type MoveKind, type SkuGroup } from '@contracts/stock';
import { Pill } from '@/components/ui';
import type { Tone } from '@/lib/status';

const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
export const qtyFmt = (n: number) => num.format(n);
/** "−30" / "+30" */
export const signed = (n: number) => (n < 0 ? `−${qtyFmt(-n)}` : `+${qtyFmt(n)}`);
export const isAlertDept = (d: Department | null) => !!d && ALERT_DEPTS.includes(d);

const KIND: Record<MoveKind, { tone: Tone; label: string }> = {
  SIS: { tone: 'red', label: 'SIS' },
  SRS: { tone: 'green', label: 'SRS' },
  STR: { tone: 'purple', label: 'STR' },
  opening: { tone: 'neutral', label: 'Opening' },
};
export function KindPill({ kind }: { kind: MoveKind }) {
  return <Pill tone={KIND[kind].tone}>{KIND[kind].label}</Pill>;
}
export const SLIP_TYPE_LABEL = { SIS: 'Stock issue slip (SIS)', SRS: 'Stock receipt slip (SRS)' } as const;

export function FamilyPill({ family }: { family: string }) {
  return <Pill>{familyLabel(family)}</Pill>;
}

/** "OC-611 __ · OSB-CAL Graded A – 2590×1320" for pickers; "__" marks a thickness to pick. */
export const groupOption = (g: SkuGroup) => ({ value: g.id, label: `${g.prefix}${g.thicknesses.length ? ' __' : ''} · ${g.label}`, group: g.dept });

/** "OSB-CAL Graded A – 2590×1320 · 12 mm · Gr. A" (the size only when the label doesn't already say it). */
export const skuDetail = (i: { label: string; thick: string | null; size: string | null; grade: string | null }) =>
  [i.label, i.thick && `${i.thick} mm`, i.size && !i.label.includes(i.size) && i.size, i.grade && `Gr. ${i.grade}`].filter(Boolean).join(' · ');

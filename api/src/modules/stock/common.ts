import { skuCode, type LedgerLeg, type MoveKind, type SkuGroup, type SkuInfo, type SkuRef } from '../../contracts/stock';
import type { Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { validationFailed } from '../../lib/errors';
import type { Repos } from '../../repos';

/** Quantities are kept to 3 decimals (kg); avoids 0.1 + 0.2 drift in sums. */
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export const groupInfo = (g: SkuGroup, thick: string | null): Omit<SkuInfo, 'qty'> => ({
  sku: skuCode(g, thick),
  groupId: g.id,
  prefix: g.prefix,
  thick: g.thicknesses.length ? thick : null,
  label: g.label,
  family: g.family,
  dept: g.dept,
  size: g.size,
  grade: g.grade,
  unit: g.unit,
});

/** Group id → group, for building SKU details. */
export async function groupMap(repos: Repos) {
  return new Map((await repos.skuGroups.listAll()).map((g) => [g.id, g]));
}

/** Checks a picked group + thickness and returns the stored reference. */
export async function resolveSide(repos: Repos, side: { groupId: string; thick?: string | null }, path: string): Promise<SkuRef> {
  const g = await repos.skuGroups.getById(side.groupId);
  if (!g) throw validationFailed('Invalid input', [{ path: `${path}.groupId`, message: 'Unknown item' }]);
  if (g.thicknesses.length) {
    if (!side.thick) throw validationFailed('Invalid input', [{ path: `${path}.thick`, message: 'Pick the thickness' }]);
    if (!g.thicknesses.includes(side.thick)) throw validationFailed('Invalid input', [{ path: `${path}.thick`, message: `${g.prefix} doesn’t come in ${side.thick} mm` }]);
    return { groupId: g.id, thick: side.thick, sku: skuCode(g, side.thick) };
  }
  return { groupId: g.id, thick: null, sku: g.prefix };
}

/** Every leg of every live movement, oldest first: opening (+), slips and reclasses (− from, + to). */
export async function allLegs(repos: Repos): Promise<LedgerLeg[]> {
  const [groups, opening, slips, reclasses] = await Promise.all([groupMap(repos), repos.stockOpening.listAll(), repos.stockSlips.listAll(), repos.reclasses.listAll()]);
  const legs: LedgerLeg[] = [];
  const leg = (kind: MoveKind, doc: { id: string; date: string; createdAt: string }, docNo: string, ref: SkuRef, qty: number) =>
    legs.push({ kind, docId: doc.id, docNo, date: doc.date, createdAt: doc.createdAt, sku: ref.sku, groupId: ref.groupId, thick: ref.thick, dept: groups.get(ref.groupId)?.dept ?? null, qty });
  for (const o of opening) leg('opening', o, 'Opening', o.item, o.qty);
  for (const s of slips) {
    leg(s.type, s, s.slipNo, s.from, -s.qty);
    leg(s.type, s, s.slipNo, s.to, s.qty);
  }
  for (const r of reclasses) {
    leg('STR', r, r.strNo, r.from, -r.qty);
    leg('STR', r, r.strNo, r.to, r.qty);
  }
  // Same day: in the order they were entered; within one document the MINUS leg first.
  return legs.map((l, i) => ({ l, i })).sort((a, b) => a.l.date.localeCompare(b.l.date) || a.l.createdAt.localeCompare(b.l.createdAt) || a.i - b.i).map((x) => x.l);
}

/** SKU → current balance. */
export async function balances(repos: Repos): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const l of await allLegs(repos)) out.set(l.sku, round3((out.get(l.sku) ?? 0) + l.qty));
  return out;
}

/** Document dates default to today and can't be in the future. */
export function docDate(input: string | undefined, clock: Clock) {
  const today = businessToday(clock);
  const d = input ?? today;
  if (d > today) throw validationFailed('Invalid input', [{ path: 'date', message: 'The date can’t be in the future' }]);
  return d;
}

/** ISS/2026/001: counter per prefix per calendar year of the document date (legacy genNo). */
export async function nextNo(tx: Repos, prefix: 'ISS' | 'MRS' | 'STR', date: string, at: string) {
  const year = date.slice(0, 4);
  const n = await tx.counters.next(`${prefix}-${year}`, at);
  return `${prefix}/${year}/${String(n).padStart(3, '0')}`;
}

import {
  DEFAULT_PLAN_SETTINGS,
  DEFAULT_SIZES,
  DEFAULT_THICKNESSES,
  round3,
  type LotOption,
  type ProductionSettings,
  type WipBatchView,
  type WipLedgerRow,
} from '../../contracts/production';
import { fyLabel, fyOf, type MaterialId } from '../../contracts/purchase';
import type { Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { conflict } from '../../lib/errors';
import type { Repos } from '../../repos';

export const SETTING_KEYS = {
  thicknesses: 'production.thicknesses',
  sizes: 'production.sizes',
  boardsPerCharge: 'production.boards_per_charge',
  wetWoodFactor: 'production.wet_wood_factor',
  closedFys: 'production.closed_fys',
} as const;

export async function readSettings(repos: Repos): Promise<ProductionSettings> {
  const v = await repos.settings.getMany(Object.values(SETTING_KEYS));
  const arr = (x: unknown, d: string[]) => (Array.isArray(x) ? (x as unknown[]).map(String) : d);
  const n = (x: unknown, d: number) => (typeof x === 'number' && x > 0 ? x : d);
  return {
    thicknesses: arr(v[SETTING_KEYS.thicknesses], DEFAULT_THICKNESSES),
    sizes: arr(v[SETTING_KEYS.sizes], DEFAULT_SIZES),
    boardsPerCharge: n(v[SETTING_KEYS.boardsPerCharge], DEFAULT_PLAN_SETTINGS.boardsPerCharge),
    wetWoodFactor: n(v[SETTING_KEYS.wetWoodFactor], DEFAULT_PLAN_SETTINGS.wetWoodFactor),
    closedFys: arr(v[SETTING_KEYS.closedFys], []),
  };
}

/** Records dated in a closed FY can't be added, changed, deleted or signed off (legacy fyGuardRecord). */
export async function guardFy(repos: Repos, ...dates: (string | undefined | null)[]) {
  const closed = (await readSettings(repos)).closedFys;
  for (const d of dates) {
    if (!d) continue;
    const fy = fyOf(d);
    if (closed.includes(fy)) throw conflict('fy_closed', `FY ${fy} is closed. Reopen it in Production settings to change its records.`);
  }
}

export const currentFy = (clock: Clock) => fyOf(businessToday(clock));

/** This FY back to 2024-25, newest first. */
export function fyOptions(clock: Clock): string[] {
  const cur = Number(currentFy(clock).slice(0, 4));
  const out: string[] = [];
  for (let y = cur; y >= Math.min(cur, 2024); y--) out.push(fyLabel(y));
  return out;
}

/** HP-0001: one counter per prefix (legacy newId), taken in the insert's unit of work. */
export async function nextDocNo(tx: Repos, prefix: string, at: string) {
  return `${prefix}-${String(await tx.counters.next(`PR-${prefix}`, at)).padStart(4, '0')}`;
}

/** Names of the given users. */
export async function nameMap(repos: Repos, ids: (string | null)[]) {
  const users = await repos.users.getByIds([...new Set(ids.filter((x): x is string => !!x))]);
  return (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? null) : null);
}

/** Net rate per ton: invoice rate minus a debit-note difference, plus a credit-note one (legacy getNetRate). */
export const netRate = (ratePaise: number, rateDiffPaise: number) => ratePaise - rateDiffPaise;
/** Paise for kg at a per-ton rate. */
export const amountFor = (kg: number, ratePaisePerTon: number) => Math.round((kg * ratePaisePerTon) / 1000);

/**
 * Purchase lots of a material that production draws from (posted entries only), with what chipping
 * (nilgiri) or resin consumption has used. `exceptDocId` leaves out one document's own use, for edits.
 */
export async function lotOptions(repos: Repos, material: Extract<MaterialId, 'nilgiri' | 'resin'>, exceptDocId?: string): Promise<LotOption[]> {
  const [all, used] = await Promise.all([repos.purchaseEntries.listBetween('0000-01-01', '9999-12-31'), lotUse(repos, material, exceptDocId)]);
  return all.filter((e) => e.material === material && e.status !== 'draft').map((e) => {
    const usedKg = round3(used.get(e.id) ?? 0);
    return {
      purchaseEntryId: e.id,
      lotNo: e.lotNo,
      date: e.date,
      vendorName: e.vendorName,
      invoiceNo: e.invoiceNo,
      receivedKg: e.splQty,
      usedKg,
      availKg: round3(e.splQty - usedKg),
      netRatePaise: netRate(e.ratePaise, e.rateDiffPaise),
      invoiceRatePaise: e.ratePaise,
      rateDiffPaise: e.rateDiffPaise,
    };
  });
}

async function lotUse(repos: Repos, material: 'nilgiri' | 'resin', exceptDocId?: string) {
  const used = new Map<string, number>();
  const add = (id: string, q: number) => used.set(id, (used.get(id) ?? 0) + q);
  if (material === 'nilgiri') for (const c of await repos.prodChipping.listAll()) if (c.id !== exceptDocId) for (const l of c.lots) add(l.purchaseEntryId, l.qty);
  if (material === 'resin') for (const r of await repos.prodResin.listAll()) if (r.id !== exceptDocId) add(r.lot.purchaseEntryId, r.lot.qty);
  return used;
}

/** Every WIP batch with its totals (from its chipping report), use (production summaries) and adjustments. */
export async function wipViews(repos: Repos, exceptSummaryId?: string): Promise<WipBatchView[]> {
  const [batches, chips, summaries, adjustments] = await Promise.all([repos.wipBatches.listAll(), repos.prodChipping.listAll(), repos.prodSummary.listAll(), repos.wipAdjustments.listAll()]);
  const chipById = new Map(chips.map((c) => [c.id, c]));
  return batches.map((b) => {
    const chip = chipById.get(b.chippingId);
    const totalKg = round3(chip?.lots.reduce((s, l) => s + l.qty, 0) ?? 0);
    const totalPaise = chip?.lots.reduce((s, l) => s + l.amountPaise, 0) ?? 0;
    const usedKg = round3(summaries.filter((s) => s.id !== exceptSummaryId).reduce((t, s) => t + s.wip.filter((w) => w.wipId === b.id).reduce((u, w) => u + w.qty, 0), 0));
    const adjustKg = round3(adjustments.filter((a) => a.wipId === b.id).reduce((t, a) => t + a.qty, 0));
    const availKg = round3(totalKg - usedKg + adjustKg);
    return {
      ...b,
      chippingNo: chip?.docNo ?? '—',
      totalKg,
      totalPaise,
      avgRatePaise: totalKg > 0 ? Math.round((totalPaise / totalKg) * 1000) : 0,
      usedKg,
      adjustKg,
      availKg,
      status: availKg < 0 ? 'negative' : usedKg - adjustKg <= 0 ? 'available' : availKg <= 0 ? 'consumed' : 'partly used',
    };
  });
}

/** WIP Nilgiri stock card (legacy WIP_LEDGER), derived: IN on creation, OUT per summary, ± adjustments. */
export async function wipLedger(repos: Repos, wipId?: string): Promise<WipLedgerRow[]> {
  const [views, summaries, adjustments] = await Promise.all([wipViews(repos), repos.prodSummary.listAll(), repos.wipAdjustments.listAll()]);
  const rows: Omit<WipLedgerRow, 'balance'>[] = [];
  for (const b of views.filter((v) => !wipId || v.id === wipId)) {
    const base = { wipId: b.id, wipNo: b.docNo, ratePaise: b.avgRatePaise };
    rows.push({ ...base, date: b.date, at: b.createdAt, type: 'IN', qty: b.totalKg, amountPaise: b.totalPaise, refType: 'Chipping', refId: b.chippingId, refNo: b.chippingNo, remarks: `WIP batch from ${b.chippingNo}` });
    for (const s of summaries)
      for (const w of s.wip.filter((x) => x.wipId === b.id))
        rows.push({ ...base, date: s.date, at: s.createdAt, type: 'OUT', qty: w.qty, amountPaise: amountFor(w.qty, b.avgRatePaise), refType: 'Production summary', refId: s.id, refNo: s.docNo, remarks: null });
    for (const a of adjustments.filter((x) => x.wipId === b.id))
      rows.push({ ...base, date: a.date, at: a.createdAt, type: a.qty > 0 ? 'IN' : 'OUT', qty: Math.abs(a.qty), amountPaise: amountFor(Math.abs(a.qty), b.avgRatePaise), refType: 'Adjustment', refId: a.id, refNo: null, remarks: a.reason });
  }
  rows.sort((x, y) => x.date.localeCompare(y.date) || x.at.localeCompare(y.at));
  const bal = new Map<string, number>();
  return rows.map((r) => {
    const b = round3((bal.get(r.wipId) ?? 0) + (r.type === 'IN' ? r.qty : -r.qty));
    bal.set(r.wipId, b);
    return { ...r, balance: b };
  });
}

import { calcEntry, fyEnd, fyLabel, fyOf, fyStart, MATERIAL_BY_ID, type MaterialId, type PurchaseEntry, type PurchaseEntryView } from '../../contracts/purchase';
import type { Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import type { DataLayer } from '../../repos';

export const calcOf = (e: Pick<PurchaseEntry, 'material' | 'invQty' | 'splQty' | 'ratePaise' | 'rateDiffPaise' | 'otherChargesPaise' | 'taxType' | 'gstPct'> & Partial<Pick<PurchaseEntry, 'lines' | 'raiseNotes'>>) =>
  calcEntry({
    material: e.material,
    invQty: e.invQty,
    splQty: e.splQty,
    ratePaise: e.ratePaise,
    lines: e.lines,
    raiseNotes: e.raiseNotes,
    rateDiffPaise: e.rateDiffPaise,
    otherChargesPaise: e.otherChargesPaise,
    taxType: e.taxType,
    gstPct: e.gstPct,
  });

/** Posted = counted in registers, notes, stock and reports. Drafts are not. */
export const isPosted = (e: { status: string }) => e.status !== 'draft';

export const currentFy = (clock: Clock) => fyOf(businessToday(clock));
export const fyRange = (fy: string) => ({ from: fyStart(fy), to: fyEnd(fy) });

/** `${YYYY-MM}` → first and last day. */
export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** The ledger row a stock line belongs to: a material, or for Nilgiri the product (`variety`). */
export const ledgerKey = (material: MaterialId, variety: string | null) => (material === 'nilgiri' ? `nilgiri::${variety || 'Unspecified'}` : material);

/** Nilgiri stock is kept per product picked on the entry; entries from before products were picked fall back to their species. */
export const stockVariety = (e: Pick<PurchaseEntry, 'material' | 'itemName' | 'species'>) => (e.material === 'nilgiri' ? e.itemName || e.species || null : null);

/** Quantity returned per lot (entry id), from linked purchase returns. */
export async function returnedByEntry(data: DataLayer): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const r of await data.repos.purchaseReturns.listBetween('0000-01-01', '9999-12-31')) if (r.entryId) out.set(r.entryId, (out.get(r.entryId) ?? 0) + r.qty);
  return out;
}

/** Adds the calculation, PO number, people and document count to entries. */
export async function entryViews(data: DataLayer, rows: PurchaseEntry[]): Promise<PurchaseEntryView[]> {
  if (!rows.length) return [];
  const { purchaseOrders, users, purchaseDocuments } = data.repos;
  const userIds = [...new Set(rows.flatMap((r) => [r.createdBy, r.approvedBy]).filter((x): x is string => !!x))];
  const [pos, people, docs, returned] = await Promise.all([purchaseOrders.listAll(), users.getByIds(userIds), purchaseDocuments.countByEntry(rows.map((r) => r.id)), returnedByEntry(data)]);
  const poNo = new Map(pos.map((p) => [p.id, p.poNo]));
  const name = (id: string | null) => (id ? (people.find((u) => u.id === id)?.name ?? null) : null);
  return rows.map((r) => ({
    ...r,
    lines: r.lines ?? [],
    raiseNotes: r.raiseNotes ?? true,
    calc: calcOf(r),
    returnedQty: Math.round((returned.get(r.id) ?? 0) * 1000) / 1000,
    netQty: Math.round((r.splQty - (returned.get(r.id) ?? 0)) * 1000) / 1000,
    poNo: r.poId ? (poNo.get(r.poId) ?? null) : null,
    approvedByName: name(r.approvedBy),
    createdByName: name(r.createdBy),
    documentCount: docs.get(r.id) ?? 0,
  }));
}

/** FYs to offer: from the earliest entry's FY (or this FY) to next FY, newest first. */
export async function fyList(data: DataLayer, clock: Clock): Promise<string[]> {
  const cur = Number(currentFy(clock).slice(0, 4));
  const first = (await data.repos.purchaseEntries.list({ sort: 'date', pageSize: 1 })).rows[0];
  const start = Math.min(cur, first ? Number(fyOf(first.date).slice(0, 4)) : cur);
  const out: string[] = [];
  for (let y = cur + 1; y >= start; y--) out.push(fyLabel(y));
  return out;
}

export const materialLabel = (m: MaterialId) => MATERIAL_BY_ID[m].label;

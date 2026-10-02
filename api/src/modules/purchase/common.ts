import { calcEntry, fyEnd, fyLabel, fyOf, fyStart, MATERIAL_BY_ID, type MaterialId, type PurchaseEntry, type PurchaseEntryView } from '../../contracts/purchase';
import type { Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import type { DataLayer } from '../../repos';

export const calcOf = (e: Pick<PurchaseEntry, 'material' | 'invQty' | 'splQty' | 'ratePaise' | 'rateDiffPaise' | 'otherChargesPaise' | 'taxType' | 'gstPct'>) =>
  calcEntry({
    material: e.material,
    invQty: e.invQty,
    splQty: e.splQty,
    ratePaise: e.ratePaise,
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

/** The ledger row a Nilgiri entry belongs to. */
export const ledgerKey = (material: MaterialId, species: string | null) => (material === 'nilgiri' ? `nilgiri::${species || 'Unspecified'}` : material);

/** Adds the calculation, PO number, people and document count to entries. */
export async function entryViews(data: DataLayer, rows: PurchaseEntry[]): Promise<PurchaseEntryView[]> {
  if (!rows.length) return [];
  const { purchaseOrders, users, purchaseDocuments } = data.repos;
  const userIds = [...new Set(rows.flatMap((r) => [r.createdBy, r.approvedBy]).filter((x): x is string => !!x))];
  const [pos, people, docs] = await Promise.all([purchaseOrders.listAll(), users.getByIds(userIds), purchaseDocuments.countByEntry(rows.map((r) => r.id))]);
  const poNo = new Map(pos.map((p) => [p.id, p.poNo]));
  const name = (id: string | null) => (id ? (people.find((u) => u.id === id)?.name ?? null) : null);
  return rows.map((r) => ({
    ...r,
    calc: calcOf(r),
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

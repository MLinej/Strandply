// Raw material stock ledger (legacy renderInventory / opening stock module / consumption).
// Opening + purchases (SPL qty) − returns − consumption = closing, per FY, valued at basic (GST is input credit).
import {
  amountFor,
  fyEnd,
  fyOf,
  fyStart,
  MATERIAL_BY_ID,
  MATERIALS,
  prevFy,
  type AgeBucket,
  type InventoryView,
  type LedgerRow,
  type MaterialId,
  type OpeningItem,
  type OpeningStockView,
} from '../../contracts/purchase';
import { isoNow, type Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { conflict, validationFailed } from '../../lib/errors';
import { writeXlsx } from '../../lib/spreadsheet';
import type { DataLayer } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { calcOf, fyRange, isPosted, ledgerKey, materialLabel } from './common';
import type { OpeningStockBody } from './validation';

const rupees = (p: number) => Math.round(p) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const parseKey = (key: string): { material: MaterialId; species: string | null } => {
  const [m, s] = key.split('::') as [MaterialId, string | undefined];
  return { material: m, species: m === 'nilgiri' ? (s ?? 'Unspecified') : null };
};

export class InventoryService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  /** FY of the earliest entry or opening record; nothing is carried forward from before it. */
  private async firstFy(): Promise<string | null> {
    const first = (await this.data.repos.purchaseEntries.list({ sort: 'date', pageSize: 1 })).rows[0];
    return first ? fyOf(first.date) : null;
  }

  /** Ledger keys: every Nilgiri species in the master, plus any species used in this FY's data. */
  private async keys(used: string[]): Promise<string[]> {
    const species = (await this.data.repos.purchaseTypes.listAll('nilgiri_species')).map((t) => `nilgiri::${t.name}`);
    const out: string[] = [];
    for (const m of MATERIALS) {
      if (m.id !== 'nilgiri') out.push(m.id);
      else out.push(...new Set([...species, ...used.filter((k) => k.startsWith('nilgiri::'))]));
    }
    return out;
  }

  async opening(fy: string, depth = 0): Promise<OpeningStockView> {
    const saved = await this.data.repos.openingStock.get(fy);
    if (saved) {
      const people = saved.approvedBy ? await this.data.repos.users.getByIds([saved.approvedBy]) : [];
      const items = saved.items.map((i) => ({ ...i, valuePaise: amountFor(i.material, i.qty, i.ratePaise) }));
      return {
        fy,
        asOnDate: saved.asOnDate,
        source: 'saved',
        status: saved.status,
        approvedByName: people[0]?.name ?? null,
        approvedAt: saved.approvedAt,
        items,
        totalPaise: items.reduce((s, i) => s + i.valuePaise, 0),
      };
    }
    const blank: OpeningStockView = { fy, asOnDate: fyEnd(prevFy(fy)), source: 'blank', status: null, approvedByName: null, approvedAt: null, items: [], totalPaise: 0 };
    const first = await this.firstFy();
    if (!first || fyStart(prevFy(fy)) < fyStart(first) || depth > 20) return blank;
    // Legacy ensureOSRecord: last FY's closing becomes this FY's opening until someone saves one.
    const prev = await this.ledger(prevFy(fy), depth + 1);
    const items = prev.rows
      .filter((r) => r.closingQty > 0)
      .map((r) => ({
        material: r.material,
        species: r.species,
        qty: r.closingQty,
        ratePaise: r.avgRatePaise ?? 0,
        remarks: `Carried from FY ${prevFy(fy)} closing`,
        valuePaise: r.closingPaise,
      }));
    return { ...blank, source: items.length ? 'carried' : 'blank', items, totalPaise: items.reduce((s, i) => s + i.valuePaise, 0) };
  }

  private async ledger(fy: string, depth = 0): Promise<{ rows: LedgerRow[]; opening: OpeningStockView }> {
    const { from, to } = fyRange(fy);
    const [opening, entries, returns, consumption] = await Promise.all([
      this.opening(fy, depth),
      this.data.repos.purchaseEntries.listBetween(from, to),
      this.data.repos.purchaseReturns.listBetween(from, to),
      this.data.repos.consumption.forFy(fy),
    ]);
    const posted = entries.filter(isPosted);
    const used = [
      ...posted.map((e) => ledgerKey(e.material, e.species)),
      ...returns.map((r) => ledgerKey(r.material, r.species)),
      ...opening.items.map((i) => ledgerKey(i.material, i.species)),
      ...Object.keys(consumption),
    ];
    const rows = (await this.keys(used)).map((key): LedgerRow => {
      const { material, species } = parseKey(key);
      const def = MATERIAL_BY_ID[material];
      const open = opening.items.filter((i) => ledgerKey(i.material, i.species) === key);
      const openQty = open.reduce((s, i) => s + i.qty, 0);
      const openPaise = open.reduce((s, i) => s + i.valuePaise, 0);
      const mine = posted.filter((e) => ledgerKey(e.material, e.species) === key);
      const purchQty = mine.reduce((s, e) => s + e.splQty, 0);
      const purchPaise = mine.reduce((s, e) => s + calcOf(e).spl.basic, 0);
      const rets = returns.filter((r) => ledgerKey(r.material, r.species) === key);
      const returnQty = rets.reduce((s, r) => s + r.qty, 0);
      const returnPaise = rets.reduce((s, r) => s + amountFor(r.material, r.qty, r.ratePaise), 0);
      const preQty = openQty + purchQty - returnQty;
      const prePaise = openPaise + purchPaise - returnPaise;
      const rateUnits = def.rateBasis === 'ton' ? preQty / 1000 : preQty;
      const avgRatePaise = rateUnits > 0 ? Math.round(prePaise / rateUnits) : null;
      const consumeQty = consumption[key] ?? 0;
      const consumePaise = avgRatePaise ? amountFor(material, consumeQty, avgRatePaise) : 0;
      return {
        key,
        material,
        species,
        openQty: round3(openQty),
        openPaise,
        purchQty: round3(purchQty),
        purchPaise,
        returnQty: round3(returnQty),
        returnPaise,
        consumeQty: round3(consumeQty),
        consumePaise,
        closingQty: round3(preQty - consumeQty),
        closingPaise: prePaise - consumePaise,
        avgRatePaise,
        entries: mine.length,
      };
    });
    return { rows, opening };
  }

  /**
   * Closing stock age per material, FIFO: what is left is the newest receipts, so walk receipts
   * newest first until the closing quantity is covered. Anything beyond the FY's receipts is opening stock.
   */
  private async ageing(fy: string, rows: LedgerRow[]): Promise<InventoryView['ageing']> {
    const { from, to } = fyRange(fy);
    const today = businessToday(this.clock);
    const asOf = today < to ? today : to;
    const entries = (await this.data.repos.purchaseEntries.listBetween(from, asOf)).filter(isPosted).reverse();
    return MATERIALS.map((m) => {
      let left = rows.filter((r) => r.material === m.id).reduce((s, r) => s + Math.max(0, r.closingQty), 0);
      const buckets: AgeBucket[] = ['0–30 days', '31–60 days', '61–90 days', '90+ days', 'Opening stock'].map((label) => ({ label, qty: 0, paise: 0 }));
      for (const e of entries) {
        if (left <= 0) break;
        if (e.material !== m.id || e.splQty <= 0) continue;
        const take = Math.min(left, e.splQty);
        const age = days(e.date, asOf);
        const b = buckets[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3]!;
        b.qty += take;
        b.paise += Math.round((calcOf(e).spl.basic * take) / e.splQty);
        left -= take;
      }
      if (left > 0) {
        const rate = rows.find((r) => r.material === m.id && r.avgRatePaise)?.avgRatePaise ?? 0;
        buckets[4]!.qty += left;
        buckets[4]!.paise += amountFor(m.id, left, rate);
      }
      return { material: m.id, buckets: buckets.map((b) => ({ ...b, qty: round3(b.qty) })) };
    });
  }

  async view(fy: string): Promise<InventoryView> {
    const { rows, opening } = await this.ledger(fy);
    return { fy, opening, rows, ageing: await this.ageing(fy, rows) };
  }

  /** Total closing value for the dashboard. */
  async closingPaise(fy: string): Promise<number> {
    return (await this.ledger(fy)).rows.reduce((s, r) => s + r.closingPaise, 0);
  }

  async saveOpening(actor: Actor, fy: string, input: OpeningStockBody): Promise<OpeningStockView> {
    const items: OpeningItem[] = [];
    const seen = new Set<string>();
    for (const i of input.items) {
      if (i.material !== 'nilgiri' && i.species) throw validationFailed('Invalid input', [{ path: 'items', message: 'Only Nilgiri lines have a species' }]);
      const key = ledgerKey(i.material, i.species ?? null);
      if (seen.has(key)) throw validationFailed('Invalid input', [{ path: 'items', message: `${materialLabel(i.material)}${i.species ? ` (${i.species})` : ''} is listed twice` }]);
      seen.add(key);
      if (i.qty > 0 || i.ratePaise > 0) items.push({ material: i.material, species: i.material === 'nilgiri' ? (i.species ?? 'Unspecified') : null, qty: i.qty, ratePaise: i.ratePaise, remarks: i.remarks ?? null });
    }
    await this.data.uow.run(async (tx) => {
      const prev = await tx.openingStock.get(fy);
      if (prev?.status === 'approved') throw conflict('opening_locked', `Opening stock for FY ${fy} is approved and locked. Unlock it first.`);
      const at = isoNow(this.clock);
      await tx.openingStock.put({
        fy,
        asOnDate: input.asOnDate,
        items,
        status: input.mode === 'submit' ? 'pending' : 'draft',
        approvedBy: null,
        approvedAt: null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, {
        action: prev ? 'Edit' : 'Create',
        entityType: 'purchase_opening',
        entityId: fy,
        details: `${input.mode === 'submit' ? 'Saved opening stock for approval' : 'Saved opening stock draft'}, FY ${fy} (${items.length} lines)`,
      });
    });
    return this.opening(fy);
  }

  /** approve: pending → approved (locked). unlock: approved → draft, so it can be corrected and re-approved. */
  async setOpeningApproval(actor: Actor, fy: string, action: 'approve' | 'unlock'): Promise<OpeningStockView> {
    await this.data.uow.run(async (tx) => {
      const os = await tx.openingStock.get(fy);
      if (!os) throw conflict('opening_missing', `No opening stock saved for FY ${fy}`);
      const at = isoNow(this.clock);
      if (action === 'approve') {
        if (os.status !== 'pending') throw conflict('not_submitted', os.status === 'approved' ? 'Already approved' : 'Submit the opening stock for approval first');
        await tx.openingStock.put({ ...os, status: 'approved', approvedBy: actor.id, approvedAt: at, updatedAt: at });
      } else {
        if (os.status !== 'approved') throw conflict('not_locked', 'Opening stock is not locked');
        await tx.openingStock.put({ ...os, status: 'draft', approvedBy: null, approvedAt: null, updatedAt: at });
      }
      await this.activity.record(tx, actor, {
        action: action === 'approve' ? 'Approve' : 'StatusChange',
        entityType: 'purchase_opening',
        entityId: fy,
        details: action === 'approve' ? `Approved opening stock for FY ${fy}` : `Unlocked opening stock for FY ${fy}`,
      });
    });
    return this.opening(fy);
  }

  /** Consumption per FY and ledger key (from the chipping/production report; legacy setConsumption). */
  async setConsumption(actor: Actor, fy: string, key: string, qty: number): Promise<void> {
    const material = key.split('::')[0] as MaterialId;
    if (!MATERIAL_BY_ID[material] || (material === 'nilgiri') !== key.includes('::')) {
      throw validationFailed('Invalid input', [{ path: 'key', message: 'Unknown ledger row' }]);
    }
    await this.data.uow.run(async (tx) => {
      await tx.consumption.set(fy, key, qty, actor.id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'purchase_consumption', entityId: `${fy}|${key}`, details: `Set consumption for ${key.replace('::', ' — ')}, FY ${fy}: ${qty}` });
    });
  }

  async exportXlsx(actor: Actor, fy: string): Promise<Uint8Array> {
    const v = await this.view(fy);
    type Item = OpeningStockView['items'][number];
    const label = (m: MaterialId, s: string | null) => `${materialLabel(m)}${s ? ` — ${s}` : ''}`;
    const bytes = writeXlsx([
      {
        name: 'Opening Stock',
        rows: v.opening.items,
        columns: [
          { header: 'Material', value: (i: Item) => label(i.material, i.species) },
          { header: 'Unit', value: (i: Item) => MATERIAL_BY_ID[i.material].unit },
          { header: 'Qty', value: (i: Item) => i.qty },
          { header: 'Rate (₹)', value: (i: Item) => rupees(i.ratePaise) },
          { header: 'Value (₹)', value: (i: Item) => rupees(i.valuePaise) },
          { header: 'Remarks', value: (i: Item) => i.remarks },
          { header: 'As-on Date', value: () => v.opening.asOnDate },
          { header: 'Status', value: () => v.opening.status ?? v.opening.source },
        ],
      },
      {
        name: 'Stock Ledger',
        rows: v.rows,
        columns: [
          { header: 'Material', value: (r: LedgerRow) => label(r.material, r.species) },
          { header: 'Unit', value: (r: LedgerRow) => MATERIAL_BY_ID[r.material].unit },
          { header: 'Opening Qty', value: (r: LedgerRow) => r.openQty },
          { header: 'Opening (₹)', value: (r: LedgerRow) => rupees(r.openPaise) },
          { header: 'Purchased Qty', value: (r: LedgerRow) => r.purchQty },
          { header: 'Purchased (₹)', value: (r: LedgerRow) => rupees(r.purchPaise) },
          { header: 'Returns Qty', value: (r: LedgerRow) => r.returnQty },
          { header: 'Returns (₹)', value: (r: LedgerRow) => rupees(r.returnPaise) },
          { header: 'Consumption Qty', value: (r: LedgerRow) => r.consumeQty },
          { header: 'Consumption (₹)', value: (r: LedgerRow) => rupees(r.consumePaise) },
          { header: 'Closing Qty', value: (r: LedgerRow) => r.closingQty },
          { header: 'Closing (₹)', value: (r: LedgerRow) => rupees(r.closingPaise) },
          { header: 'Avg Rate (₹)', value: (r: LedgerRow) => (r.avgRatePaise === null ? null : rupees(r.avgRatePaise)) },
        ],
      },
    ]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'purchase_inventory', details: `Exported stock ledger FY ${fy}` }));
    return bytes;
  }
}

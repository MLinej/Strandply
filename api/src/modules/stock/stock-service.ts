import {
  ALERT_DEPTS,
  DEPARTMENTS,
  STAGES,
  skuCode,
  type Department,
  type Family,
  type LedgerLeg,
  type LiveStock,
  type OpeningEntry,
  type OpeningView,
  type Reclass,
  type ReclassView,
  type SkuGroup,
  type SkuInfo,
  type SlipFilters,
  type SlipView,
  type StockDashboard,
  type StockSlip,
} from '../../contracts/stock';
import type { CompanyBlock } from '../../contracts/sampletrack';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { conflict, notFound, validationFailed } from '../../lib/errors';
import { writeXlsx, type Column } from '../../lib/spreadsheet';
import type { DataLayer, ListQuery, Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { collectAll } from '../sampletrack/masters/common';
import type { CompanyService } from '../sampletrack/settings/company-service';
import { allLegs, balances, docDate, groupInfo, groupMap, nextNo, resolveSide, round3 } from './common';
import type { OpeningCreate, ReclassCreate, SlipCreate } from './validation';

export interface SlipPrintPayload {
  company: CompanyBlock;
  slip: SlipView;
  generatedAt: string;
}

export interface SkuLedger {
  sku: string | null;
  /** Balance brought forward to `from` (per SKU when one is picked; 0 for all). */
  openingQty: number;
  legs: LedgerLeg[];
  totals: { out: number; in: number; net: number };
  closingQty: number;
}
export interface DeptLedger {
  depts: { dept: Department; legs: LedgerLeg[]; out: number; in: number; net: number }[];
}
/** Daily movement: one row per slip / reclass (opening entries are not movements between locations). */
export interface MovementRow {
  kind: 'SIS' | 'SRS' | 'STR';
  docId: string;
  docNo: string;
  date: string;
  fromSku: string;
  toSku: string;
  fromDept: Department | null;
  toDept: Department | null;
  label: string | null;
  thick: string | null;
  qty: number;
}
export interface Range {
  from?: string;
  to?: string;
}
const inRange = (d: string, r: Range) => (!r.from || d >= r.from) && (!r.to || d <= r.to);
export type ExportKind = 'slips' | 'stock' | 'sku-ledger' | 'dept-ledger' | 'movements';

/** Slips, opening stock, reclassification, ledgers and live stock (legacy saveSlip, saveOpening, saveReclass, render*). */
export class StockService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly company: CompanyService,
    private readonly clock: Clock,
  ) {}

  // ── Views ──────────────────────────────────────────────────────────

  private async people(ids: (string | null)[]) {
    const want = [...new Set(ids.filter((x): x is string => !!x))];
    const users = await this.data.repos.users.getByIds(want);
    return (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? null) : null);
  }
  private info(groups: Map<string, SkuGroup>, groupId: string, thick: string | null) {
    const g = groups.get(groupId);
    return g ? groupInfo(g, thick) : null;
  }

  private async slipViews(rows: StockSlip[]): Promise<SlipView[]> {
    const [groups, name] = await Promise.all([groupMap(this.data.repos), this.people(rows.map((r) => r.createdBy))]);
    return rows.map((s) => ({ ...s, fromInfo: this.info(groups, s.from.groupId, s.from.thick), toInfo: this.info(groups, s.to.groupId, s.to.thick), createdByName: name(s.createdBy) }));
  }
  private async reclassViews(rows: Reclass[]): Promise<ReclassView[]> {
    const [groups, name] = await Promise.all([groupMap(this.data.repos), this.people(rows.map((r) => r.createdBy))]);
    return rows.map((s) => ({ ...s, fromInfo: this.info(groups, s.from.groupId, s.from.thick), toInfo: this.info(groups, s.to.groupId, s.to.thick), createdByName: name(s.createdBy) }));
  }
  private async openingViews(rows: OpeningEntry[]): Promise<OpeningView[]> {
    const [groups, name] = await Promise.all([groupMap(this.data.repos), this.people(rows.map((r) => r.createdBy))]);
    return rows.map((o) => ({ ...o, info: this.info(groups, o.item.groupId, o.item.thick), createdByName: name(o.createdBy) }));
  }

  // ── Checks shared by every movement ────────────────────────────────

  /** MINUS on `sku` must not take it below zero. */
  private async ensureAvailable(tx: Repos, sku: string, qty: number, what = 'issue') {
    const have = (await balances(tx)).get(sku) ?? 0;
    if (have < qty) throw conflict('insufficient_stock', `Only ${have} available in ${sku}, so ${qty} can’t be ${what === 'issue' ? 'issued' : what}`);
  }
  /** Removing a PLUS on `sku` must not take it below zero (the stock has moved on since). */
  private async ensureReversible(tx: Repos, sku: string, qty: number, docNo: string) {
    const have = (await balances(tx)).get(sku) ?? 0;
    if (have < qty) throw conflict('stock_consumed', `${sku} now holds ${have}, less than the ${qty} that ${docNo} added, so it can’t be reversed`);
  }

  // ── Slips (SIS / SRS) ──────────────────────────────────────────────

  async listSlips(query: ListQuery<SlipFilters>) {
    const res = await this.data.repos.stockSlips.list(query);
    return { rows: await this.slipViews(res.rows), total: res.total };
  }

  async getSlip(id: string): Promise<SlipView> {
    const s = await this.data.repos.stockSlips.getById(id);
    if (!s) throw notFound('Slip');
    return (await this.slipViews([s]))[0]!;
  }

  async createSlip(actor: Actor, input: SlipCreate): Promise<SlipView> {
    const slip = await this.data.uow.run(async (tx) => {
      const from = await resolveSide(tx, input.from, 'from');
      const to = await resolveSide(tx, input.to, 'to');
      if (from.sku === to.sku) throw validationFailed('Invalid input', [{ path: 'to', message: 'FROM and TO must be different SKU codes' }]);
      const date = docDate(input.date, this.clock);
      await this.ensureAvailable(tx, from.sku, input.qty);
      const at = isoNow(this.clock);
      const slipNo = await nextNo(tx, input.type === 'SIS' ? 'ISS' : 'MRS', date, at);
      const s = await tx.stockSlips.create({
        id: newId(),
        type: input.type,
        slipNo,
        date,
        from,
        to,
        qty: input.qty,
        // Legacy auto batch: B- and five digits.
        batch: input.batch ?? `B-${String(Date.parse(at)).slice(-5)}`,
        refNo: input.refNo ?? null,
        shift: input.shift ?? null,
        remarks: input.remarks ?? null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'stock_slip', entityId: s.id, details: `${s.slipNo}: ${from.sku} − ${s.qty} → ${to.sku} + ${s.qty}` });
      return s;
    });
    return (await this.slipViews([slip]))[0]!;
  }

  /** New: a wrong slip can be reversed while its TO stock is still there. */
  async removeSlip(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const s = await tx.stockSlips.getById(id);
      if (!s) throw notFound('Slip');
      await this.ensureReversible(tx, s.to.sku, s.qty, s.slipNo);
      await tx.stockSlips.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'stock_slip', entityId: id, details: `Reversed ${s.slipNo} (${s.from.sku} → ${s.to.sku}, ${s.qty})` });
    });
  }

  async slipPrint(actor: Actor, id: string): Promise<SlipPrintPayload> {
    const slip = await this.getSlip(id);
    const company = await this.company.block();
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Print', entityType: 'stock_slip', entityId: id, details: `Printed ${slip.slipNo}` }));
    return { company, slip, generatedAt: isoNow(this.clock) };
  }

  // ── Opening stock ──────────────────────────────────────────────────

  async listOpening(): Promise<OpeningView[]> {
    return (await this.openingViews(await this.data.repos.stockOpening.listAll())).reverse();
  }

  async createOpening(actor: Actor, input: OpeningCreate): Promise<OpeningView> {
    const row = await this.data.uow.run(async (tx) => {
      const item = await resolveSide(tx, input.item, 'item');
      const at = isoNow(this.clock);
      const o = await tx.stockOpening.create({ id: newId(), date: docDate(input.date, this.clock), item, qty: input.qty, note: input.note ?? null, createdBy: actor.id, createdAt: at, updatedAt: at });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'stock_opening', entityId: o.id, details: `Opening stock ${item.sku} + ${o.qty}` });
      return o;
    });
    return (await this.openingViews([row]))[0]!;
  }

  async removeOpening(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const o = await tx.stockOpening.getById(id);
      if (!o) throw notFound('Opening entry');
      await this.ensureReversible(tx, o.item.sku, o.qty, 'the opening entry');
      await tx.stockOpening.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'stock_opening', entityId: id, details: `Reversed opening stock ${o.item.sku} + ${o.qty}` });
    });
  }

  // ── Reclassification (STR) ─────────────────────────────────────────

  async listReclass(): Promise<ReclassView[]> {
    return (await this.reclassViews(await this.data.repos.reclasses.listAll())).reverse();
  }

  async createReclass(actor: Actor, input: ReclassCreate): Promise<ReclassView> {
    const row = await this.data.uow.run(async (tx) => {
      const from = await resolveSide(tx, input.from, 'from');
      const to = await resolveSide(tx, input.to, 'to');
      if (from.sku === to.sku) throw validationFailed('Invalid input', [{ path: 'to', message: 'FROM and TO can’t be the same SKU' }]);
      const date = docDate(input.date, this.clock);
      await this.ensureAvailable(tx, from.sku, input.qty, 'reclassified');
      const at = isoNow(this.clock);
      const r = await tx.reclasses.create({
        id: newId(),
        strNo: await nextNo(tx, 'STR', date, at),
        date,
        scenario: input.scenario,
        from,
        to,
        qty: input.qty,
        reason: input.reason,
        ref: input.ref ?? null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'stock_reclass', entityId: r.id, details: `${r.strNo} (${r.scenario}): ${from.sku} → ${to.sku}, ${r.qty}` });
      return r;
    });
    return (await this.reclassViews([row]))[0]!;
  }

  /** Legacy reversed without checking, which could leave the TO SKU negative. */
  async removeReclass(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const r = await tx.reclasses.getById(id);
      if (!r) throw notFound('Reclassification');
      await this.ensureReversible(tx, r.to.sku, r.qty, r.strNo);
      await tx.reclasses.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'stock_reclass', entityId: id, details: `Reversed ${r.strNo} (${r.from.sku} → ${r.to.sku}, ${r.qty})` });
    });
  }

  // ── Live stock, ledgers, dashboard ─────────────────────────────────

  /** Every SKU with a non-zero balance, in master order (legacy renderSkuStock / renderDeptStock). */
  async liveStock(f: { family?: Family; dept?: Department; q?: string } = {}): Promise<LiveStock> {
    const { repos } = this.data;
    const [groups, bal] = await Promise.all([repos.skuGroups.listAll(), balances(repos)]);
    const q = f.q?.trim().toLowerCase();
    const rows: SkuInfo[] = [];
    for (const g of groups) {
      if ((f.family && g.family !== f.family) || (f.dept && g.dept !== f.dept)) continue;
      for (const t of g.thicknesses.length ? g.thicknesses : [null]) {
        const qty = bal.get(skuCode(g, t)) ?? 0;
        if (qty === 0) continue;
        const info = { ...groupInfo(g, t), qty };
        if (q && ![info.sku, info.label, info.dept].some((s) => s.toLowerCase().includes(q))) continue;
        rows.push(info);
      }
    }
    const byDept = DEPARTMENTS.map((dept) => {
      const r = rows.filter((x) => x.dept === dept);
      return { dept, qty: round3(r.reduce((s, x) => s + x.qty, 0)), skus: r.length };
    }).filter((d) => d.skus > 0);
    return { rows, total: round3(rows.reduce((s, r) => s + r.qty, 0)), byDept };
  }

  /** SKU-wise ledger with a running balance per SKU. With `from`, the balance before it is brought forward. */
  async skuLedger(sku: string | undefined, range: Range): Promise<SkuLedger> {
    const legs = (await allLegs(this.data.repos)).filter((l) => !sku || l.sku === sku);
    const run = new Map<string, number>();
    const out: LedgerLeg[] = [];
    let openingQty = 0;
    for (const l of legs) {
      const bal = round3((run.get(l.sku) ?? 0) + l.qty);
      run.set(l.sku, bal);
      if (range.from && l.date < range.from) {
        if (sku) openingQty = bal;
        continue;
      }
      if (!inRange(l.date, range)) continue;
      out.push({ ...l, balance: bal });
    }
    const totOut = round3(out.filter((l) => l.qty < 0).reduce((s, l) => s - l.qty, 0));
    const totIn = round3(out.filter((l) => l.qty > 0).reduce((s, l) => s + l.qty, 0));
    return { sku: sku ?? null, openingQty, legs: out, totals: { out: totOut, in: totIn, net: round3(totIn - totOut) }, closingQty: sku ? round3(openingQty + totIn - totOut) : round3(totIn - totOut) };
  }

  /** Department-wise ledger (legacy renderDeptLedger): every leg in each department, with IN / OUT totals. */
  async deptLedger(dept: Department | undefined, range: Range): Promise<DeptLedger> {
    const legs = (await allLegs(this.data.repos)).filter((l) => inRange(l.date, range) && (!dept || l.dept === dept));
    return {
      depts: DEPARTMENTS.map((d) => {
        const ls = legs.filter((l) => l.dept === d);
        const o = round3(ls.filter((l) => l.qty < 0).reduce((s, l) => s - l.qty, 0));
        const i = round3(ls.filter((l) => l.qty > 0).reduce((s, l) => s + l.qty, 0));
        return { dept: d, legs: ls, out: o, in: i, net: round3(i - o) };
      }).filter((d) => d.legs.length),
    };
  }

  /** Daily movement summary (legacy renderDailyLedger), now including reclassifications. */
  async movements(range: Range): Promise<{ rows: MovementRow[]; totalQty: number }> {
    const { repos } = this.data;
    const [groups, slips, reclasses] = await Promise.all([groupMap(repos), repos.stockSlips.listAll(), repos.reclasses.listAll()]);
    const row = (kind: MovementRow['kind'], d: StockSlip | Reclass, docNo: string): MovementRow => {
      const fg = groups.get(d.from.groupId);
      return {
        kind,
        docId: d.id,
        docNo,
        date: d.date,
        fromSku: d.from.sku,
        toSku: d.to.sku,
        fromDept: fg?.dept ?? null,
        toDept: groups.get(d.to.groupId)?.dept ?? null,
        label: fg?.label ?? null,
        thick: d.from.thick ?? d.to.thick,
        qty: d.qty,
      };
    };
    const rows = [...slips.map((s) => ({ r: row(s.type, s, s.slipNo), at: s.createdAt })), ...reclasses.map((r) => ({ r: row('STR', r, r.strNo), at: r.createdAt }))]
      .filter((x) => inRange(x.r.date, range))
      .sort((a, b) => a.r.date.localeCompare(b.r.date) || a.at.localeCompare(b.at))
      .map((x) => x.r);
    return { rows, totalQty: round3(rows.reduce((s, r) => s + r.qty, 0)) };
  }

  /** Legacy renderDash. Stage stock is the real balance (legacy summed slips only, ignoring opening and reclass). */
  async dashboard(range: Range): Promise<StockDashboard> {
    const { repos } = this.data;
    const [live, slips, reclasses] = await Promise.all([this.liveStock(), repos.stockSlips.listAll(), repos.reclasses.listAll()]);
    const deptQty = new Map(live.byDept.map((d) => [d.dept, d.qty]));
    const inR = slips.filter((s) => inRange(s.date, range));
    const recent = [...slips].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
    return {
      totalQty: live.total,
      alertQty: round3(ALERT_DEPTS.reduce((s, d) => s + (deptQty.get(d) ?? 0), 0)),
      slips: { total: inR.length, sis: inR.filter((s) => s.type === 'SIS').length, srs: inR.filter((s) => s.type === 'SRS').length },
      reclasses: reclasses.filter((r) => inRange(r.date, range)).length,
      stages: STAGES.map((s) => ({ label: s.label, qty: round3(s.depts.reduce((t, d) => t + (deptQty.get(d) ?? 0), 0)), alert: !!s.alert })),
      recent: await this.slipViews(recent),
    };
  }

  // ── Excel ──────────────────────────────────────────────────────────

  async exportXlsx(actor: Actor, kind: ExportKind, f: { range: Range; sku?: string; dept?: Department; family?: Family; slips?: ListQuery<SlipFilters> }): Promise<Uint8Array> {
    const leg = (extra: Column<LedgerLeg>[] = []): Column<LedgerLeg>[] => [
      { header: 'Date', value: (l) => l.date },
      { header: 'Document', value: (l) => l.docNo },
      { header: 'Type', value: (l) => l.kind },
      { header: 'SKU', value: (l) => l.sku },
      { header: 'Department', value: (l) => l.dept },
      { header: 'Out (−)', value: (l) => (l.qty < 0 ? -l.qty : null) },
      { header: 'In (+)', value: (l) => (l.qty > 0 ? l.qty : null) },
      ...extra,
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- one sheet, row type per kind
    let sheet: { name: string; rows: any[]; columns: Column<any>[] };
    let count: number;
    switch (kind) {
      case 'slips': {
        const rows = await this.slipViews(await collectAll((q) => this.data.repos.stockSlips.list(q), f.slips ?? {}));
        sheet = {
          name: 'Stock Slips',
          rows,
          columns: [
            { header: 'Slip No', value: (s: SlipView) => s.slipNo },
            { header: 'Type', value: (s: SlipView) => s.type },
            { header: 'Date', value: (s: SlipView) => s.date },
            { header: 'From SKU (−)', value: (s: SlipView) => s.from.sku },
            { header: 'From Dept', value: (s: SlipView) => s.fromInfo?.dept },
            { header: 'To SKU (+)', value: (s: SlipView) => s.to.sku },
            { header: 'To Dept', value: (s: SlipView) => s.toInfo?.dept },
            { header: 'Qty', value: (s: SlipView) => s.qty },
            { header: 'Batch', value: (s: SlipView) => s.batch },
            { header: 'Against PR / SO', value: (s: SlipView) => s.refNo },
            { header: 'Shift', value: (s: SlipView) => s.shift },
            { header: 'Remarks', value: (s: SlipView) => s.remarks },
          ] as Column<any>[],
        };
        count = rows.length;
        break;
      }
      case 'stock': {
        const { rows } = await this.liveStock({ family: f.family, dept: f.dept });
        sheet = {
          name: 'Live Stock',
          rows,
          columns: [
            { header: 'SKU', value: (r: SkuInfo) => r.sku },
            { header: 'Description', value: (r: SkuInfo) => r.label },
            { header: 'Thickness (mm)', value: (r: SkuInfo) => r.thick },
            { header: 'Size', value: (r: SkuInfo) => r.size },
            { header: 'Grade', value: (r: SkuInfo) => r.grade },
            { header: 'Department', value: (r: SkuInfo) => r.dept },
            { header: 'Qty', value: (r: SkuInfo) => r.qty },
            { header: 'Unit', value: (r: SkuInfo) => r.unit },
          ] as Column<any>[],
        };
        count = rows.length;
        break;
      }
      case 'sku-ledger': {
        const l = await this.skuLedger(f.sku, f.range);
        sheet = { name: 'SKU Ledger', rows: l.legs, columns: leg([{ header: 'Balance', value: (x) => x.balance }]) as Column<any>[] };
        count = l.legs.length;
        break;
      }
      case 'dept-ledger': {
        const l = await this.deptLedger(f.dept, f.range);
        const rows = l.depts.flatMap((d) => d.legs);
        sheet = { name: 'Dept Ledger', rows, columns: leg() as Column<any>[] };
        count = rows.length;
        break;
      }
      case 'movements': {
        const { rows } = await this.movements(f.range);
        sheet = {
          name: 'Daily Movement',
          rows,
          columns: [
            { header: 'Date', value: (r: MovementRow) => r.date },
            { header: 'Document', value: (r: MovementRow) => r.docNo },
            { header: 'Type', value: (r: MovementRow) => r.kind },
            { header: 'From Dept', value: (r: MovementRow) => r.fromDept },
            { header: 'To Dept', value: (r: MovementRow) => r.toDept },
            { header: 'From SKU', value: (r: MovementRow) => r.fromSku },
            { header: 'To SKU', value: (r: MovementRow) => r.toSku },
            { header: 'Product', value: (r: MovementRow) => r.label },
            { header: 'Thickness (mm)', value: (r: MovementRow) => r.thick },
            { header: 'Qty', value: (r: MovementRow) => r.qty },
          ] as Column<any>[],
        };
        count = rows.length;
        break;
      }
    }
    const bytes = writeXlsx([sheet]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'stock_report', details: `Exported ${sheet.name} (${count} rows)` }));
    return bytes;
  }
}

import {
  MDO_TYPES,
  PLAN_SECTIONS,
  planStatus,
  PRIORITIES,
  PRODUCTS,
  round3,
  SHIFTS,
  type DocKind,
  type ProductionDashboard,
  type ProductionMeta,
  type ProductionSettings,
  type WfState,
} from '../../contracts/production';
import { fyEnd, fyStart, isFy } from '../../contracts/purchase';
import type { CompanyBlock } from '../../contracts/sampletrack';
import { isoNow, type Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { conflict, validationFailed } from '../../lib/errors';
import { writeXlsx, type Column } from '../../lib/spreadsheet';
import type { DataLayer } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import type { CompanyService } from '../sampletrack/settings/company-service';
import { currentFy, fyOptions, lotOptions, readSettings, SETTING_KEYS } from './common';
import type { ProductionDocService } from './documents';
import type { MattService, WipService } from './matt-wip';

export interface Range {
  from?: string;
  to?: string;
  fy?: string;
}
const inRange = (d: string, r: Range) => (!r.from || d >= r.from) && (!r.to || d <= r.to) && (!r.fy || (d >= fyStart(r.fy) && d <= fyEnd(r.fy)));
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const rupees = (p: number) => Math.round(p) / 100;

/** One plan-vs-actual line (legacy PP / PS PDF comparison tables). */
export interface CompareRow {
  metric: string;
  plan: number | null;
  actual: number | null;
  variance: number | null;
  status: string;
}

export type ExportKind = DocKind | 'matt' | 'wip' | 'wip-ledger';

/** Meta and settings, financial year lock, dashboard, reports, plan vs actual, prints and Excel. */
export class ProductionReportService {
  constructor(
    private readonly data: DataLayer,
    private readonly docs: ProductionDocService,
    private readonly matt: MattService,
    private readonly wip: WipService,
    private readonly company: CompanyService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  async meta(): Promise<ProductionMeta> {
    return {
      products: PRODUCTS,
      shifts: SHIFTS,
      priorities: PRIORITIES,
      mdoTypes: MDO_TYPES,
      planSections: PLAN_SECTIONS,
      settings: await readSettings(this.data.repos),
      currentFy: currentFy(this.clock),
      fys: fyOptions(this.clock),
      today: businessToday(this.clock),
    };
  }

  /** Purchase lots with what production has used; `except` leaves out one document's own use (edit forms). */
  lots(material: 'nilgiri' | 'resin', except?: string) {
    return lotOptions(this.data.repos, material, except);
  }

  async updateSettings(actor: Actor, input: Partial<Omit<ProductionSettings, 'closedFys'>>): Promise<ProductionSettings> {
    const before = await readSettings(this.data.repos);
    const keys = (['thicknesses', 'sizes', 'boardsPerCharge', 'wetWoodFactor'] as const).filter((k) => input[k] !== undefined && JSON.stringify(input[k]) !== JSON.stringify(before[k]));
    if (!keys.length) return before;
    await this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      for (const k of keys) await tx.settings.set(SETTING_KEYS[k], input[k], actor.id, at);
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'settings', details: `Production settings: ${keys.join(', ')}` });
    });
    return readSettings(this.data.repos);
  }

  /** Legacy fyCloseYear / fyReopenYear: a closed FY's records are read-only. */
  async setFyClosed(actor: Actor, fy: string, closed: boolean): Promise<ProductionSettings> {
    if (!isFy(fy)) throw validationFailed('Use a financial year like 2026-27');
    const s = await readSettings(this.data.repos);
    if (closed === s.closedFys.includes(fy)) throw conflict(closed ? 'already_closed' : 'not_closed', `FY ${fy} is ${closed ? 'already closed' : 'not closed'}`);
    await this.data.uow.run(async (tx) => {
      const next = closed ? [...s.closedFys, fy].sort() : s.closedFys.filter((x) => x !== fy);
      await tx.settings.set(SETTING_KEYS.closedFys, next, actor.id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'StatusChange', entityType: 'production_fy', details: `${closed ? 'Closed' : 'Reopened'} production FY ${fy}` });
    });
    return readSettings(this.data.repos);
  }

  /** Legacy renderDashboard: KPIs, module summary, boards by product, recent documents, Nilgiri lot stock. */
  async dashboard(range: Range): Promise<ProductionDashboard> {
    const [hp, chip, matt, rc, bc, ps, pp, mdo, lots] = await Promise.all([
      this.docs.all('hotpress'),
      this.docs.all('chipping'),
      this.matt.views(await this.data.repos.mattBatches.listAll()),
      this.docs.all('resin'),
      this.docs.all('cutting'),
      this.docs.all('summary'),
      this.docs.all('plan'),
      this.docs.all('mdo'),
      lotOptions(this.data.repos, 'nilgiri'),
    ]);
    const f = <T extends { date: string }>(xs: T[]) => xs.filter((x) => inRange(x.date, range));
    const [hpR, chipR, mattR, rcR, bcR, psR, ppR, mdoR] = [f(hp), f(chip), f(matt), f(rc), f(bc), f(ps), f(pp), f(mdo)];
    const boardsPressed = hpR.reduce((s, r) => s + r.calc.totalBoards, 0);
    const cutPcs = bcR.reduce((s, r) => s + r.cutPcs, 0);
    const rejectPcs = bcR.reduce((s, r) => s + r.rejectPcs, 0);
    const hpPcs = bcR.reduce((s, r) => s + r.hpPcs, 0);
    const byProduct = new Map<string, number>();
    for (const r of hpR) byProduct.set(r.product, (byProduct.get(r.product) ?? 0) + r.calc.totalBoards);
    const all = [...hp.map((x) => ({ kind: 'hotpress' as const, x })), ...ps.map((x) => ({ kind: 'summary' as const, x })), ...bc.map((x) => ({ kind: 'cutting' as const, x }))];
    const docsInRange = [...hpR, ...chipR, ...rcR, ...bcR, ...psR, ...ppR, ...mdoR] as { wfState: WfState }[];
    return {
      kpis: { hotpress: hpR.length, boardsPressed, summaries: psR.length, chipping: chipR.length, rejectPcs, cutPcs, rejectPct: hpPcs ? Math.round((rejectPcs / hpPcs) * 10000) / 100 : 0 },
      modules: [
        { key: 'hotpress', label: 'Hot press', count: hpR.length, metric: `${fmt(boardsPressed)} boards` },
        { key: 'chipping', label: 'Chipping', count: chipR.length, metric: `${fmt(chipR.reduce((s, r) => s + r.totalKg, 0))} kg` },
        { key: 'matt', label: 'Matt weight', count: mattR.length, metric: `${fmt(mattR.reduce((s, r) => s + r.stats.count, 0))} matts` },
        { key: 'resin', label: 'Resin consumption', count: rcR.length, metric: `${fmt(rcR.reduce((s, r) => s + r.lot.qty, 0))} kg` },
        { key: 'cutting', label: 'Board cutting', count: bcR.length, metric: `${fmt(cutPcs)} cut` },
        { key: 'plan', label: 'Production planning', count: ppR.length, metric: `${fmt(ppR.reduce((s, r) => s + r.calc.totalBoards, 0))} planned` },
        { key: 'summary', label: 'Production summary', count: psR.length, metric: `${fmt(psR.reduce((s, r) => s + r.boards, 0))} produced` },
        { key: 'mdo', label: 'MDO press', count: mdoR.length, metric: `${fmt(mdoR.reduce((s, r) => s + r.totalPcs, 0))} pcs` },
      ],
      byProduct: [...byProduct].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      recent: all
        .filter((a) => inRange(a.x.date, range))
        .sort((a, b) => b.x.date.localeCompare(a.x.date) || b.x.createdAt.localeCompare(a.x.createdAt))
        .slice(0, 8)
        .map(({ kind, x }) => ({
          kind,
          id: x.id,
          docNo: x.docNo,
          date: x.date,
          wfState: x.wfState,
          detail: kind === 'hotpress' ? `${(x as (typeof hp)[number]).product} · ${(x as (typeof hp)[number]).calc.totalBoards} boards` : kind === 'summary' ? `${(x as (typeof ps)[number]).product} · ${(x as (typeof ps)[number]).boards} boards` : `${(x as (typeof bc)[number]).rejectPct}% reject`,
        })),
      nilgiriLots: lots.filter((l) => l.availKg > 0).slice(0, 10),
      awaiting: { review: docsInRange.filter((d) => d.wfState === 'review').length, approval: docsInRange.filter((d) => d.wfState === 'reviewed').length },
    };
  }

  /** Plan target vs what the linked hot press, cutting and matt batch actually did (legacy PP PDF §11). */
  async comparePlan(id: string): Promise<CompareRow[]> {
    const p = await this.docs.get('plan', id);
    const hp = p.hotpressId ? await this.docs.get('hotpress', p.hotpressId).catch(() => null) : null;
    const bc = p.cuttingId ? await this.docs.get('cutting', p.cuttingId).catch(() => null) : null;
    const mb = p.mattBatchId ? await this.matt.get(p.mattBatchId).catch(() => null) : null;
    const row = (metric: string, plan: number | null, actual: number | null): CompareRow => ({ metric, plan, actual, variance: plan !== null && actual !== null ? round3(actual - plan) : null, status: plan === null ? '—' : planStatus(plan, actual) });
    return [
      row('Boards pressed', p.calc.totalBoards, hp?.calc.totalBoards ?? null),
      row('Press charges', p.calc.totalCharges, hp?.calc.charges ?? null),
      row('Boards cut', p.calc.totalBoards, bc?.cutPcs ?? null),
      { metric: 'Board rejects', plan: 0, actual: bc?.rejectPcs ?? null, variance: bc ? bc.rejectPcs : null, status: bc ? (bc.rejectPct > 5 ? 'High rejects' : 'OK') : 'Not linked' },
      row('Matts', p.matts ?? p.calc.totalBoards, mb?.stats.count ?? null),
      row('Average matt weight (kg)', p.mattWtKg, mb?.stats.avg ?? null),
    ];
  }

  /** Production summary vs its plan (legacy PS PDF plan-vs-actual). */
  async compareSummary(id: string): Promise<CompareRow[]> {
    const s = await this.docs.get('summary', id);
    if (!s.planId) return [];
    const p = await this.docs.get('plan', s.planId).catch(() => null);
    if (!p) return [];
    const row = (metric: string, plan: number, actual: number): CompareRow => ({ metric, plan, actual, variance: round3(actual - plan), status: planStatus(plan, actual) });
    return [
      row('Boards produced', p.calc.totalBoards, s.boards),
      row('Matts', p.matts ?? p.calc.totalBoards, s.mattPcs),
      row('Matt weight (kg)', p.mattWtKg ?? 0, s.mattWtKg),
      row('Resin (kg)', p.calc.resinReqKg, s.resinKg),
      row('Wet wood (kg)', p.calc.wetWoodReqKg, s.wetWoodKg),
      { metric: 'Board rejects', plan: 0, actual: s.boardRej, variance: s.boardRej, status: s.boardRejPct > 5 ? 'High rejects' : 'OK' },
    ];
  }

  async printPayload(actor: Actor, kind: DocKind | 'matt', id: string): Promise<{ company: CompanyBlock; doc: unknown; compare: CompareRow[]; generatedAt: string }> {
    const doc = kind === 'matt' ? await this.matt.get(id) : await this.docs.get(kind, id);
    const compare = kind === 'plan' ? await this.comparePlan(id) : kind === 'summary' ? await this.compareSummary(id) : [];
    const company = await this.company.block();
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Print', entityType: `production_${kind}`, entityId: id, details: `Printed ${(doc as { docNo: string }).docNo}` }));
    return { company, doc, compare, generatedAt: isoNow(this.clock) };
  }

  /** One sheet per module (legacy reportsExportCurrentTab / per-module XLS). */
  async exportXlsx(actor: Actor, kind: ExportKind, range: Range): Promise<Uint8Array> {
    const f = <T extends { date: string }>(xs: T[]) => xs.filter((x) => inRange(x.date, range));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- one sheet, row type per kind
    let sheet: { name: string; rows: any[]; columns: Column<any>[] };
    switch (kind) {
      case 'plan': {
        const rows = f(await this.docs.all('plan')).flatMap((p) => p.products.map((x, i) => ({ p, x, l: p.calc.lines[i]! })));
        type R = (typeof rows)[number];
        sheet = {
          name: 'Production Plans',
          rows,
          columns: [
            { header: 'Plan', value: (r: R) => r.p.docNo },
            { header: 'Date', value: (r: R) => r.p.date },
            { header: 'Shift', value: (r: R) => r.p.shift },
            { header: 'Product', value: (r: R) => r.x.product },
            { header: 'Size', value: (r: R) => r.x.size },
            { header: 'Thickness', value: (r: R) => r.x.thickness },
            { header: 'Priority', value: (r: R) => r.x.priority },
            { header: 'Target Boards', value: (r: R) => r.x.targetBoards },
            { header: 'Target Sqft', value: (r: R) => r.l.sqft },
            { header: 'Est. Charges', value: (r: R) => r.l.charges },
            { header: 'Status', value: (r: R) => r.p.wfState },
          ],
        };
        break;
      }
      case 'hotpress': {
        const rows = f(await this.docs.all('hotpress'));
        type R = (typeof rows)[number];
        sheet = {
          name: 'Hot Press',
          rows,
          columns: [
            { header: 'Report', value: (r: R) => r.docNo },
            { header: 'Date', value: (r: R) => r.date },
            { header: 'Shift', value: (r: R) => r.shift },
            { header: 'Product', value: (r: R) => r.product },
            { header: 'Size', value: (r: R) => r.size },
            { header: 'Thickness', value: (r: R) => r.thickness },
            { header: 'Charges', value: (r: R) => r.calc.charges },
            { header: 'Total Boards', value: (r: R) => r.calc.totalBoards },
            { header: 'Press Time (min)', value: (r: R) => r.calc.pressMins },
            { header: 'Total Time (min)', value: (r: R) => r.calc.totalMins },
            { header: 'Spare Time (min)', value: (r: R) => r.calc.spareMins },
            { header: 'Operator', value: (r: R) => r.operator },
            { header: 'Status', value: (r: R) => r.wfState },
          ],
        };
        break;
      }
      case 'chipping': {
        const rows = f(await this.docs.all('chipping')).flatMap((c) => c.lots.map((l) => ({ c, l })));
        type R = (typeof rows)[number];
        sheet = {
          name: 'Chipping',
          rows,
          columns: [
            { header: 'Report', value: (r: R) => r.c.docNo },
            { header: 'Date', value: (r: R) => r.c.date },
            { header: 'Shift', value: (r: R) => r.c.shift },
            { header: 'Machine', value: (r: R) => r.c.machine },
            { header: 'Lot', value: (r: R) => r.l.lotNo },
            { header: 'Qty (Kg)', value: (r: R) => r.l.qty },
            { header: 'Net Rate (₹/Kg)', value: (r: R) => r.l.ratePaise / 100_000 },
            { header: 'Amount (₹)', value: (r: R) => rupees(r.l.amountPaise) },
            { header: 'WIP Batch', value: (r: R) => r.c.wipNo },
            { header: 'Status', value: (r: R) => r.c.wfState },
          ],
        };
        break;
      }
      case 'resin': {
        const rows = f(await this.docs.all('resin'));
        type R = (typeof rows)[number];
        sheet = {
          name: 'Resin Consumption',
          rows,
          columns: [
            { header: 'Entry', value: (r: R) => r.docNo },
            { header: 'Date', value: (r: R) => r.date },
            { header: 'Shift', value: (r: R) => r.shift },
            { header: 'Lot', value: (r: R) => r.lot.lotNo },
            { header: 'Vendor', value: (r: R) => r.vendorName },
            { header: 'Qty (Kg)', value: (r: R) => r.lot.qty },
            { header: 'Rate (₹/Kg)', value: (r: R) => r.lot.ratePaise / 100_000 },
            { header: 'Amount (₹)', value: (r: R) => rupees(r.lot.amountPaise) },
            { header: 'Product', value: (r: R) => r.product },
            { header: 'Status', value: (r: R) => r.wfState },
          ],
        };
        break;
      }
      case 'cutting': {
        const rows = f(await this.docs.all('cutting'));
        type R = (typeof rows)[number];
        sheet = {
          name: 'Board Cutting',
          rows,
          columns: [
            { header: 'Report', value: (r: R) => r.docNo },
            { header: 'Date', value: (r: R) => r.date },
            { header: 'Hot Press', value: (r: R) => r.hotpressNo },
            { header: 'Product', value: (r: R) => r.product },
            { header: 'HP Pcs', value: (r: R) => r.hpPcs },
            { header: 'Cut Pcs', value: (r: R) => r.cutPcs },
            { header: 'Reject Pcs', value: (r: R) => r.rejectPcs },
            { header: 'Reject %', value: (r: R) => r.rejectPct },
            { header: 'Status', value: (r: R) => r.wfState },
          ],
        };
        break;
      }
      case 'summary': {
        const rows = f(await this.docs.all('summary'));
        type R = (typeof rows)[number];
        sheet = {
          name: 'Production Summary',
          rows,
          columns: [
            { header: 'Summary', value: (r: R) => r.docNo },
            { header: 'Date', value: (r: R) => r.date },
            { header: 'Product', value: (r: R) => r.product },
            { header: 'Size', value: (r: R) => r.size },
            { header: 'Thickness', value: (r: R) => r.thickness },
            { header: 'Press Pcs', value: (r: R) => r.pressPcs },
            { header: 'Boards', value: (r: R) => r.boards },
            { header: 'Board Rejects', value: (r: R) => r.boardRej },
            { header: 'Reject %', value: (r: R) => r.boardRejPct },
            { header: 'Matts', value: (r: R) => r.mattPcs },
            { header: 'Matt Wt (Kg)', value: (r: R) => r.mattWtKg },
            { header: 'Resin (Kg)', value: (r: R) => r.resinKg },
            { header: 'Resin (₹)', value: (r: R) => rupees(r.resinPaise) },
            { header: 'Wet Wood (Kg)', value: (r: R) => r.wetWoodKg },
            { header: 'Wet Wood (₹)', value: (r: R) => rupees(r.wetWoodPaise) },
            { header: 'Plan', value: (r: R) => r.links.planNo },
            { header: 'Status', value: (r: R) => r.wfState },
          ],
        };
        break;
      }
      case 'mdo': {
        const rows = f(await this.docs.all('mdo')).flatMap((m) => m.items.map((x) => ({ m, x })));
        type R = (typeof rows)[number];
        sheet = {
          name: 'MDO Press',
          rows,
          columns: [
            { header: 'Report', value: (r: R) => r.m.docNo },
            { header: 'Date', value: (r: R) => r.m.date },
            { header: 'Shift', value: (r: R) => r.m.shift },
            { header: 'Board Type', value: (r: R) => r.x.boardType },
            { header: 'Thickness', value: (r: R) => r.x.thickness },
            { header: 'Paper', value: (r: R) => r.x.paper },
            { header: 'Type', value: (r: R) => r.x.type },
            { header: 'Finish', value: (r: R) => r.x.finish },
            { header: 'Pcs', value: (r: R) => r.x.pcs },
            { header: 'Cycle Time', value: (r: R) => r.x.cycleTime },
            { header: 'Paper Used', value: (r: R) => r.m.paperUsed },
            { header: 'Paper Wastage', value: (r: R) => r.m.paperWastage },
          ],
        };
        break;
      }
      case 'matt': {
        const rows = f(await this.matt.views(await this.data.repos.mattBatches.listAll()));
        type R = (typeof rows)[number];
        sheet = {
          name: 'Matt Weight',
          rows,
          columns: [
            { header: 'Batch', value: (r: R) => r.docNo },
            { header: 'Date', value: (r: R) => r.date },
            { header: 'Product', value: (r: R) => r.product },
            { header: 'Setpoint (Kg)', value: (r: R) => r.setpoint },
            { header: 'Band (± Kg)', value: (r: R) => r.band },
            { header: 'Matts', value: (r: R) => r.stats.count },
            { header: 'Avg Weight', value: (r: R) => r.stats.avg },
            { header: 'Min', value: (r: R) => r.stats.min },
            { header: 'Max', value: (r: R) => r.stats.max },
            { header: 'Std Dev', value: (r: R) => r.stats.stdDev },
            { header: 'Pass', value: (r: R) => r.stats.pass },
            { header: 'Warn', value: (r: R) => r.stats.warn },
            { header: 'Reject', value: (r: R) => r.stats.fail },
            { header: 'Pass Rate %', value: (r: R) => r.stats.passRate },
            { header: 'Status', value: (r: R) => r.status },
          ],
        };
        break;
      }
      case 'wip': {
        const rows = f(await this.wip.list());
        type R = (typeof rows)[number];
        sheet = {
          name: 'WIP Nilgiri',
          rows,
          columns: [
            { header: 'Batch', value: (r: R) => r.docNo },
            { header: 'Chipping', value: (r: R) => r.chippingNo },
            { header: 'Date', value: (r: R) => r.date },
            { header: 'Total (Kg)', value: (r: R) => r.totalKg },
            { header: 'Used (Kg)', value: (r: R) => r.usedKg },
            { header: 'Adjusted (Kg)', value: (r: R) => r.adjustKg },
            { header: 'Available (Kg)', value: (r: R) => r.availKg },
            { header: 'Avg Rate (₹/Kg)', value: (r: R) => r.avgRatePaise / 100_000 },
            { header: 'Status', value: (r: R) => r.status },
          ],
        };
        break;
      }
      case 'wip-ledger': {
        const rows = f(await this.wip.ledger());
        type R = (typeof rows)[number];
        sheet = {
          name: 'WIP Ledger',
          rows,
          columns: [
            { header: 'Date', value: (r: R) => r.date },
            { header: 'WIP Batch', value: (r: R) => r.wipNo },
            { header: 'Type', value: (r: R) => r.type },
            { header: 'Qty (Kg)', value: (r: R) => r.qty },
            { header: 'Rate (₹/Kg)', value: (r: R) => r.ratePaise / 100_000 },
            { header: 'Amount (₹)', value: (r: R) => rupees(r.amountPaise) },
            { header: 'Reference', value: (r: R) => `${r.refType}${r.refNo ? ` ${r.refNo}` : ''}` },
            { header: 'Balance (Kg)', value: (r: R) => r.balance },
            { header: 'Remarks', value: (r: R) => r.remarks },
          ],
        };
        break;
      }
    }
    const bytes = writeXlsx([sheet]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'production_report', details: `Exported ${sheet.name} (${sheet.rows.length} rows)` }));
    return bytes;
  }

}

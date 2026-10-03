import {
  calcCutting,
  calcHotPress,
  calcPlan,
  DOC_KINDS,
  minutesBetween,
  round3,
  type Chipping,
  type ChippingView,
  type Cutting,
  type CuttingView,
  type DocBase,
  type DocFilters,
  type DocKind,
  type HotPress,
  type HotPressView,
  type LotLine,
  type Mdo,
  type MdoView,
  type Plan,
  type PlanView,
  type ResinUse,
  type ResinUseView,
  type Summary,
  type SummaryView,
  type WfAction,
  type WfState,
} from '../../contracts/production';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { conflict, HttpError, notFound, validationFailed } from '../../lib/errors';
import type { DataLayer, DocRepo, ListQuery, Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { amountFor, guardFy, lotOptions, nameMap, nextDocNo, readSettings, wipViews } from './common';

/* eslint-disable @typescript-eslint/no-explicit-any -- each kind's input is validated by its own zod schema at the route */
type Input = Record<string, any>;
type Stored<T extends DocBase> = Omit<T, keyof DocBase> & { date: string; remarks: string | null };

interface KindSpec<T extends DocBase, V> {
  repo: (r: Repos) => DocRepo<T>;
  /** The stored fields from validated input; checks references and computes rates. */
  build(tx: Repos, input: Input, before: T | null): Promise<Stored<T>>;
  /** Back to input shape, so a PATCH can be merged over the current row. */
  toInput(doc: T): Input;
  views(repos: Repos, rows: T[]): Promise<V[]>;
  /** Document numbers that reference this one (blocks delete). */
  usedBy?(tx: Repos, doc: T): Promise<string[]>;
  describe(doc: T): string;
}

const strip = <T extends DocBase>(d: T): Input => {
  const { id: _i, docNo: _n, wfState: _w, wfTrail: _t, createdBy: _c, createdAt: _a, updatedAt: _u, deletedAt: _d, ...rest } = d;
  return rest;
};
const badRef = (path: string, message: string) => validationFailed('Invalid input', [{ path, message }]);
async function ref<T extends DocBase>(repo: DocRepo<T>, id: string | null | undefined, path: string, what: string): Promise<T | null> {
  if (!id) return null;
  const d = await repo.getById(id);
  if (!d) throw badRef(path, `Unknown ${what}`);
  return d;
}
const withNames = async <T extends DocBase>(repos: Repos, rows: T[]) => {
  const name = await nameMap(repos, rows.map((r) => r.createdBy));
  return (r: T) => ({ createdByName: name(r.createdBy) });
};
const docNos = async (repos: Repos) => {
  const [hp, mb, rc, bc, pp] = await Promise.all([repos.prodHotpress.listAll(), repos.mattBatches.listAll(), repos.prodResin.listAll(), repos.prodCutting.listAll(), repos.prodPlans.listAll()]);
  const m = (xs: { id: string; docNo: string }[]) => new Map(xs.map((x) => [x.id, x.docNo]));
  return { hp: m(hp), mb: m(mb), rc: m(rc), bc: m(bc), pp: m(pp) };
};

/**
 * Lot lines for chipping / resin: each lot must be a posted Purchase entry of the material with enough
 * left (counting this document's own previous use as free on an edit). The net rate is fixed at save.
 */
async function buildLots(tx: Repos, material: 'nilgiri' | 'resin', lines: { purchaseEntryId: string; qty: number }[], beforeId: string | null, path: (i: number) => string): Promise<LotLine[]> {
  const opts = new Map((await lotOptions(tx, material, beforeId ?? undefined)).map((o) => [o.purchaseEntryId, o]));
  const want = new Map<string, number>();
  for (const l of lines) want.set(l.purchaseEntryId, (want.get(l.purchaseEntryId) ?? 0) + l.qty);
  return lines.map((l, i) => {
    const o = opts.get(l.purchaseEntryId);
    if (!o) throw badRef(path(i), `Not a posted ${material === 'nilgiri' ? 'Nilgiri' : 'resin'} purchase lot`);
    if (want.get(l.purchaseEntryId)! > o.availKg + 1e-9)
      throw conflict('insufficient_lot', `Only ${o.availKg.toLocaleString('en-IN')} kg left in lot ${o.lotNo}, so ${want.get(l.purchaseEntryId)!.toLocaleString('en-IN')} kg can’t be used`);
    return { purchaseEntryId: o.purchaseEntryId, lotNo: o.lotNo, qty: l.qty, ratePaise: o.netRatePaise, amountPaise: amountFor(l.qty, o.netRatePaise) };
  });
}

// ── Kinds ───────────────────────────────────────────────────────────

const plan: KindSpec<Plan, PlanView> = {
  repo: (r) => r.prodPlans,
  async build(tx, i) {
    await ref(tx.prodHotpress, i.hotpressId, 'hotpressId', 'hot press report');
    await ref(tx.prodCutting, i.cuttingId, 'cuttingId', 'board cutting report');
    if (i.mattBatchId && !(await tx.mattBatches.getById(i.mattBatchId))) throw badRef('mattBatchId', 'Unknown matt batch');
    return {
      date: i.date,
      remarks: i.remarks ?? null,
      shift: i.shift,
      planOp: i.planOp ?? null,
      products: i.products,
      mattWtKg: i.mattWtKg ?? null,
      matts: i.matts ?? null,
      resinPerMattKg: i.resinPerMattKg ?? null,
      wetWoodAvailKg: i.wetWoodAvailKg ?? null,
      process: i.process ?? {},
      hotpressId: i.hotpressId ?? null,
      mattBatchId: i.mattBatchId ?? null,
      cuttingId: i.cuttingId ?? null,
    };
  },
  toInput: strip,
  async views(repos, rows) {
    const [who, s] = await Promise.all([withNames(repos, rows), readSettings(repos)]);
    return rows.map((r) => ({ ...r, ...who(r), calc: calcPlan(r.products, r, s) }));
  },
  async usedBy(tx, d) {
    return (await tx.prodSummary.listAll()).filter((s) => s.planId === d.id).map((s) => s.docNo);
  },
  describe: (d) => `${d.products.length} product line(s), ${d.products.reduce((s, p) => s + p.targetBoards, 0)} boards planned`,
};

const hotpress: KindSpec<HotPress, HotPressView> = {
  repo: (r) => r.prodHotpress,
  async build(_tx, i) {
    return {
      date: i.date,
      remarks: i.remarks ?? null,
      shift: i.shift,
      product: i.product,
      size: i.size,
      thickness: i.thickness ?? null,
      operator: i.operator ?? null,
      charges: i.charges.map((c: Input, n: number) => ({ label: c.label && c.label !== 'Charge' ? c.label : `Charge ${n + 1}`, pcs: c.pcs, load: c.load ?? null, unload: c.unload ?? null, remarks: c.remarks ?? null })),
    };
  },
  toInput: strip,
  async views(repos, rows) {
    const [who, cuts] = await Promise.all([withNames(repos, rows), repos.prodCutting.listAll()]);
    return rows.map((r) => ({ ...r, ...who(r), calc: calcHotPress(r.charges), cuttingNo: cuts.find((c) => c.hotpressId === r.id)?.docNo ?? null }));
  },
  async usedBy(tx, d) {
    const [cuts, sums, plans] = await Promise.all([tx.prodCutting.listAll(), tx.prodSummary.listAll(), tx.prodPlans.listAll()]);
    return [...cuts.filter((c) => c.hotpressId === d.id), ...sums.filter((s) => s.hotpressId === d.id), ...plans.filter((p) => p.hotpressId === d.id)].map((x) => x.docNo);
  },
  describe: (d) => `${d.product} ${d.size}${d.thickness ? ` ${d.thickness} mm` : ''}, ${calcHotPress(d.charges).totalBoards} boards in ${d.charges.length} charge(s)`,
};

const chipping: KindSpec<Chipping, ChippingView> = {
  repo: (r) => r.prodChipping,
  async build(tx, i, before) {
    return { date: i.date, remarks: i.remarks ?? null, shift: i.shift, operator: i.operator ?? null, machine: i.machine ?? null, lots: await buildLots(tx, 'nilgiri', i.lots, before?.id ?? null, (n) => `lots.${n}.purchaseEntryId`) };
  },
  toInput: (d) => ({ ...strip(d), lots: d.lots.map((l) => ({ purchaseEntryId: l.purchaseEntryId, qty: l.qty })) }),
  async views(repos, rows) {
    const [who, wips] = await Promise.all([withNames(repos, rows), repos.wipBatches.listAll()]);
    return rows.map((r) => {
      const totalKg = round3(r.lots.reduce((s, l) => s + l.qty, 0));
      const totalPaise = r.lots.reduce((s, l) => s + l.amountPaise, 0);
      const w = wips.find((x) => x.chippingId === r.id);
      return { ...r, ...who(r), totalKg, totalPaise, avgRatePaise: totalKg ? Math.round((totalPaise / totalKg) * 1000) : 0, wipId: w?.id ?? null, wipNo: w?.docNo ?? null };
    });
  },
  async usedBy(tx, d) {
    const w = await tx.wipBatches.getByChipping(d.id);
    return w ? [w.docNo] : [];
  },
  describe: (d) => `${round3(d.lots.reduce((s, l) => s + l.qty, 0))} kg from lot(s) ${d.lots.map((l) => l.lotNo).join(', ')}`,
};

const resin: KindSpec<ResinUse, ResinUseView> = {
  repo: (r) => r.prodResin,
  async build(tx, i, before) {
    const [lot] = await buildLots(tx, 'resin', [i.lot], before?.id ?? null, () => 'lot.purchaseEntryId');
    return { date: i.date, remarks: i.remarks ?? null, shift: i.shift, lot: lot!, product: i.product ?? null, operator: i.operator ?? null };
  },
  toInput: (d) => ({ ...strip(d), lot: { purchaseEntryId: d.lot.purchaseEntryId, qty: d.lot.qty } }),
  async views(repos, rows) {
    const who = await withNames(repos, rows);
    return Promise.all(
      rows.map(async (r) => {
        const e = await repos.purchaseEntries.getById(r.lot.purchaseEntryId);
        return { ...r, ...who(r), vendorName: e?.vendorName ?? null, invoiceNo: e?.invoiceNo ?? null };
      }),
    );
  },
  async usedBy(tx, d) {
    return (await tx.prodSummary.listAll()).filter((s) => s.resinIds.includes(d.id)).map((s) => s.docNo);
  },
  describe: (d) => `${d.lot.qty} kg resin from lot ${d.lot.lotNo}`,
};

const cutting: KindSpec<Cutting, CuttingView> = {
  repo: (r) => r.prodCutting,
  async build(tx, i, before) {
    await ref(tx.prodHotpress, i.hotpressId, 'hotpressId', 'hot press report');
    const other = (await tx.prodCutting.listAll()).find((c) => c.hotpressId === i.hotpressId && c.id !== before?.id);
    if (other) throw conflict('already_cut', `That hot press report already has board cutting report ${other.docNo}`);
    return { date: i.date, remarks: i.remarks ?? null, shift: i.shift, hotpressId: i.hotpressId, operator: i.operator ?? null, cutPcs: i.cutPcs };
  },
  toInput: strip,
  async views(repos, rows) {
    const [who, hps] = await Promise.all([withNames(repos, rows), repos.prodHotpress.listAll()]);
    return rows.map((r) => {
      const hp = hps.find((h) => h.id === r.hotpressId);
      const hpPcs = hp ? calcHotPress(hp.charges).totalBoards : 0;
      return { ...r, ...who(r), hotpressNo: hp?.docNo ?? null, product: hp?.product ?? null, size: hp?.size ?? null, hpPcs, ...calcCutting(hpPcs, r.cutPcs) };
    });
  },
  async usedBy(tx, d) {
    const [sums, plans] = await Promise.all([tx.prodSummary.listAll(), tx.prodPlans.listAll()]);
    return [...sums.filter((s) => s.cuttingId === d.id), ...plans.filter((p) => p.cuttingId === d.id)].map((x) => x.docNo);
  },
  describe: (d) => `${d.cutPcs} boards cut`,
};

const summary: KindSpec<Summary, SummaryView> = {
  repo: (r) => r.prodSummary,
  async build(tx, i, before) {
    await ref(tx.prodHotpress, i.hotpressId, 'hotpressId', 'hot press report');
    await ref(tx.prodCutting, i.cuttingId, 'cuttingId', 'board cutting report');
    await ref(tx.prodPlans, i.planId, 'planId', 'production plan');
    if (i.mattBatchId && !(await tx.mattBatches.getById(i.mattBatchId))) throw badRef('mattBatchId', 'Unknown matt batch');
    const resinIds: string[] = [...new Set<string>(i.resinIds ?? [])];
    const resins = await Promise.all(resinIds.map((id, n) => ref(tx.prodResin, id, `resinIds.${n}`, 'resin entry')));
    const wipIds = new Set((await tx.wipBatches.listAll()).map((w) => w.id));
    const wip: { wipId: string; qty: number }[] = i.wip ?? [];
    wip.forEach((w, n) => {
      if (!wipIds.has(w.wipId)) throw badRef(`wip.${n}.wipId`, 'Unknown WIP batch');
      if (wip.findIndex((x) => x.wipId === w.wipId) !== n) throw badRef(`wip.${n}.wipId`, 'The same WIP batch is listed twice');
    });
    // WIP may go negative (chipped weight is theoretical, legacy allows it), so no stock check here.
    void before;
    return {
      date: i.date,
      remarks: i.remarks ?? null,
      product: i.product,
      size: i.size,
      thickness: i.thickness ?? null,
      batch: i.batch ?? null,
      hotpressId: i.hotpressId ?? null,
      mattBatchId: i.mattBatchId ?? null,
      resinIds,
      cuttingId: i.cuttingId ?? null,
      planId: i.planId ?? null,
      pressPcs: i.pressPcs,
      boards: i.boards,
      boardRej: i.boardRej,
      mattPcs: i.mattPcs,
      mattWtKg: i.mattWtKg,
      mattRej: i.mattRej,
      // Linked resin entries are the record of what was used; typed figures only without links.
      resinKg: resins.length ? round3(resins.reduce((s, r) => s + r!.lot.qty, 0)) : i.resinKg,
      resinPaise: resins.length ? resins.reduce((s, r) => s + r!.lot.amountPaise, 0) : i.resinPaise,
      dryWoodKg: i.dryWoodKg,
      wip,
    };
  },
  toInput: strip,
  async views(repos, rows) {
    const [who, nos, wips] = await Promise.all([withNames(repos, rows), docNos(repos), wipViews(repos)]);
    const wipById = new Map(wips.map((w) => [w.id, w]));
    return rows.map((r) => {
      const wetWoodKg = round3(r.wip.reduce((s, w) => s + w.qty, 0));
      const wetWoodPaise = r.wip.reduce((s, w) => s + amountFor(w.qty, wipById.get(w.wipId)?.avgRatePaise ?? 0), 0);
      return {
        ...r,
        ...who(r),
        boardRejPct: r.pressPcs > 0 ? Math.round((r.boardRej / r.pressPcs) * 10000) / 100 : 0,
        wetWoodKg,
        wetWoodPaise,
        wetWoodRatePaise: wetWoodKg ? Math.round((wetWoodPaise / wetWoodKg) * 1000) : 0,
        links: {
          hotpressNo: r.hotpressId ? (nos.hp.get(r.hotpressId) ?? null) : null,
          mattNo: r.mattBatchId ? (nos.mb.get(r.mattBatchId) ?? null) : null,
          resinNos: r.resinIds.map((id) => nos.rc.get(id) ?? '—'),
          cuttingNo: r.cuttingId ? (nos.bc.get(r.cuttingId) ?? null) : null,
          planNo: r.planId ? (nos.pp.get(r.planId) ?? null) : null,
          wipNos: r.wip.map((w) => wipById.get(w.wipId)?.docNo ?? '—'),
        },
      };
    });
  },
  describe: (d) => `${d.product} ${d.size}, ${d.boards} boards`,
};

const mdo: KindSpec<Mdo, MdoView> = {
  repo: (r) => r.prodMdo,
  async build(_tx, i) {
    return {
      date: i.date,
      remarks: i.remarks ?? null,
      shift: i.shift,
      operator: i.operator ?? null,
      pressStart: i.pressStart ?? null,
      pressEnd: i.pressEnd ?? null,
      items: i.items.map((x: Input) => ({ boardType: x.boardType, thickness: x.thickness ?? null, paper: x.paper ?? null, type: x.type ?? null, finish: x.finish ?? null, pcs: x.pcs, cycleTime: x.cycleTime ?? null })),
      paperUsed: i.paperUsed ?? null,
      paperWastage: i.paperWastage ?? null,
    };
  },
  toInput: strip,
  async views(repos, rows) {
    const who = await withNames(repos, rows);
    return rows.map((r) => ({ ...r, ...who(r), totalPcs: r.items.reduce((s, x) => s + x.pcs, 0), workingMins: r.pressStart && r.pressEnd ? minutesBetween(r.pressStart, r.pressEnd) : null }));
  },
  describe: (d) => `${d.items.length} item(s), ${d.items.reduce((s, x) => s + x.pcs, 0)} pcs`,
};

export const KINDS: { [K in DocKind]: KindSpec<any, any> } = { plan, hotpress, chipping, resin, cutting, summary, mdo };
export type ViewOf<K extends DocKind> = K extends 'plan'
  ? PlanView
  : K extends 'hotpress'
    ? HotPressView
    : K extends 'chipping'
      ? ChippingView
      : K extends 'resin'
        ? ResinUseView
        : K extends 'cutting'
          ? CuttingView
          : K extends 'summary'
            ? SummaryView
            : MdoView;

const NEXT: Record<WfAction, { from: WfState; to: WfState; verb: string }> = {
  send: { from: 'draft', to: 'review', verb: 'Sent for review' },
  review: { from: 'review', to: 'reviewed', verb: 'Reviewed' },
  return: { from: 'review', to: 'draft', verb: 'Returned' },
  approve: { from: 'reviewed', to: 'approved', verb: 'Approved' },
  reject: { from: 'reviewed', to: 'draft', verb: 'Rejected' },
};
const STATE_LABEL: Record<WfState, string> = { draft: 'Draft', review: 'Sent for review', reviewed: 'Reviewed', approved: 'Approved' };

/** Create / edit / delete / sign-off for every production document kind. */
export class ProductionDocService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  private entity = (kind: DocKind) => `production_${kind}`;

  async list<K extends DocKind>(kind: K, query: ListQuery<DocFilters>): Promise<{ rows: ViewOf<K>[]; total: number }> {
    const spec = KINDS[kind];
    const res = await spec.repo(this.data.repos).list(query);
    return { rows: await spec.views(this.data.repos, res.rows), total: res.total };
  }

  async get<K extends DocKind>(kind: K, id: string): Promise<ViewOf<K>> {
    const spec = KINDS[kind];
    const d = await spec.repo(this.data.repos).getById(id);
    if (!d) throw notFound(DOC_KINDS[kind].label);
    return (await spec.views(this.data.repos, [d]))[0];
  }

  /** Every live row of a kind as views (reports, dashboard, pickers). */
  async all<K extends DocKind>(kind: K, repos: Repos = this.data.repos): Promise<ViewOf<K>[]> {
    const spec = KINDS[kind];
    return spec.views(repos, await spec.repo(repos).listAll());
  }

  async create<K extends DocKind>(kind: K, actor: Actor, input: Input): Promise<ViewOf<K>> {
    const spec = KINDS[kind];
    const row = await this.data.uow.run(async (tx) => {
      await guardFy(tx, input.date);
      const fields = await spec.build(tx, input, null);
      const at = isoNow(this.clock);
      const d = await spec.repo(tx).create({ id: newId(), docNo: await nextDocNo(tx, DOC_KINDS[kind].prefix, at), wfState: 'draft', wfTrail: [], ...fields, createdBy: actor.id, createdAt: at, updatedAt: at });
      await this.activity.record(tx, actor, { action: 'Create', entityType: this.entity(kind), entityId: d.id, details: `${d.docNo}: ${spec.describe(d)}` });
      return d;
    });
    return (await spec.views(this.data.repos, [row]))[0];
  }

  /** Approved documents are locked. Editing one under review or reviewed sends it back to draft. */
  async update<K extends DocKind>(kind: K, actor: Actor, id: string, patch: Input): Promise<ViewOf<K>> {
    const spec = KINDS[kind];
    const row = await this.data.uow.run(async (tx) => {
      const before = await spec.repo(tx).getById(id);
      if (!before) throw notFound(DOC_KINDS[kind].label);
      if (before.wfState === 'approved') throw conflict('approved', `${before.docNo} is approved and can no longer be edited`);
      const merged = { ...spec.toInput(before), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
      await guardFy(tx, before.date, merged.date);
      const fields = await spec.build(tx, merged, before);
      const at = isoNow(this.clock);
      const reset = before.wfState !== 'draft';
      const updated = (await spec.repo(tx).update(id, {
        ...fields,
        updatedAt: at,
        ...(reset ? { wfState: 'draft', wfTrail: [...before.wfTrail, { action: 'edit', by: actor.id, byName: actor.name, note: 'Edited; back to draft', at }] } : {}),
      }))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: this.entity(kind), entityId: id, details: `Edited ${before.docNo}${reset ? ' (back to draft)' : ''}: ${spec.describe(updated)}` });
      return updated;
    });
    return (await spec.views(this.data.repos, [row]))[0];
  }

  async remove(kind: DocKind, actor: Actor, id: string): Promise<void> {
    const spec = KINDS[kind];
    await this.data.uow.run(async (tx) => {
      const d = await spec.repo(tx).getById(id);
      if (!d) throw notFound(DOC_KINDS[kind].label);
      if (d.wfState === 'approved') throw conflict('approved', `${d.docNo} is approved and can’t be deleted`);
      await guardFy(tx, d.date);
      const used = (await spec.usedBy?.(tx, d)) ?? [];
      if (used.length) throw new HttpError(409, 'in_use', `${d.docNo} is used by ${used.join(', ')} and can’t be deleted`);
      await spec.repo(tx).softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: this.entity(kind), entityId: id, details: `Deleted ${d.docNo}` });
    });
  }

  /** send (edit), review / return (production_review), approve / reject (production_approve): checked at the route. */
  async workflow<K extends DocKind>(kind: K, actor: Actor, id: string, action: WfAction, note: string | null): Promise<ViewOf<K>> {
    const spec = KINDS[kind];
    const row = await this.data.uow.run(async (tx) => {
      const d = await spec.repo(tx).getById(id);
      if (!d) throw notFound(DOC_KINDS[kind].label);
      const step = NEXT[action];
      if (d.wfState !== step.from) throw conflict('wrong_state', `${d.docNo} is ${STATE_LABEL[d.wfState as WfState]}, so it can’t be ${step.verb.toLowerCase()}`);
      await guardFy(tx, d.date);
      const at = isoNow(this.clock);
      const updated = (await spec.repo(tx).update(id, { wfState: step.to, wfTrail: [...d.wfTrail, { action, by: actor.id, byName: actor.name, note, at }], updatedAt: at }))!;
      await this.activity.record(tx, actor, {
        action: action === 'approve' ? 'Approve' : 'StatusChange',
        entityType: this.entity(kind),
        entityId: id,
        details: `${step.verb} ${d.docNo}${note ? `: ${note}` : ''}`,
      });
      return updated;
    });
    return (await spec.views(this.data.repos, [row]))[0];
  }
}

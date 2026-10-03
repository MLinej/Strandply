import { mattStats, round3, type MattBatch, type MattBatchView, type WipBatchView, type WipLedgerRow } from '../../contracts/production';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { businessToday } from '../../lib/dates';
import { conflict, HttpError, notFound, validationFailed } from '../../lib/errors';
import type { DataLayer, ListQuery } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { guardFy, nameMap, nextDocNo, wipLedger, wipViews } from './common';

type MattFilters = { fy: string; from: string; to: string; status: 'open' | 'closed' };
/* eslint-disable @typescript-eslint/no-explicit-any -- validated at the route */
type Input = Record<string, any>;

/** Matt weight batches and punching (legacy Matt Weight + the stand-alone Matt Weight System). */
export class MattService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  async views(rows: MattBatch[]): Promise<MattBatchView[]> {
    const name = await nameMap(this.data.repos, rows.map((r) => r.createdBy));
    return rows.map((r) => ({ ...r, createdByName: name(r.createdBy), stats: mattStats(r.weights.map((w) => w.weight), r.setpoint, r.band) }));
  }

  async list(query: ListQuery<MattFilters>) {
    const res = await this.data.repos.mattBatches.list(query);
    return { rows: await this.views(res.rows), total: res.total };
  }

  async get(id: string): Promise<MattBatchView> {
    const b = await this.data.repos.mattBatches.getById(id);
    if (!b) throw notFound('Matt batch');
    return (await this.views([b]))[0]!;
  }

  async create(actor: Actor, i: Input): Promise<MattBatchView> {
    const b = await this.data.uow.run(async (tx) => {
      await guardFy(tx, i.date);
      const at = isoNow(this.clock);
      const row = await tx.mattBatches.create({
        id: newId(),
        docNo: await nextDocNo(tx, 'MWB', at),
        date: i.date,
        shift: i.shift,
        product: i.product,
        size: i.size,
        thickness: i.thickness ?? null,
        operator: i.operator ?? null,
        setpoint: i.setpoint,
        band: i.band,
        targetQty: i.targetQty ?? null,
        remarks: i.remarks ?? null,
        status: 'open',
        weights: [],
        closedAt: null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'production_matt', entityId: row.id, details: `Matt batch ${row.docNo}: ${row.product} ${row.size}, setpoint ${row.setpoint} kg ± ${row.band}` });
      return row;
    });
    return (await this.views([b]))[0]!;
  }

  /** Changing the setpoint or band re-grades every punched weight (statuses are not stored). */
  async update(actor: Actor, id: string, i: Input): Promise<MattBatchView> {
    const b = await this.data.uow.run(async (tx) => {
      const before = await tx.mattBatches.getById(id);
      if (!before) throw notFound('Matt batch');
      await guardFy(tx, before.date, i.date);
      const patch = Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined));
      const row = (await tx.mattBatches.update(id, { ...patch, updatedAt: isoNow(this.clock) }))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'production_matt', entityId: id, details: `Edited matt batch ${before.docNo}: ${Object.keys(patch).join(', ')}` });
      return row;
    });
    return (await this.views([b]))[0]!;
  }

  private async mutateWeights(actor: Actor, id: string, fn: (b: MattBatch) => { weights: MattBatch['weights']; detail: string; log: boolean }): Promise<MattBatchView> {
    const b = await this.data.uow.run(async (tx) => {
      const before = await tx.mattBatches.getById(id);
      if (!before) throw notFound('Matt batch');
      await guardFy(tx, before.date);
      const { weights, detail, log } = fn(before);
      const row = (await tx.mattBatches.update(id, { weights, updatedAt: isoNow(this.clock) }))!;
      // Each punch is not logged (hundreds per shift); corrections are.
      if (log) await this.activity.record(tx, actor, { action: 'Edit', entityType: 'production_matt', entityId: id, details: `${before.docNo}: ${detail}` });
      return row;
    });
    return (await this.views([b]))[0]!;
  }

  punch(actor: Actor, id: string, weight: number) {
    return this.mutateWeights(actor, id, (b) => {
      if (b.status !== 'open') throw conflict('closed', `${b.docNo} is closed; open a new batch to keep weighing`);
      const n = Math.max(0, ...b.weights.map((w) => w.n)) + 1;
      return { weights: [...b.weights, { n, weight: round3(weight), at: isoNow(this.clock) }], detail: `matt #${n} ${weight} kg`, log: false };
    });
  }

  /** Corrections need production_approve (legacy: Jimit Mehta's PIN). */
  editWeight(actor: Actor, id: string, n: number, weight: number) {
    return this.mutateWeights(actor, id, (b) => {
      const w = b.weights.find((x) => x.n === n);
      if (!w) throw notFound(`Matt #${n}`);
      return { weights: b.weights.map((x) => (x.n === n ? { ...x, weight: round3(weight) } : x)), detail: `corrected matt #${n} from ${w.weight} to ${weight} kg`, log: true };
    });
  }

  deleteWeight(actor: Actor, id: string, n: number) {
    return this.mutateWeights(actor, id, (b) => {
      const w = b.weights.find((x) => x.n === n);
      if (!w) throw notFound(`Matt #${n}`);
      return { weights: b.weights.filter((x) => x.n !== n), detail: `deleted matt #${n} (${w.weight} kg)`, log: true };
    });
  }

  async close(actor: Actor, id: string): Promise<MattBatchView> {
    const b = await this.data.uow.run(async (tx) => {
      const before = await tx.mattBatches.getById(id);
      if (!before) throw notFound('Matt batch');
      if (before.status === 'closed') throw conflict('closed', `${before.docNo} is already closed`);
      const at = isoNow(this.clock);
      const row = (await tx.mattBatches.update(id, { status: 'closed', closedAt: at, updatedAt: at }))!;
      await this.activity.record(tx, actor, { action: 'StatusChange', entityType: 'production_matt', entityId: id, details: `Closed matt batch ${before.docNo} with ${before.weights.length} matts` });
      return row;
    });
    return (await this.views([b]))[0]!;
  }

  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const b = await tx.mattBatches.getById(id);
      if (!b) throw notFound('Matt batch');
      await guardFy(tx, b.date);
      const [sums, plans] = await Promise.all([tx.prodSummary.listAll(), tx.prodPlans.listAll()]);
      const used = [...sums.filter((s) => s.mattBatchId === id), ...plans.filter((p) => p.mattBatchId === id)].map((x) => x.docNo);
      if (used.length) throw new HttpError(409, 'in_use', `${b.docNo} is used by ${used.join(', ')} and can’t be deleted`);
      await tx.mattBatches.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'production_matt', entityId: id, details: `Deleted matt batch ${b.docNo} and its ${b.weights.length} weights` });
    });
  }
}

/** WIP Nilgiri batches, their ledger and manual adjustments (legacy chipCreateWIP / WIP ledger). */
export class WipService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  list(): Promise<WipBatchView[]> {
    return wipViews(this.data.repos).then((v) => v.reverse());
  }

  ledger(wipId?: string): Promise<WipLedgerRow[]> {
    return wipLedger(this.data.repos, wipId);
  }

  async createFromChipping(actor: Actor, chippingId: string): Promise<WipBatchView> {
    const id = await this.data.uow.run(async (tx) => {
      const chip = await tx.prodChipping.getById(chippingId);
      if (!chip) throw validationFailed('Invalid input', [{ path: 'chippingId', message: 'Unknown chipping report' }]);
      const existing = await tx.wipBatches.getByChipping(chippingId);
      if (existing) throw conflict('wip_exists', `${chip.docNo} already has WIP batch ${existing.docNo}`);
      const at = isoNow(this.clock);
      const b = await tx.wipBatches.create({ id: newId(), docNo: await nextDocNo(tx, 'WIP', at), chippingId, date: chip.date, remarks: chip.remarks, createdBy: actor.id, createdAt: at, updatedAt: at });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'production_wip', entityId: b.id, details: `WIP batch ${b.docNo} from ${chip.docNo}` });
      return b.id;
    });
    return (await wipViews(this.data.repos)).find((w) => w.id === id)!;
  }

  /** Only while nothing has used or adjusted it. */
  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const b = (await wipViews(tx)).find((w) => w.id === id);
      if (!b) throw notFound('WIP batch');
      if (b.usedKg !== 0 || b.adjustKg !== 0) throw conflict('in_use', `${b.docNo} has been used or adjusted and can’t be deleted`);
      await tx.wipBatches.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'production_wip', entityId: id, details: `Deleted WIP batch ${b.docNo}` });
    });
  }

  /** + adds stock, − removes it (chipped weight is a derived figure, legacy wipLedgerManualAdjust). */
  async adjust(actor: Actor, id: string, input: { qty: number; reason: string; date?: string }): Promise<WipBatchView> {
    await this.data.uow.run(async (tx) => {
      const b = await tx.wipBatches.getById(id);
      if (!b) throw notFound('WIP batch');
      const date = input.date ?? businessToday(this.clock);
      await guardFy(tx, date);
      const at = isoNow(this.clock);
      await tx.wipAdjustments.create({ id: newId(), wipId: id, date, qty: round3(input.qty), reason: input.reason, createdBy: actor.id, createdAt: at, updatedAt: at });
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'production_wip', entityId: id, details: `Adjusted ${b.docNo} by ${input.qty > 0 ? '+' : ''}${input.qty} kg: ${input.reason}` });
    });
    return (await wipViews(this.data.repos)).find((w) => w.id === id)!;
  }
}

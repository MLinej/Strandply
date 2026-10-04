import { BILL_CHARGES, DEFAULT_METER, RATE_LABEL, type BillCharge, type ElBill, type ElRate, type ElReading, type MeterConfig } from '../../contracts/electricity';
import type { BlobStore, StoredBlob } from '../../lib/blob-store';
import { isoNow, type Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { newId } from '../../lib/crypto';
import { conflict, HttpError, notFound, validationFailed } from '../../lib/errors';
import { UniqueViolationError, type DataLayer, type ListQuery, type Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { RateBook, ReadingBook } from './calc';

/* eslint-disable @typescript-eslint/no-explicit-any -- inputs are validated by zod at the route */
type Input = Record<string, any>;
export const METER_KEY = 'electricity.meter';
export const MAX_INVOICE_BYTES = 10 * 1024 * 1024;
const bad = (path: string, message: string) => validationFailed('Invalid input', [{ path, message }]);
const units = (n: number) => n.toLocaleString('en-IN');
const rateText = (r: Pick<ElRate, 'kind' | 'value'>) => (r.kind === 'mf' ? `×${r.value}` : `₹${(r.value / 100).toLocaleString('en-IN')}`);

/** Meter details, rate histories, readings and PGVCL bills (legacy Electricity & Meter MIS). */
export class ElectricityService {
  constructor(
    private readonly data: DataLayer,
    private readonly blobs: BlobStore,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  private today = () => businessToday(this.clock);

  // ── Meter and rates ───────────────────────────────────────────────

  async meter(repos: Repos = this.data.repos): Promise<MeterConfig> {
    const v = (await repos.settings.getMany([METER_KEY]))[METER_KEY] as Partial<MeterConfig> | undefined;
    return { ...DEFAULT_METER, ...(v ?? {}) };
  }

  async saveMeter(actor: Actor, patch: Input): Promise<MeterConfig> {
    return this.data.uow.run(async (tx) => {
      const before = await this.meter(tx);
      const next = { ...before, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as MeterConfig;
      await tx.settings.set(METER_KEY, next, actor.id, isoNow(this.clock));
      const changed = (Object.keys(next) as (keyof MeterConfig)[]).filter((k) => next[k] !== before[k]);
      if (changed.length) await this.activity.record(tx, actor, { action: 'Edit', entityType: 'electricity_meter', details: `Meter details: ${changed.join(', ')}` });
      return next;
    });
  }

  async rates(repos: Repos = this.data.repos) {
    return (await repos.elRates.listAll()).sort((a, b) => a.kind.localeCompare(b.kind) || b.effectiveFrom.localeCompare(a.effectiveFrom));
  }
  async rateBook(repos: Repos = this.data.repos) {
    return new RateBook(await repos.elRates.listAll());
  }

  /** One entry per kind and date (legacy "Entry for this date exists"). Readings and bills pick it up by date. */
  async addRate(actor: Actor, input: Input): Promise<ElRate> {
    return this.data.uow.run(async (tx) => {
      if ((await tx.elRates.listAll()).some((r) => r.kind === input.kind && r.effectiveFrom === input.effectiveFrom)) throw conflict('duplicate', `There is already a ${RATE_LABEL[input.kind as ElRate['kind']].toLowerCase()} from that date`);
      const at = isoNow(this.clock);
      const r = await tx.elRates.create({ id: newId(), kind: input.kind, value: input.value, effectiveFrom: input.effectiveFrom, createdBy: actor.id, createdAt: at, updatedAt: at });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'electricity_rate', entityId: r.id, details: `${RATE_LABEL[r.kind]} ${rateText(r)} from ${r.effectiveFrom}` });
      return r;
    });
  }

  /** Each history keeps at least one entry (legacy). */
  async removeRate(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const r = await tx.elRates.getById(id);
      if (!r) throw notFound('Rate');
      if ((await tx.elRates.listAll()).filter((x) => x.kind === r.kind).length <= 1) throw new HttpError(409, 'last_entry', `Keep at least one ${RATE_LABEL[r.kind].toLowerCase()} entry`);
      await tx.elRates.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'electricity_rate', entityId: id, details: `Removed ${RATE_LABEL[r.kind]} ${rateText(r)} from ${r.effectiveFrom}` });
    });
  }

  // ── Readings ──────────────────────────────────────────────────────

  listReadings(query: ListQuery<{ shift: string; from: string; to: string }>) {
    return this.data.repos.elReadings.list(query);
  }

  /**
   * The meter only counts up: a reading can't be below the one before it or above the one after it. One reading
   * per date and time; nothing in the future.
   */
  async addReading(actor: Actor, input: Input): Promise<ElReading> {
    return this.data.uow.run(async (tx) => {
      if (input.date > this.today()) throw bad('date', 'That date hasn’t come yet');
      const book = new ReadingBook(await tx.elReadings.listAll());
      const prev = book.before(input as ElReading);
      const next = book.after(input as ElReading);
      if (prev && input.kwh < prev.kwh) throw bad('kwh', `Lower than the previous reading (${units(prev.kwh)} on ${prev.date} ${prev.time})`);
      if (next && input.kwh > next.kwh) throw bad('kwh', `Higher than the next reading (${units(next.kwh)} on ${next.date} ${next.time})`);
      const at = isoNow(this.clock);
      const r = await tx.elReadings
        .create({ id: newId(), date: input.date, shift: input.shift, time: input.time, at: `${input.date}T${input.time}`, kwh: input.kwh, pf: input.pf ?? null, nightKwh: input.nightKwh ?? null, remarks: input.remarks ?? null, createdBy: actor.id, createdAt: at, updatedAt: at })
        .catch((err) => {
          if (err instanceof UniqueViolationError) throw conflict('duplicate', `There is already a reading at ${input.time} on ${input.date}`);
          throw err;
        });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'electricity_reading', entityId: r.id, details: `${r.shift} reading ${units(r.kwh)} kWh on ${r.date} ${r.time}${r.pf !== null ? `, PF ${r.pf}` : ''}` });
      return r;
    });
  }

  async removeReading(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const r = await tx.elReadings.getById(id);
      if (!r) throw notFound('Reading');
      await tx.elReadings.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'electricity_reading', entityId: id, details: `Deleted ${r.shift} reading ${units(r.kwh)} kWh on ${r.date} ${r.time}` });
    });
  }

  // ── Bills ─────────────────────────────────────────────────────────

  async getBill(id: string): Promise<ElBill> {
    const b = await this.data.repos.elBills.getById(id);
    if (!b) throw notFound('Bill');
    return b;
  }

  private charges(input: Record<string, number | null | undefined> | undefined, before?: Record<BillCharge, number | null>): Record<BillCharge, number | null> {
    return Object.fromEntries(BILL_CHARGES.map((k) => [k, input?.[k] === undefined ? (before?.[k] ?? null) : input[k]])) as Record<BillCharge, number | null>;
  }

  private dup = (err: unknown, date: string) => {
    if (err instanceof UniqueViolationError) throw conflict('duplicate', `There is already a bill dated ${date}`);
    throw err;
  };

  async createBill(actor: Actor, input: Input): Promise<ElBill> {
    return this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      const b = await tx.elBills
        .create({
          id: newId(),
          billDate: input.billDate,
          dueDate: input.dueDate ?? null,
          paidDate: input.paidDate ?? null,
          advancePaymentPaise: input.advancePaymentPaise ?? null,
          kwhReading: input.kwhReading,
          kvarhReading: input.kvarhReading ?? null,
          pf: input.pf ?? null,
          nightUnits: input.nightUnits ?? null,
          charges: this.charges(input.charges),
          netPayablePaise: input.netPayablePaise ?? null,
          totalPayablePaise: input.totalPayablePaise,
          remarks: input.remarks ?? null,
          invoice: null,
          createdBy: actor.id,
          createdAt: at,
          updatedAt: at,
        })
        .catch((err) => this.dup(err, input.billDate));
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'electricity_bill', entityId: b.id, details: `PGVCL bill ${b.billDate}: ₹${(b.totalPayablePaise / 100).toLocaleString('en-IN')}` });
      return b;
    });
  }

  async updateBill(actor: Actor, id: string, patch: Input): Promise<ElBill> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.elBills.getById(id);
      if (!before) throw notFound('Bill');
      const { charges, ...rest } = patch;
      const b = (await tx.elBills.update(id, { ...rest, ...(charges ? { charges: this.charges(charges, before.charges) } : {}), updatedAt: isoNow(this.clock) }).catch((err) => this.dup(err, patch.billDate)))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'electricity_bill', entityId: id, details: `PGVCL bill ${b.billDate}${b.paidDate && !before.paidDate ? ` paid on ${b.paidDate}` : ''}` });
      return b;
    });
  }

  async removeBill(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const b = await tx.elBills.getById(id);
      if (!b) throw notFound('Bill');
      await tx.elBills.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'electricity_bill', entityId: id, details: `Deleted PGVCL bill ${b.billDate}` });
    });
  }

  /** The PGVCL invoice PDF (legacy stored it as base64 in the row; here the bytes go to the blob store). */
  async attachInvoice(actor: Actor, id: string, file: { name: string; bytes: Uint8Array }): Promise<ElBill> {
    if (!/\.pdf$/i.test(file.name)) throw validationFailed('Attach a PDF');
    if (!file.bytes.length) throw validationFailed('The file is empty');
    if (file.bytes.length > MAX_INVOICE_BYTES) throw validationFailed('The PDF can be up to 10 MB');
    if (!(file.bytes[0] === 0x25 && file.bytes[1] === 0x50 && file.bytes[2] === 0x44 && file.bytes[3] === 0x46)) throw validationFailed('That file isn’t a PDF');
    await this.getBill(id);
    const blobKey = `electricity/${id}/${newId()}`;
    await this.blobs.put(blobKey, file.bytes, 'application/pdf');
    try {
      return await this.data.uow.run(async (tx) => {
        const before = (await tx.elBills.getById(id))!;
        const b = (await tx.elBills.update(id, { invoice: { name: file.name.replace(/[\\/]/g, '_').slice(0, 200), mime: 'application/pdf', sizeBytes: file.bytes.length, blobKey }, updatedAt: isoNow(this.clock) }))!;
        await this.activity.record(tx, actor, { action: 'Edit', entityType: 'electricity_bill', entityId: id, details: `${before.invoice ? 'Replaced' : 'Attached'} invoice ${b.invoice!.name} on bill ${b.billDate}` });
        return b;
      });
    } catch (err) {
      await this.blobs.delete(blobKey);
      throw err;
    }
  }

  async invoice(id: string): Promise<{ bill: ElBill; blob: StoredBlob }> {
    const bill = await this.getBill(id);
    const blob = bill.invoice ? await this.blobs.get(bill.invoice.blobKey) : null;
    if (!blob) throw notFound('Invoice');
    return { bill, blob };
  }

  async removeInvoice(actor: Actor, id: string): Promise<ElBill> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.elBills.getById(id);
      if (!before?.invoice) throw notFound('Invoice');
      const b = (await tx.elBills.update(id, { invoice: null, updatedAt: isoNow(this.clock) }))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'electricity_bill', entityId: id, details: `Removed invoice ${before.invoice.name} from bill ${b.billDate}` });
      return b;
    });
  }
}

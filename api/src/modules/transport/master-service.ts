import type { Transporter, TransporterFilters, TransporterImportResult, TransporterImportRow, VehicleType } from '../../contracts/transport';
import { fyOf } from '../../contracts/purchase';
import { isoNow, type Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { newId } from '../../lib/crypto';
import { conflict, HttpError, notFound, validationFailed } from '../../lib/errors';
import { readFirstSheet } from '../../lib/spreadsheet';
import { UniqueViolationError, type DataLayer, type ListQuery, type Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';

/* eslint-disable @typescript-eslint/no-explicit-any -- inputs are validated by zod at the route */
type Input = Record<string, any>;
const defined = (o: Input) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** TRP-26-001: one running number for all transporters, the year part from today's FY (legacy TRP-yy-nnn). */
async function nextCode(tx: Repos, clock: Clock, at: string) {
  const fy = fyOf(businessToday(clock));
  return `TRP-${fy.slice(2, 4)}-${String(await tx.counters.next('TR-TRP', at)).padStart(3, '0')}`;
}

const unique = <T,>(what: string, fn: () => Promise<T>) =>
  fn().catch((err) => {
    if (err instanceof UniqueViolationError) throw conflict('duplicate', `Another ${what} already has that ${err.field === 'code' ? 'code' : 'name'}`);
    throw err;
  });

/** Vehicle type master and transporter directory (legacy VEHICLES / TRANSPORTERS). */
export class TransportMasterService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  // ── Vehicle types ─────────────────────────────────────────────────

  async vehicles(): Promise<VehicleType[]> {
    return this.data.repos.trVehicles.listAll();
  }

  /** Renaming a type renames it on transporters too (they store names). */
  async saveVehicle(actor: Actor, id: string | null, input: Input): Promise<VehicleType> {
    return this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      const before = id ? await tx.trVehicles.getById(id) : null;
      if (id && !before) throw notFound('Vehicle type');
      const fields = { name: input.name ?? before!.name, description: input.description === undefined ? (before?.description ?? null) : input.description, capacity: input.capacity === undefined ? (before?.capacity ?? null) : input.capacity, active: input.active ?? before?.active ?? true };
      const v = before
        ? (await unique('vehicle type', () => tx.trVehicles.update(before.id, { ...fields, updatedAt: at })))!
        : await unique('vehicle type', () => tx.trVehicles.create({ id: newId(), ...fields, createdBy: actor.id, createdAt: at, updatedAt: at }));
      if (before && before.name !== v.name)
        for (const tp of (await tx.trTransporters.listAll()).filter((x) => x.vehicles.includes(before.name)))
          await tx.trTransporters.update(tp.id, { vehicles: tp.vehicles.map((n) => (n === before.name ? v.name : n)), updatedAt: at });
      await this.activity.record(tx, actor, { action: before ? 'Edit' : 'Create', entityType: 'transport_vehicle', entityId: v.id, details: `Vehicle type ${v.name}${v.active ? '' : ' (inactive)'}` });
      return v;
    });
  }

  /** Types on inquiries can only be deactivated (legacy togVeh). */
  async removeVehicle(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const v = await tx.trVehicles.getById(id);
      if (!v) throw notFound('Vehicle type');
      if ((await tx.trInquiries.listAll()).some((i) => i.vehicle === v.name)) throw new HttpError(409, 'in_use', `${v.name} is on inquiries; deactivate it instead`);
      await tx.trVehicles.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'transport_vehicle', entityId: id, details: `Deleted vehicle type ${v.name}` });
    });
  }

  // ── Transporters ──────────────────────────────────────────────────

  listTransporters(query: ListQuery<TransporterFilters>) {
    return this.data.repos.trTransporters.list(query);
  }

  async getTransporter(id: string) {
    const t = await this.data.repos.trTransporters.getById(id);
    if (!t) throw notFound('Transporter');
    return t;
  }

  private fields(i: Input) {
    return {
      name: i.name,
      contactPerson: i.contactPerson ?? null,
      phone: i.phone,
      phone2: i.phone2 ?? null,
      email: i.email ?? null,
      address: i.address ?? null,
      city: i.city,
      state: i.state ?? null,
      pincode: i.pincode ?? null,
      gstin: i.gstin ?? null,
      pan: i.pan ?? null,
      tds: !!i.tds,
      creditTerms: i.creditTerms ?? 'Against Delivery',
      ifsc: i.ifsc ?? null,
      bankName: i.bankName ?? null,
      bankBranch: i.bankBranch ?? null,
      accountName: i.accountName ?? null,
      accountNo: i.accountNo ?? null,
      vehicles: [...new Set<string>(i.vehicles ?? [])],
      operatingCities: (i.operatingCities ?? []).map((c: Input) => ({ city: c.city, state: c.state ?? null, pincode: c.pincode ?? null })),
      rating: i.rating ?? 3,
      active: i.active ?? true,
    };
  }

  async createTransporter(actor: Actor, input: Input): Promise<Transporter> {
    return this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      const t = await unique('transporter', async () => tx.trTransporters.create({ id: newId(), code: await nextCode(tx, this.clock, at), ...this.fields(input), createdBy: actor.id, createdAt: at, updatedAt: at }));
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'transport_transporter', entityId: t.id, details: `Transporter ${t.code} ${t.name}, ${t.city}` });
      return t;
    });
  }

  async updateTransporter(actor: Actor, id: string, patch: Input): Promise<Transporter> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.trTransporters.getById(id);
      if (!before) throw notFound('Transporter');
      const t = (await unique('transporter', () => tx.trTransporters.update(id, { ...this.fields({ ...before, ...defined(patch) }), updatedAt: isoNow(this.clock) })))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'transport_transporter', entityId: id, details: `Transporter ${t.code} ${t.name}` });
      return t;
    });
  }

  /** Transporters quoted on a comparison can't be deleted; deactivate them. */
  async removeTransporter(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const t = await tx.trTransporters.getById(id);
      if (!t) throw notFound('Transporter');
      if ((await tx.trRateCmps.listAll()).some((rc) => rc.quotes.some((q) => q.transporterId === id))) throw new HttpError(409, 'in_use', `${t.name} has quoted on rate comparisons; deactivate instead`);
      await tx.trTransporters.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'transport_transporter', entityId: id, details: `Deleted transporter ${t.code} ${t.name}` });
    });
  }

  /**
   * Transporter sheet import (legacy handleXlsxUpload): Name, Mobile, City required; Contact, Mobile2, Email, Address,
   * State, Pincode, GST, PAN, TDS (Yes / No), Credit, Vehicles and OpCities (comma-separated) optional. A dry run previews.
   */
  async importTransporters(actor: Actor, bytes: Uint8Array, commit: boolean): Promise<TransporterImportResult> {
    const sheet = readFirstSheet(bytes);
    const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
    const col = (cells: Record<string, unknown>, ...names: string[]) => {
      const h = sheet.headers.find((x) => names.includes(key(x)));
      const v = h ? String(cells[h] ?? '').trim() : '';
      return v || null;
    };
    const existing = new Set((await this.data.repos.trTransporters.listAll()).map((t) => t.name.trim().toLowerCase()));
    const parsed = sheet.rows.map(({ row, cells }) => {
      const name = col(cells, 'name', 'transporter', 'transportername') ?? '';
      const phone = (col(cells, 'mobile', 'phone', 'mobilenumber') ?? '').replace(/\.0$/, '');
      const city = col(cells, 'city') ?? '';
      const error = !name ? 'Name is missing' : !phone ? 'Mobile is missing' : !city ? 'City is missing' : existing.has(name.toLowerCase()) ? 'Already in the directory' : null;
      if (!error) existing.add(name.toLowerCase());
      const list = (v: string | null) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);
      return {
        out: { row, name, phone, city, state: col(cells, 'state'), error } as TransporterImportRow,
        input: {
          name,
          phone,
          city,
          state: col(cells, 'state'),
          contactPerson: col(cells, 'contact', 'contactperson'),
          phone2: col(cells, 'mobile2', 'phone2'),
          email: col(cells, 'email'),
          address: col(cells, 'address'),
          pincode: col(cells, 'pincode'),
          gstin: col(cells, 'gst', 'gstin')?.toUpperCase() ?? null,
          pan: col(cells, 'pan')?.toUpperCase() ?? null,
          tds: (col(cells, 'tds') ?? '').toLowerCase().startsWith('y'),
          creditTerms: col(cells, 'credit', 'creditterms') ?? 'Against Delivery',
          vehicles: list(col(cells, 'vehicles')),
          operatingCities: list(col(cells, 'opcities', 'operatingcities')).map((c) => ({ city: c, state: null, pincode: null })),
        },
      };
    });
    const valid = parsed.filter((p) => !p.out.error);
    let imported = 0;
    if (commit && valid.length)
      await this.data.uow.run(async (tx) => {
        const at = isoNow(this.clock);
        for (const p of valid) {
          await tx.trTransporters.create({ id: newId(), code: await nextCode(tx, this.clock, at), ...this.fields(p.input), createdBy: actor.id, createdAt: at, updatedAt: at });
          imported++;
        }
        await this.activity.record(tx, actor, { action: 'Import', entityType: 'transport_transporter', details: `Imported ${imported} transporter(s)` });
      });
    if (!sheet.rows.length) throw validationFailed('The sheet has no rows');
    return { total: sheet.rows.length, valid: valid.length, rows: parsed.map((p) => p.out).slice(0, 500), imported };
  }
}

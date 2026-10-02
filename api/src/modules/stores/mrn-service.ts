import { storeMaterialLabel, type Mrn, type MrnFilters, type MrnItem, type MrnView, type StoresVendorOption } from '../../contracts/stores';
import type { CompanyBlock } from '../../contracts/sampletrack';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { businessToday } from '../../lib/dates';
import { conflict, notFound, validationFailed } from '../../lib/errors';
import { writeXlsx } from '../../lib/spreadsheet';
import { normName } from '../../lib/text';
import type { DataLayer, ListQuery, MrnPatch, Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { collectAll } from '../sampletrack/masters/common';
import type { CompanyService } from '../sampletrack/settings/company-service';
import { businessTime, daysSince, nextDocNo, readSettings } from './common';
import type { MrnCreate, MrnUpdate } from './validation';

export interface MrnPrintPayload {
  company: CompanyBlock;
  mrn: MrnView;
  generatedAt: string;
}

/** "Nilgiri Wood, Resin +1 more" (legacy mrnItemsSummary). */
export const itemsSummary = (items: { material: string }[]) => {
  if (!items.length) return '—';
  const names = items.map((i) => storeMaterialLabel(i.material));
  return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
};

/** Gate entry by Security (legacy MRN form and register). */
export class MrnService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly company: CompanyService,
    private readonly clock: Clock,
  ) {}

  async views(rows: Mrn[]): Promise<MrnView[]> {
    if (!rows.length) return [];
    const ids = [...new Set(rows.map((r) => r.createdBy).filter((x): x is string => !!x))];
    const people = await this.data.repos.users.getByIds(ids);
    return rows.map((r) => ({
      ...r,
      createdByName: r.createdBy ? (people.find((u) => u.id === r.createdBy)?.name ?? null) : null,
      daysPending: r.status === 'pending_grn' ? daysSince(r.date, this.clock) : 0,
    }));
  }

  async list(query: ListQuery<MrnFilters>) {
    const res = await this.data.repos.mrns.list(query);
    return { rows: await this.views(res.rows), total: res.total };
  }

  async get(id: string): Promise<MrnView> {
    const m = await this.data.repos.mrns.getById(id);
    if (!m) throw notFound('MRN');
    return (await this.views([m]))[0]!;
  }

  /** Vendor directory names for the gate form (blacklisted vendors left out). */
  async vendorOptions(q?: string): Promise<StoresVendorOption[]> {
    const needle = q ? normName(q) : '';
    return (await this.data.repos.vendors.listAll())
      .filter((v) => v.status !== 'blacklisted')
      .filter((v) => !needle || [v.name, v.code, v.city ?? ''].some((s) => normName(s).includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
      .slice(0, 30)
      .map((v) => ({ id: v.id, code: v.code, name: v.name, city: v.city }));
  }

  /** Date and time: the server clock while auto-punch is on, else what Security typed (both required). */
  private async stamp(tx: Repos, input: { date?: string; time?: string }) {
    if ((await readSettings(tx)).autoPunchMrn) return { date: businessToday(this.clock), time: businessTime(this.clock) };
    const missing = [!input.date && { path: 'date', message: 'Date is required' }, !input.time && { path: 'time', message: 'Time is required' }].filter(Boolean);
    if (missing.length) throw validationFailed('Invalid input', missing);
    return { date: input.date!, time: input.time! };
  }

  /** A picked vendor's name comes from the directory. */
  private async vendor(tx: Repos, vendorId: string | null | undefined, vendorName: string) {
    if (!vendorId) return { vendorId: null, vendorName };
    const v = await tx.vendors.getById(vendorId);
    if (!v) throw validationFailed('Invalid input', [{ path: 'vendorId', message: 'Unknown vendor' }]);
    return { vendorId: v.id, vendorName: v.name };
  }

  private items(input: MrnCreate['items'], before: MrnItem[] = []): MrnItem[] {
    const known = new Set(before.map((i) => i.id));
    return input.map((it) => ({
      id: it.id && known.has(it.id) ? it.id : newId(),
      material: it.material,
      approxQty: it.approxQty,
      unit: it.unit,
      packages: it.packages ?? null,
      remarks: it.remarks ?? null,
    }));
  }

  async create(actor: Actor, input: MrnCreate): Promise<MrnView> {
    const mrn = await this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      const when = await this.stamp(tx, input);
      const { no, fy } = await nextDocNo(tx, 'MRN', when.date, at, async (n) => !!(await tx.mrns.getByMrnNo(n)));
      const m = await tx.mrns.create({
        id: newId(),
        mrnNo: no,
        fy,
        ...when,
        vehicleNo: input.vehicleNo,
        securityName: input.securityName,
        driverName: input.driverName ?? null,
        driverPhone: input.driverPhone ?? null,
        ...(await this.vendor(tx, input.vendorId, input.vendorName)),
        invoiceNo: input.invoiceNo ?? null,
        remarks: input.remarks ?? null,
        items: this.items(input.items),
        status: 'pending_grn',
        grnId: null,
        grnNo: null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, {
        action: 'Create',
        entityType: 'stores_mrn',
        entityId: m.id,
        details: `Gate entry ${m.mrnNo}: ${m.vehicleNo}, ${m.vendorName}, ${itemsSummary(m.items)}`,
      });
      return m;
    });
    return (await this.views([mrn]))[0]!;
  }

  /** Only while the MRN is waiting for its GRN. Date and time stay as punched while auto-punch is on. */
  async update(actor: Actor, id: string, input: MrnUpdate): Promise<MrnView> {
    const mrn = await this.data.uow.run(async (tx) => {
      const before = await tx.mrns.getById(id);
      if (!before) throw notFound('MRN');
      if (before.status !== 'pending_grn') throw conflict('grn_created', `${before.mrnNo} already has a GRN and can no longer be edited`);
      const auto = (await readSettings(tx)).autoPunchMrn;
      const patch: MrnPatch = { updatedAt: isoNow(this.clock) };
      if (!auto) {
        if (input.date) patch.date = input.date;
        if (input.time) patch.time = input.time;
      }
      for (const k of ['vehicleNo', 'securityName', 'driverName', 'driverPhone', 'invoiceNo', 'remarks'] as const) if (input[k] !== undefined) (patch as Record<string, unknown>)[k] = input[k];
      if (input.vendorName !== undefined || input.vendorId !== undefined) Object.assign(patch, await this.vendor(tx, input.vendorId, input.vendorName ?? before.vendorName));
      if (input.items) patch.items = this.items(input.items, before.items);
      const updated = (await tx.mrns.update(id, patch))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'stores_mrn', entityId: id, details: `Edited gate entry ${before.mrnNo}` });
      return updated;
    });
    return (await this.views([mrn]))[0]!;
  }

  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const m = await tx.mrns.getById(id);
      if (!m) throw notFound('MRN');
      if (m.status !== 'pending_grn') throw conflict('grn_created', `${m.mrnNo} has GRN ${m.grnNo}; delete the GRN first`);
      await tx.mrns.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'stores_mrn', entityId: id, details: `Deleted gate entry ${m.mrnNo}` });
    });
  }

  async printPayload(actor: Actor, id: string): Promise<MrnPrintPayload> {
    const mrn = await this.get(id);
    const company = await this.company.block();
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Print', entityType: 'stores_mrn', entityId: id, details: `Printed MRN slip ${mrn.mrnNo}` }));
    return { company, mrn, generatedAt: isoNow(this.clock) };
  }

  /** One row per item (legacy MRN register Excel). */
  async exportXlsx(actor: Actor, query: ListQuery<MrnFilters>): Promise<Uint8Array> {
    const mrns = await collectAll((q) => this.data.repos.mrns.list(q), query);
    const rows = mrns.flatMap((m) => m.items.map((it) => ({ m, it })));
    type R = (typeof rows)[number];
    const bytes = writeXlsx([
      {
        name: 'MRN Register',
        rows,
        columns: [
          { header: 'MRN No', value: (r: R) => r.m.mrnNo },
          { header: 'Date', value: (r: R) => r.m.date },
          { header: 'Time', value: (r: R) => r.m.time },
          { header: 'Vehicle No', value: (r: R) => r.m.vehicleNo },
          { header: 'Vendor', value: (r: R) => r.m.vendorName },
          { header: 'Invoice / Challan', value: (r: R) => r.m.invoiceNo },
          { header: 'Material', value: (r: R) => storeMaterialLabel(r.it.material) },
          { header: 'Approx Qty', value: (r: R) => r.it.approxQty },
          { header: 'Unit', value: (r: R) => r.it.unit },
          { header: 'Packages', value: (r: R) => r.it.packages },
          { header: 'Item Remarks', value: (r: R) => r.it.remarks },
          { header: 'Security Guard', value: (r: R) => r.m.securityName },
          { header: 'Driver', value: (r: R) => r.m.driverName },
          { header: 'Driver Phone', value: (r: R) => r.m.driverPhone },
          { header: 'Gate Remarks', value: (r: R) => r.m.remarks },
          { header: 'Status', value: (r: R) => (r.m.status === 'pending_grn' ? 'Pending GRN' : 'GRN Created') },
          { header: 'GRN No', value: (r: R) => r.m.grnNo },
        ],
      },
    ]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'stores_mrn', details: `Exported ${mrns.length} MRNs` }));
    return bytes;
  }
}

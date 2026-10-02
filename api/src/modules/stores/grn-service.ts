import {
  qualityLabel,
  storeMaterialLabel,
  worstQuality,
  type Grn,
  type GrnFilters,
  type GrnItem,
  type GrnView,
  type InvoiceMatch,
  type Mrn,
} from '../../contracts/stores';
import type { CompanyBlock } from '../../contracts/sampletrack';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { businessToday } from '../../lib/dates';
import { conflict, notFound, validationFailed } from '../../lib/errors';
import { writeXlsx } from '../../lib/spreadsheet';
import type { DataLayer, GrnPatch, ListQuery, Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { collectAll } from '../sampletrack/masters/common';
import type { CompanyService } from '../sampletrack/settings/company-service';
import { businessTime, findInvoice, nextDocNo, readSettings } from './common';
import { itemsSummary } from './mrn-service';
import type { GrnCreate, GrnUpdate } from './validation';

export interface GrnPrintPayload {
  company: CompanyBlock;
  grn: GrnView;
  generatedAt: string;
}

const STATUS_LABEL: Record<Grn['status'], string> = { draft: 'Draft', reviewed: 'Reviewed', approved: 'Approved' };

/** Receiving by Stores against an MRN, the two-step sign-off and the accounting audit trail. */
export class GrnService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly company: CompanyService,
    private readonly clock: Clock,
  ) {}

  async views(rows: Grn[]): Promise<GrnView[]> {
    if (!rows.length) return [];
    const { users, purchaseEntries } = this.data.repos;
    const ids = [...new Set(rows.flatMap((r) => [r.createdBy, r.reviewedBy, r.approvedBy, r.accountedBy]).filter((x): x is string => !!x))];
    const people = await users.getByIds(ids);
    const name = (id: string | null) => (id ? (people.find((u) => u.id === id)?.name ?? null) : null);
    return Promise.all(
      rows.map(async (r) => {
        const e = r.purchaseEntryId ? await purchaseEntries.getById(r.purchaseEntryId) : null;
        return {
          ...r,
          worstQuality: worstQuality(r.items),
          createdByName: name(r.createdBy),
          reviewedByName: name(r.reviewedBy),
          approvedByName: name(r.approvedBy),
          accountedByName: name(r.accountedBy),
          purchaseEntry: e ? { entryId: e.id, lotNo: e.lotNo, material: e.material, vendorName: e.vendorName, date: e.date } : null,
        };
      }),
    );
  }

  async list(query: ListQuery<GrnFilters>) {
    const res = await this.data.repos.grns.list(query);
    return { rows: await this.views(res.rows), total: res.total };
  }

  async get(id: string): Promise<GrnView> {
    const g = await this.data.repos.grns.getById(id);
    if (!g) throw notFound('GRN');
    return (await this.views([g]))[0]!;
  }

  async invoiceLink(invoiceNo: string, vendorName?: string): Promise<InvoiceMatch | null> {
    return findInvoice(this.data.repos, invoiceNo, vendorName);
  }

  /**
   * Builds the GRN lines. Lines from the MRN take their material and gate quantity from it;
   * unlisted lines need a material and have no gate quantity.
   */
  private items(mrn: Mrn, input: GrnCreate['items'], before: GrnItem[] = []): GrnItem[] {
    const byId = new Map(mrn.items.map((i) => [i.id, i]));
    const known = new Set(before.map((i) => i.id));
    const seen = new Set<string>();
    return input.map((it, idx) => {
      const path = `items.${idx}`;
      let material = it.material ?? null;
      let approxQty = 0;
      if (it.mrnItemId) {
        const src = byId.get(it.mrnItemId);
        if (!src) throw validationFailed('Invalid input', [{ path: `${path}.mrnItemId`, message: `That line isn’t on ${mrn.mrnNo}` }]);
        if (seen.has(it.mrnItemId)) throw validationFailed('Invalid input', [{ path: `${path}.mrnItemId`, message: 'The same MRN line is received twice' }]);
        seen.add(it.mrnItemId);
        material = src.material;
        approxQty = src.approxQty;
      } else if (!material) {
        throw validationFailed('Invalid input', [{ path: `${path}.material`, message: 'Pick the material for the extra item' }]);
      }
      return {
        id: it.id && known.has(it.id) ? it.id : newId(),
        mrnItemId: it.mrnItemId ?? null,
        material,
        approxQty,
        actualQty: it.actualQty,
        unit: it.unit,
        quality: it.quality,
        qualityRemarks: it.qualityRemarks ?? null,
      };
    });
  }

  private async stamp(tx: Repos, input: { date?: string; time?: string }) {
    if ((await readSettings(tx)).autoPunchGrn) return { date: businessToday(this.clock), time: businessTime(this.clock) };
    const missing = [!input.date && { path: 'date', message: 'Date is required' }, !input.time && { path: 'time', message: 'Time is required' }].filter(Boolean);
    if (missing.length) throw validationFailed('Invalid input', missing);
    return { date: input.date!, time: input.time! };
  }

  /** Saves a Draft GRN and marks the MRN "GRN created", together. */
  async create(actor: Actor, input: GrnCreate): Promise<GrnView> {
    const grn = await this.data.uow.run(async (tx) => {
      const mrn = await tx.mrns.getById(input.mrnId);
      if (!mrn) throw validationFailed('Invalid input', [{ path: 'mrnId', message: 'Unknown MRN' }]);
      if (mrn.status !== 'pending_grn') throw conflict('grn_exists', `${mrn.mrnNo} already has GRN ${mrn.grnNo}`);
      const at = isoNow(this.clock);
      const when = await this.stamp(tx, input);
      if (when.date < mrn.date) throw validationFailed('Invalid input', [{ path: 'date', message: `Receiving can’t be before the gate entry (${mrn.date})` }]);
      const { no, fy } = await nextDocNo(tx, 'GRN', when.date, at, async (n) => !!(await tx.grns.getByGrnNo(n)));
      const vendorName = input.vendorName ?? mrn.vendorName;
      const link = await findInvoice(tx, input.invoiceNo, vendorName);
      const g = await tx.grns.create({
        id: newId(),
        grnNo: no,
        fy,
        ...when,
        mrnId: mrn.id,
        mrnNo: mrn.mrnNo,
        vehicleNo: mrn.vehicleNo,
        vendorName,
        invoiceNo: input.invoiceNo,
        purchaseEntryId: link?.entryId ?? null,
        items: this.items(mrn, input.items),
        receivedByName: input.receivedByName,
        remarks: input.remarks ?? null,
        status: 'draft',
        reviewedBy: null,
        reviewedAt: null,
        approvedBy: null,
        approvedAt: null,
        accounted: false,
        voucherNo: null,
        accountedBy: null,
        accountedAt: null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await tx.mrns.update(mrn.id, { status: 'grn_created', grnId: g.id, grnNo: g.grnNo, updatedAt: at });
      await this.activity.record(tx, actor, {
        action: 'Create',
        entityType: 'stores_grn',
        entityId: g.id,
        details: `GRN ${g.grnNo} against ${mrn.mrnNo}: ${g.items.length} item(s), invoice ${g.invoiceNo}${link ? ` (Purchase lot ${link.lotNo})` : ''}`,
      });
      return g;
    });
    return (await this.views([grn]))[0]!;
  }

  /** Until approved. Editing a reviewed GRN sends it back to Draft for review again. */
  async update(actor: Actor, id: string, input: GrnUpdate): Promise<GrnView> {
    const grn = await this.data.uow.run(async (tx) => {
      const before = await tx.grns.getById(id);
      if (!before) throw notFound('GRN');
      if (before.status === 'approved') throw conflict('approved', `${before.grnNo} is approved and can no longer be edited`);
      const mrn = (await tx.mrns.getById(before.mrnId))!;
      const at = isoNow(this.clock);
      const patch: GrnPatch = { updatedAt: at };
      if (!(await readSettings(tx)).autoPunchGrn) {
        if (input.date) patch.date = input.date;
        if (input.time) patch.time = input.time;
        if (patch.date && patch.date < mrn.date) throw validationFailed('Invalid input', [{ path: 'date', message: `Receiving can’t be before the gate entry (${mrn.date})` }]);
      }
      for (const k of ['vendorName', 'receivedByName', 'remarks'] as const) if (input[k] !== undefined) (patch as Record<string, unknown>)[k] = input[k];
      if (input.invoiceNo !== undefined || input.vendorName !== undefined) {
        patch.invoiceNo = input.invoiceNo ?? before.invoiceNo;
        patch.purchaseEntryId = (await findInvoice(tx, patch.invoiceNo, input.vendorName ?? before.vendorName))?.entryId ?? null;
      }
      if (input.items) patch.items = this.items(mrn, input.items, before.items);
      const reset = before.status === 'reviewed';
      if (reset) Object.assign(patch, { status: 'draft', reviewedBy: null, reviewedAt: null });
      const updated = (await tx.grns.update(id, patch))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'stores_grn', entityId: id, details: `Edited GRN ${before.grnNo}${reset ? '; needs review again' : ''}` });
      return updated;
    });
    return (await this.views([grn]))[0]!;
  }

  /** Until approved. The MRN goes back to "Pending GRN". */
  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const g = await tx.grns.getById(id);
      if (!g) throw notFound('GRN');
      if (g.status === 'approved') throw conflict('approved', `${g.grnNo} is approved and can’t be deleted`);
      const at = isoNow(this.clock);
      await tx.grns.softDelete(id, at);
      await tx.mrns.update(g.mrnId, { status: 'pending_grn', grnId: null, grnNo: null, updatedAt: at });
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'stores_grn', entityId: id, details: `Deleted GRN ${g.grnNo}; ${g.mrnNo} is pending GRN again` });
    });
  }

  private async transition(actor: Actor, id: string, step: 'review' | 'approve' | 'account' | 'unaccount', voucherNo?: string): Promise<GrnView> {
    const grn = await this.data.uow.run(async (tx) => {
      const g = await tx.grns.getById(id);
      if (!g) throw notFound('GRN');
      const at = isoNow(this.clock);
      let patch: GrnPatch;
      let details: string;
      switch (step) {
        case 'review':
          if (g.status !== 'draft') throw conflict('wrong_status', `${g.grnNo} is ${STATUS_LABEL[g.status]}, not Draft`);
          patch = { status: 'reviewed', reviewedBy: actor.id, reviewedAt: at, updatedAt: at };
          details = `Reviewed GRN ${g.grnNo}`;
          break;
        case 'approve':
          if (g.status !== 'reviewed') throw conflict('wrong_status', g.status === 'draft' ? `${g.grnNo} must be reviewed before approval` : `${g.grnNo} is already approved`);
          patch = { status: 'approved', approvedBy: actor.id, approvedAt: at, updatedAt: at };
          details = `Approved GRN ${g.grnNo}`;
          break;
        case 'account':
          if (g.status !== 'approved') throw conflict('not_approved', `${g.grnNo} must be approved before it is accounted`);
          if (g.accounted) throw conflict('already_accounted', `${g.grnNo} is already accounted (voucher ${g.voucherNo})`);
          patch = { accounted: true, voucherNo: voucherNo!, accountedBy: actor.id, accountedAt: at, updatedAt: at };
          details = `Marked GRN ${g.grnNo} accounted, voucher ${voucherNo}`;
          break;
        case 'unaccount':
          if (!g.accounted) throw conflict('not_accounted', `${g.grnNo} isn’t marked accounted`);
          patch = { accounted: false, voucherNo: null, accountedBy: null, accountedAt: null, updatedAt: at };
          details = `Reverted accounting of GRN ${g.grnNo} (was voucher ${g.voucherNo})`;
          break;
      }
      const updated = (await tx.grns.update(id, patch))!;
      const action = step === 'review' || step === 'approve' ? 'Approve' : 'StatusChange';
      await this.activity.record(tx, actor, { action, entityType: 'stores_grn', entityId: id, details });
      return updated;
    });
    return (await this.views([grn]))[0]!;
  }

  review = (actor: Actor, id: string) => this.transition(actor, id, 'review');
  approve = (actor: Actor, id: string) => this.transition(actor, id, 'approve');
  markAccounted = (actor: Actor, id: string, voucherNo: string) => this.transition(actor, id, 'account', voucherNo);
  undoAccounted = (actor: Actor, id: string) => this.transition(actor, id, 'unaccount');

  async printPayload(actor: Actor, id: string): Promise<GrnPrintPayload> {
    const grn = await this.get(id);
    const company = await this.company.block();
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Print', entityType: 'stores_grn', entityId: id, details: `Printed GRN ${grn.grnNo}` }));
    return { company, grn, generatedAt: isoNow(this.clock) };
  }

  /** GRN register, one row per item (legacy grnExcelBtn). */
  async exportXlsx(actor: Actor, query: ListQuery<GrnFilters>): Promise<Uint8Array> {
    const grns = await this.views(await collectAll((q) => this.data.repos.grns.list(q), query));
    const rows = grns.flatMap((g) => g.items.map((it) => ({ g, it })));
    type R = (typeof rows)[number];
    const bytes = writeXlsx([
      {
        name: 'GRN Register',
        rows,
        columns: [
          { header: 'GRN No', value: (r: R) => r.g.grnNo },
          { header: 'MRN No', value: (r: R) => r.g.mrnNo },
          { header: 'Date', value: (r: R) => r.g.date },
          { header: 'Time', value: (r: R) => r.g.time },
          { header: 'Vendor', value: (r: R) => r.g.vendorName },
          { header: 'Material', value: (r: R) => storeMaterialLabel(r.it.material) + (r.it.mrnItemId ? '' : ' (unlisted)') },
          { header: 'Approx Qty', value: (r: R) => r.it.approxQty || null },
          { header: 'Actual Qty', value: (r: R) => r.it.actualQty },
          { header: 'Unit', value: (r: R) => r.it.unit },
          { header: 'Quality Status', value: (r: R) => qualityLabel(r.it.quality) },
          { header: 'Item Remarks', value: (r: R) => r.it.qualityRemarks },
          { header: 'Invoice No', value: (r: R) => r.g.invoiceNo },
          { header: 'Purchase Lot', value: (r: R) => r.g.purchaseEntry?.lotNo ?? null },
          { header: 'Received By', value: (r: R) => r.g.receivedByName },
          { header: 'Status', value: (r: R) => STATUS_LABEL[r.g.status] },
          { header: 'Reviewed By', value: (r: R) => r.g.reviewedByName },
          { header: 'Reviewed On', value: (r: R) => r.g.reviewedAt },
          { header: 'Approved By', value: (r: R) => r.g.approvedByName },
          { header: 'Approved On', value: (r: R) => r.g.approvedAt },
          { header: 'Accounted', value: (r: R) => (r.g.accounted ? 'Yes' : 'No') },
          { header: 'Voucher No', value: (r: R) => r.g.voucherNo },
          { header: 'Accounted By', value: (r: R) => r.g.accountedByName },
          { header: 'Accounted On', value: (r: R) => r.g.accountedAt },
        ],
      },
    ]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'stores_grn', details: `Exported ${grns.length} GRNs` }));
    return bytes;
  }

  /** Approved GRNs and their accounting state (legacy acctExcelBtn / repAcctExcelBtn). */
  async exportAccountingXlsx(actor: Actor, query: ListQuery<GrnFilters>): Promise<Uint8Array> {
    const grns = await this.views(await collectAll((q) => this.data.repos.grns.list(q), { ...query, filters: { ...query.filters, status: 'approved' as const }, sort: query.sort ?? '-approvedAt' }));
    const bytes = writeXlsx([
      {
        name: 'Accounting Audit',
        rows: grns,
        columns: [
          { header: 'GRN No', value: (g: GrnView) => g.grnNo },
          { header: 'Invoice No', value: (g: GrnView) => g.invoiceNo },
          { header: 'Vendor', value: (g: GrnView) => g.vendorName },
          { header: 'Items', value: (g: GrnView) => itemsSummary(g.items) },
          { header: 'Item Count', value: (g: GrnView) => g.items.length },
          { header: 'Approved By', value: (g: GrnView) => g.approvedByName },
          { header: 'Approved On', value: (g: GrnView) => g.approvedAt },
          { header: 'Accounted', value: (g: GrnView) => (g.accounted ? 'Yes' : 'No') },
          { header: 'Voucher No', value: (g: GrnView) => g.voucherNo },
          { header: 'Accounted By', value: (g: GrnView) => g.accountedByName },
          { header: 'Accounted On', value: (g: GrnView) => g.accountedAt },
        ],
      },
    ]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'stores_grn', details: `Exported accounting status of ${grns.length} GRNs` }));
    return bytes;
  }
}

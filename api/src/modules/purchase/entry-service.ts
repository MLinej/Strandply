import {
  MATERIAL_BY_ID,
  MATERIALS,
  fyOf,
  type EntryFilters,
  type EntryStats,
  type NoteFilters,
  type NoteKind,
  type NoteRow,
  type NoteStats,
  type NoteStatus,
  type PurchaseEntry,
  type PurchaseEntryView,
} from '../../contracts/purchase';
import type { CompanyBlock } from '../../contracts/sampletrack';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { conflict, HttpError, notFound, validationFailed } from '../../lib/errors';
import { writeXlsx, type Column, type SheetSpec } from '../../lib/spreadsheet';
import type { DataLayer, EntryPatch, ListQuery, Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { changedKeys, collectAll } from '../sampletrack/masters/common';
import type { CompanyService } from '../sampletrack/settings/company-service';
import { calcOf, entryViews, fyRange, isPosted, materialLabel } from './common';
import type { EntryCreate, EntryUpdate } from './validation';

const rupees = (p: number) => Math.round(p) / 100;
const label = (e: Pick<PurchaseEntry, 'material' | 'lotNo' | 'invoiceNo' | 'vendorName'>) => `${materialLabel(e.material)} ${e.lotNo} (${e.invoiceNo}, ${e.vendorName})`;

export interface EntryPrintPayload {
  company: CompanyBlock;
  entry: PurchaseEntryView;
  generatedAt: string;
}

export class PurchaseEntryService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly company: CompanyService,
    private readonly clock: Clock,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────

  async list(query: ListQuery<EntryFilters>) {
    const { rows, total } = await this.data.repos.purchaseEntries.list(query);
    return { rows: await entryViews(this.data, rows), total };
  }

  async get(id: string): Promise<PurchaseEntryView> {
    const e = await this.data.repos.purchaseEntries.getById(id);
    if (!e) throw notFound('Purchase entry');
    return (await entryViews(this.data, [e]))[0]!;
  }

  /** Register header tiles for every row matching the filters (posted entries only, unless asking for drafts). */
  async stats(query: ListQuery<EntryFilters>): Promise<EntryStats> {
    const rows = (await collectAll((q) => this.data.repos.purchaseEntries.list(q), query)).filter((r) => query.filters?.status === 'draft' || isPosted(r));
    let splTotal = 0;
    let payable = 0;
    let notes = 0;
    let notesPaise = 0;
    for (const r of rows) {
      const c = calcOf(r);
      splTotal += c.spl.total;
      payable += c.payable;
      for (const n of [c.qtyNote, c.rateNote]) {
        if (!n) continue;
        notes++;
        notesPaise += n.total;
      }
    }
    return {
      entries: rows.length,
      splQty: rows.reduce((s, r) => s + r.splQty, 0),
      splTotalPaise: splTotal,
      payablePaise: payable,
      avgRatePaise: rows.length ? Math.round(rows.reduce((s, r) => s + r.ratePaise, 0) / rows.length) : null,
      notes,
      notesPaise,
    };
  }

  /** Next lot number for a material in the date's FY: prefix + (highest number used + 1), e.g. N13 (legacy getNextLotNo). */
  async nextLot(material: keyof typeof MATERIAL_BY_ID, date: string, repos: Repos = this.data.repos): Promise<string> {
    const { from, to } = fyRange(fyOf(date));
    const used = await repos.purchaseEntries.lotNos(material, from, to);
    const max = used.reduce((m, lot) => Math.max(m, Number(/(\d+)\s*$/.exec(lot)?.[1] ?? 0)), 0);
    return `${MATERIAL_BY_ID[material].lotPrefix}${String(max + 1).padStart(2, '0')}`;
  }

  // ── Writing ────────────────────────────────────────────────────────

  private async checkRefs(tx: Repos, e: Pick<PurchaseEntry, 'material' | 'poId' | 'species' | 'veneerType'>) {
    const issues: { path: string; message: string }[] = [];
    if (e.poId) {
      const po = await tx.purchaseOrders.getById(e.poId);
      if (!po) issues.push({ path: 'poId', message: 'Unknown purchase order' });
      else if (po.material !== e.material) issues.push({ path: 'poId', message: `PO ${po.poNo} is for ${materialLabel(po.material)}` });
    }
    const def = MATERIAL_BY_ID[e.material];
    if (!def.hasSpecies && e.species) issues.push({ path: 'species', message: 'Only Nilgiri wood has a species' });
    if (!def.hasVeneerType && e.veneerType) issues.push({ path: 'veneerType', message: 'Only face veneer has a veneer type' });
    if (issues.length) throw validationFailed('Invalid input', issues);
  }

  /** 409 possible_duplicate when this vendor's invoice number is already entered (force=true saves anyway). */
  private async assertNoDuplicate(tx: Repos, vendorName: string, invoiceNo: string, exceptId?: string) {
    const dup = (await tx.purchaseEntries.findByInvoice(vendorName, invoiceNo)).filter((e) => e.id !== exceptId);
    if (!dup.length) return;
    throw new HttpError(409, 'possible_duplicate', `Invoice ${invoiceNo} from ${vendorName} is already entered (${materialLabel(dup[0]!.material)} ${dup[0]!.lotNo}). Save anyway with force=true.`, {
      similar: dup.map((d) => ({ id: d.id, material: d.material, lotNo: d.lotNo, date: d.date })),
    });
  }

  async create(actor: Actor, input: EntryCreate, { force = false } = {}): Promise<PurchaseEntryView> {
    const at = isoNow(this.clock);
    const entry = await this.data.uow.run(async (tx) => {
      const { post, ...fields } = input;
      await this.checkRefs(tx, { material: fields.material, poId: fields.poId ?? null, species: fields.species ?? null, veneerType: fields.veneerType ?? null });
      if (!force) await this.assertNoDuplicate(tx, fields.vendorName, fields.invoiceNo);
      const e = await tx.purchaseEntries.create({
        id: newId(),
        material: fields.material,
        date: fields.date,
        lotNo: fields.lotNo || (await this.nextLot(fields.material, fields.date, tx)),
        poId: fields.poId ?? null,
        vendorId: fields.vendorId ?? null,
        vendorName: fields.vendorName,
        vendorCode: fields.vendorCode ?? null,
        gstin: fields.gstin ?? null,
        pan: fields.pan ?? null,
        city: fields.city ?? null,
        state: fields.state ?? null,
        mobile: fields.mobile ?? null,
        invoiceNo: fields.invoiceNo,
        invoiceDate: fields.invoiceDate ?? null,
        taxType: fields.taxType,
        gstPct: fields.gstPct,
        vehicleNo: fields.vehicleNo ?? null,
        driver: fields.driver ?? null,
        transporter: fields.transporter ?? null,
        rstNo: fields.rstNo ?? null,
        mrnNo: fields.mrnNo ?? null,
        grnNo: fields.grnNo ?? null,
        remarks: fields.remarks ?? null,
        itemId: fields.itemId ?? null,
        itemName: fields.itemName ?? null,
        hsn: fields.hsn ?? null,
        species: fields.species ?? null,
        veneerType: fields.veneerType ?? null,
        altQtyPcs: fields.altQtyPcs ?? null,
        invQty: fields.invQty,
        splQty: fields.splQty,
        ratePaise: fields.ratePaise,
        rateDiffPaise: fields.rateDiffPaise,
        otherChargesPaise: fields.otherChargesPaise,
        status: post ? 'pending' : 'draft',
        approvedBy: null,
        approvedAt: null,
        qtyNoteStatus: 'Pending',
        rateNoteStatus: 'Pending',
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, {
        action: 'Create',
        entityType: 'purchase_entry',
        entityId: e.id,
        details: `${post ? 'Added' : 'Saved draft'} purchase entry ${label(e)}${force ? ', despite a duplicate invoice' : ''}`,
      });
      return e;
    });
    return (await entryViews(this.data, [entry]))[0]!;
  }

  /** Editing an approved entry sends it back for approval. `post: true` posts a draft. */
  async update(actor: Actor, id: string, input: EntryUpdate, { force = false } = {}): Promise<PurchaseEntryView> {
    const entry = await this.data.uow.run(async (tx) => {
      const before = await tx.purchaseEntries.getById(id);
      if (!before) throw notFound('Purchase entry');
      const { post, ...fields } = input;
      const merged = { ...before, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) } as PurchaseEntry;
      if (fields.lotNo === null) merged.lotNo = before.lotNo;
      await this.checkRefs(tx, merged);
      const changed = changedKeys(before, { ...fields, lotNo: merged.lotNo } as Partial<PurchaseEntry>);
      if ((changed.includes('invoiceNo') || changed.includes('vendorName')) && !force) await this.assertNoDuplicate(tx, merged.vendorName, merged.invoiceNo, id);
      const patch: EntryPatch = { ...Object.fromEntries(changed.map((k) => [k, merged[k]])), updatedAt: isoNow(this.clock) };
      let note = '';
      if (post && before.status === 'draft') {
        patch.status = 'pending';
        note = ' and posted it';
      } else if (changed.length && before.status === 'approved') {
        Object.assign(patch, { status: 'pending', approvedBy: null, approvedAt: null });
        note = '; needs approval again';
      }
      if (!changed.length && !patch.status) return before;
      const updated = (await tx.purchaseEntries.update(id, patch))!;
      await this.activity.record(tx, actor, {
        action: 'Edit',
        entityType: 'purchase_entry',
        entityId: id,
        details: `Updated purchase entry ${label(updated)}${changed.length ? `: ${changed.join(', ')}` : ''}${note}`,
      });
      return updated;
    });
    return (await entryViews(this.data, [entry]))[0]!;
  }

  async approve(actor: Actor, id: string): Promise<PurchaseEntryView> {
    const entry = await this.data.uow.run(async (tx) => {
      const e = await tx.purchaseEntries.getById(id);
      if (!e) throw notFound('Purchase entry');
      if (e.status === 'draft') throw conflict('not_posted', 'Post the draft before approving it');
      if (e.status === 'approved') throw conflict('already_approved', 'This entry is already approved');
      const at = isoNow(this.clock);
      const updated = (await tx.purchaseEntries.update(id, { status: 'approved', approvedBy: actor.id, approvedAt: at, updatedAt: at }))!;
      await this.activity.record(tx, actor, { action: 'Approve', entityType: 'purchase_entry', entityId: id, details: `Approved purchase entry ${label(e)}` });
      return updated;
    });
    return (await entryViews(this.data, [entry]))[0]!;
  }

  /** Attached documents and returns keep their reference; they show the entry as deleted. */
  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const e = await tx.purchaseEntries.getById(id);
      if (!e) throw notFound('Purchase entry');
      await tx.purchaseEntries.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'purchase_entry', entityId: id, details: `Deleted purchase entry ${label(e)}` });
    });
  }

  async printPayload(actor: Actor, id: string, kind: 'slip' | 'label'): Promise<EntryPrintPayload> {
    const entry = await this.get(id);
    if (kind === 'label' && entry.material !== 'nilgiri') throw validationFailed('Lot labels are for Nilgiri wood only');
    const company = await this.company.block();
    await this.data.uow.run((tx) =>
      this.activity.record(tx, actor, { action: 'Print', entityType: 'purchase_entry', entityId: id, details: `Printed ${kind === 'slip' ? 'receiving slip' : 'lot label'} for ${label(entry)}` }),
    );
    return { company, entry, generatedAt: isoNow(this.clock) };
  }

  // ── Debit / credit notes (legacy renderDNCNPage) ───────────────────

  async notes(query: { q?: string; filters?: Partial<NoteFilters> }): Promise<{ rows: NoteRow[]; stats: NoteStats }> {
    const f = query.filters ?? {};
    const base: ListQuery<EntryFilters> = { filters: { material: f.material, fy: f.fy } };
    const entries = (await collectAll((q) => this.data.repos.purchaseEntries.list(q), base)).filter(isPosted);
    const all: NoteRow[] = [];
    for (const e of entries) {
      const c = calcOf(e);
      const row = (kind: NoteKind): NoteRow | null => {
        const n = kind === 'qty' ? c.qtyNote : c.rateNote;
        if (!n) return null;
        return {
          id: `${e.id}:${kind}`,
          entryId: e.id,
          kind,
          type: n.type,
          material: e.material,
          date: e.date,
          lotNo: e.lotNo,
          vendorName: e.vendorName,
          invoiceNo: e.invoiceNo,
          invQty: e.invQty,
          splQty: e.splQty,
          qty: n.qty,
          ratePaise: e.ratePaise,
          rateDiffPaise: kind === 'rate' ? e.rateDiffPaise : null,
          note: { basic: n.basic, cgst: n.cgst, sgst: n.sgst, igst: n.igst, total: n.total },
          status: kind === 'qty' ? e.qtyNoteStatus : e.rateNoteStatus,
        };
      };
      for (const kind of ['qty', 'rate'] as const) {
        const r = row(kind);
        if (r) all.push(r);
      }
    }
    const sum = (rows: NoteRow[]) => ({ count: rows.length, paise: rows.reduce((s, r) => s + r.note.total, 0) });
    const debit = sum(all.filter((r) => r.kind === 'qty' && r.type === 'dn'));
    const credit = sum(all.filter((r) => r.kind === 'qty' && r.type === 'cn'));
    const stats: NoteStats = { debit, credit, rate: sum(all.filter((r) => r.kind === 'rate')), netPaise: debit.paise - credit.paise };
    const q = query.q?.trim().toLowerCase();
    const rows = all
      .filter((r) => !f.type || (f.type === 'rd' ? r.kind === 'rate' : r.kind === 'qty' && r.type === f.type))
      .filter((r) => !f.status || r.status === f.status)
      .filter((r) => !q || [r.vendorName, r.invoiceNo, r.lotNo].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || a.lotNo.localeCompare(b.lotNo));
    return { rows, stats };
  }

  async setNoteStatus(actor: Actor, entryId: string, kind: NoteKind, status: NoteStatus): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const e = await tx.purchaseEntries.getById(entryId);
      if (!e || !isPosted(e)) throw notFound('Note');
      const c = calcOf(e);
      if (!(kind === 'qty' ? c.qtyNote : c.rateNote)) throw notFound('Note');
      const field = kind === 'qty' ? 'qtyNoteStatus' : 'rateNoteStatus';
      if (e[field] === status) return;
      await tx.purchaseEntries.update(entryId, { [field]: status, updatedAt: isoNow(this.clock) });
      await this.activity.record(tx, actor, {
        action: 'StatusChange',
        entityType: 'purchase_note',
        entityId: `${entryId}:${kind}`,
        details: `${kind === 'qty' ? 'Quantity' : 'Rate'} note for ${label(e)}: ${e[field]} → ${status}`,
      });
    });
  }

  // ── Export (legacy exportExcel('all'): summary, a sheet per material, PO register) ──

  async exportXlsx(actor: Actor, query: ListQuery<EntryFilters>): Promise<Uint8Array> {
    const rows = await entryViews(this.data, (await collectAll((q) => this.data.repos.purchaseEntries.list(q), { ...query, sort: 'date' })).filter(isPosted));
    const cols: Column<PurchaseEntryView>[] = [
      { header: 'Date', value: (r) => r.date },
      { header: 'Lot', value: (r) => r.lotNo },
      { header: 'Status', value: (r) => r.status },
      { header: 'Vendor', value: (r) => r.vendorName },
      { header: 'Vendor Code', value: (r) => r.vendorCode },
      { header: 'GSTIN', value: (r) => r.gstin },
      { header: 'Invoice No', value: (r) => r.invoiceNo },
      { header: 'Invoice Date', value: (r) => r.invoiceDate },
      { header: 'Vehicle', value: (r) => r.vehicleNo },
      { header: 'RST', value: (r) => r.rstNo },
      { header: 'PO No', value: (r) => r.poNo },
      { header: 'MRN', value: (r) => r.mrnNo },
      { header: 'GRN', value: (r) => r.grnNo },
      { header: 'Tax', value: (r) => r.taxType },
      { header: 'Species / Type', value: (r) => r.species ?? r.veneerType },
      { header: 'Inv Qty', value: (r) => r.invQty },
      { header: 'SPL Qty', value: (r) => r.splQty },
      { header: 'Diff Qty', value: (r) => r.calc.diffQty },
      { header: 'Rate (₹)', value: (r) => rupees(r.ratePaise) },
      { header: 'Basic Inv (₹)', value: (r) => rupees(r.calc.invoice.basic) },
      { header: 'Total Inv (₹)', value: (r) => rupees(r.calc.invoice.total) },
      { header: 'Basic SPL (₹)', value: (r) => rupees(r.calc.spl.basic) },
      { header: 'Total SPL (₹)', value: (r) => rupees(r.calc.spl.total) },
      { header: 'Qty Note', value: (r) => (r.calc.qtyNote ? `${r.calc.qtyNote.type.toUpperCase()} ${rupees(r.calc.qtyNote.total)}` : null) },
      { header: 'Rate Note', value: (r) => (r.calc.rateNote ? `${r.calc.rateNote.type.toUpperCase()} ${rupees(r.calc.rateNote.total)}` : null) },
      { header: 'Payable (₹)', value: (r) => rupees(r.calc.payable) },
    ];
    const byMat = MATERIALS.map((m) => ({ m, rows: rows.filter((r) => r.material === m.id) })).filter((x) => x.rows.length);
    type Sum = { label: string; entries: number; qty: number; avgRate: number; basic: number; total: number };
    const summary: Sum[] = byMat.map(({ m, rows: rs }) => ({
      label: m.label,
      entries: rs.length,
      qty: rs.reduce((s, r) => s + r.splQty, 0),
      avgRate: rupees(rs.reduce((s, r) => s + r.ratePaise, 0) / rs.length),
      basic: rupees(rs.reduce((s, r) => s + r.calc.spl.basic, 0)),
      total: rupees(rs.reduce((s, r) => s + r.calc.spl.total, 0)),
    }));
    const pos = await this.data.repos.purchaseOrders.listAll();
    type Po = (typeof pos)[number];
    const sheets: SheetSpec<any>[] = [
      {
        name: 'Summary',
        rows: summary,
        columns: [
          { header: 'Material', value: (s: Sum) => s.label },
          { header: 'Entries', value: (s: Sum) => s.entries },
          { header: 'SPL Qty', value: (s: Sum) => s.qty },
          { header: 'Avg Rate (₹)', value: (s: Sum) => s.avgRate },
          { header: 'Basic SPL (₹)', value: (s: Sum) => s.basic },
          { header: 'Total SPL (₹)', value: (s: Sum) => s.total },
        ],
      },
      ...byMat.map(({ m, rows: rs }) => ({ name: m.label, rows: rs, columns: cols })),
    ];
    if (!query.filters?.material && pos.length) {
      const poCols: Column<Po>[] = [
        { header: 'PO No', value: (p) => p.poNo },
        { header: 'Date', value: (p) => p.date },
        { header: 'Material', value: (p) => materialLabel(p.material) },
        { header: 'Vendor', value: (p) => p.vendorName },
        { header: 'PO Qty', value: (p) => p.qty },
        { header: 'Rate (₹)', value: (p) => rupees(p.ratePaise) },
        { header: 'Status', value: (p) => p.status },
      ];
      sheets.push({ name: 'PO Register', rows: pos, columns: poCols });
    }
    const bytes = writeXlsx(sheets);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'purchase_entry', details: `Exported ${rows.length} purchase entries` }));
    return bytes;
  }
}

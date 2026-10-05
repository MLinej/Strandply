import { isOpenStatus, MAX_COMPLAINT_PHOTOS, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, type Complaint, type ComplaintFilters, type CpEvent, type CpFile, type CpRecipient, type CpStatus } from '../../contracts/complaints';
import { fyOf } from '../../contracts/purchase';
import type { BlobStore, StoredBlob } from '../../lib/blob-store';
import { isoNow, type Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { newId } from '../../lib/crypto';
import { conflict, notFound, validationFailed } from '../../lib/errors';
import { UniqueViolationError, type DataLayer, type ListQuery, type Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';

/* eslint-disable @typescript-eslint/no-explicit-any -- inputs are validated by zod at the route */
type Input = Record<string, any>;
export interface Upload {
  name: string;
  bytes: Uint8Array;
}

const bad = (path: string, message: string) => validationFailed('Invalid input', [{ path, message }]);
const LABEL: Record<string, string> = { date: 'date', salesman: 'salesman', customerName: 'customer', customerPhone: 'contact', customerLocation: 'location', invoiceNo: 'invoice', material: 'material', category: 'category', priority: 'priority', description: 'description', recipientName: 'recipient' };

/** Checks the first bytes, so a renamed file can't pass as a photo or video. */
function fileKind(f: Upload): { kind: CpFile['kind']; mime: string } | null {
  const b = f.bytes;
  const ext = /\.([a-z0-9]+)$/i.exec(f.name)?.[1]?.toLowerCase() ?? '';
  if (b[0] === 0xff && b[1] === 0xd8 && ['jpg', 'jpeg'].includes(ext)) return { kind: 'photo', mime: 'image/jpeg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && ext === 'png') return { kind: 'photo', mime: 'image/png' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && ext === 'webp') return { kind: 'photo', mime: 'image/webp' };
  // MP4 / MOV: "ftyp" at byte 4; WebM: EBML header.
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 && ['mp4', 'mov', 'm4v'].includes(ext)) return { kind: 'video', mime: ext === 'mov' ? 'video/quicktime' : 'video/mp4' };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 && ext === 'webm') return { kind: 'video', mime: 'video/webm' };
  return null;
}

/** Notification recipients, complaints, their photos and the case timeline (legacy Complaint Registration). */
export class ComplaintService {
  constructor(
    private readonly data: DataLayer,
    private readonly blobs: BlobStore,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  private today = () => businessToday(this.clock);
  private event = (actor: Actor, type: CpEvent['type'], text: string, at: string, files: CpFile[] = []): CpEvent => ({ id: newId(), type, text, by: actor.id, byName: actor.name, at, files });

  // ── Recipients ────────────────────────────────────────────────────

  async recipients(): Promise<CpRecipient[]> {
    return (await this.data.repos.cpRecipients.listAll()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveRecipient(actor: Actor, id: string | null, input: Input): Promise<CpRecipient> {
    return this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      const before = id ? await tx.cpRecipients.getById(id) : null;
      if (id && !before) throw notFound('Recipient');
      const fields = { name: input.name ?? before!.name, role: input.role === undefined ? (before?.role ?? null) : input.role, email: input.email === undefined ? (before?.email ?? null) : input.email, active: input.active ?? before?.active ?? true };
      const r = await (before ? tx.cpRecipients.update(before.id, { ...fields, updatedAt: at }) : tx.cpRecipients.create({ id: newId(), ...fields, createdBy: actor.id, createdAt: at, updatedAt: at })).catch((err) => {
        if (err instanceof UniqueViolationError) throw conflict('duplicate', `${fields.name} is already a recipient`);
        throw err;
      });
      await this.activity.record(tx, actor, { action: before ? 'Edit' : 'Create', entityType: 'complaint_recipient', entityId: r!.id, details: `Recipient ${r!.name}${r!.email ? ` <${r!.email}>` : ''}` });
      return r!;
    });
  }

  async removeRecipient(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const r = await tx.cpRecipients.getById(id);
      if (!r) throw notFound('Recipient');
      await tx.cpRecipients.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'complaint_recipient', entityId: id, details: `Removed recipient ${r.name}` });
    });
  }

  // ── Complaints ────────────────────────────────────────────────────

  list(query: ListQuery<Partial<ComplaintFilters>>) {
    return this.data.repos.complaints.list(query);
  }

  async get(id: string): Promise<Complaint> {
    const c = await this.data.repos.complaints.getById(id);
    if (!c) throw notFound('Complaint');
    return c;
  }

  /** Resolves the recipient (from the list, or a typed email), the Sales party and the invoice. */
  private async refs(tx: Repos, input: Input, before?: Complaint) {
    const out: Partial<Complaint> = {};
    if (input.recipientId !== undefined || input.recipientEmail !== undefined) {
      if (input.recipientId) {
        const r = await tx.cpRecipients.getById(input.recipientId);
        if (!r || !r.active) throw bad('recipientId', 'Pick an active recipient');
        Object.assign(out, { recipientName: r.name, recipientEmail: r.email });
      } else if (input.recipientEmail) Object.assign(out, { recipientName: 'Other recipient', recipientEmail: input.recipientEmail });
    }
    if (input.customerId !== undefined) {
      if (input.customerId && !(await tx.salesCustomers.getById(input.customerId))) throw bad('customerId', 'Unknown Sales party');
      out.customerId = input.customerId ?? null;
    }
    if (input.invoiceId !== undefined) {
      if (input.invoiceId) {
        const inv = await tx.salesInvoices.getById(input.invoiceId);
        if (!inv) throw bad('invoiceId', 'Unknown sales invoice');
        const party = input.customerId !== undefined ? input.customerId : before?.customerId;
        if (party && inv.billToId !== party && inv.shipToId !== party) throw bad('invoiceId', 'That invoice is for another party');
        Object.assign(out, { invoiceId: inv.id, invoiceNo: inv.invNo });
      } else Object.assign(out, { invoiceId: null, invoiceNo: null });
    }
    return out;
  }

  /** CMP/26-27/0001, numbered per FY of the complaint date (legacy used today's FY). */
  async create(actor: Actor, input: Input): Promise<Complaint> {
    return this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      const date = input.date ?? this.today();
      if (date > this.today()) throw bad('date', 'That date hasn’t come yet');
      const fy = fyOf(date);
      const complaintNo = `CMP/${fy.slice(2)}/${String(await tx.counters.next(`CP-${fy}`, at)).padStart(4, '0')}`;
      const refs = await this.refs(tx, { customerId: null, invoiceId: null, ...input });
      const c = await tx.complaints.create({
        id: newId(),
        complaintNo,
        date,
        salesman: input.salesman,
        customerId: null,
        customerName: input.customerName,
        customerPhone: input.customerPhone ?? null,
        customerLocation: input.customerLocation ?? null,
        invoiceId: null,
        invoiceNo: null,
        material: input.material,
        category: input.category,
        priority: input.priority,
        description: input.description,
        recipientName: '',
        recipientEmail: null,
        status: 'Open',
        resolvedOn: null,
        photos: [],
        ...refs,
        timeline: [],
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      } as Complaint);
      const created = (await tx.complaints.update(c.id, { timeline: [this.event(actor, 'created', `Complaint registered · notified ${c.recipientName}${c.recipientEmail ? ` (${c.recipientEmail})` : ''}`, at)], updatedAt: at }))!;
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'complaint', entityId: c.id, details: `${c.complaintNo} ${c.customerName}: ${c.category} (${c.priority})` });
      return created;
    });
  }

  /** Edits are logged on the timeline by what changed (legacy logged "Complaint details were edited."). */
  async update(actor: Actor, id: string, patch: Input): Promise<Complaint> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.complaints.getById(id);
      if (!before) throw notFound('Complaint');
      if (patch.date && patch.date > this.today()) throw bad('date', 'That date hasn’t come yet');
      const { recipientId: _r, recipientEmail: _e, customerId: _c, invoiceId: _i, ...plain } = patch;
      const next = { ...before, ...Object.fromEntries(Object.entries(plain).filter(([, v]) => v !== undefined)), ...(await this.refs(tx, patch, before)) } as Complaint;
      const changed = Object.keys(LABEL).filter((k) => (next as any)[k] !== (before as any)[k]);
      if (!changed.length && next.customerId === before.customerId) return before;
      const at = isoNow(this.clock);
      const { id: _id, createdBy: _cb, createdAt: _ca, deletedAt: _da, ...fields } = next;
      const c = (await tx.complaints.update(id, { ...fields, timeline: [...before.timeline, ...(changed.length ? [this.event(actor, 'edited', `Edited ${changed.map((k) => LABEL[k]).join(', ')}.`, at)] : [])], updatedAt: at }))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'complaint', entityId: id, details: `${c.complaintNo}: ${changed.map((k) => LABEL[k]).join(', ') || 'party link'}` });
      return c;
    });
  }

  /** Status with an optional note (legacy updateStatus); Resolved / Closed stamps the date, reopening clears it. */
  async setStatus(actor: Actor, id: string, status: CpStatus, note: string | null | undefined): Promise<Complaint> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.complaints.getById(id);
      if (!before) throw notFound('Complaint');
      if (before.status === status) throw conflict('same_status', `${before.complaintNo} is already ${status}`);
      const at = isoNow(this.clock);
      const resolvedOn = isOpenStatus(status) ? null : isOpenStatus(before.status) ? this.today() : before.resolvedOn;
      const text = `Status changed from ${before.status} to ${status}.${note ? ` ${note}` : ''}`;
      const c = (await tx.complaints.update(id, { status, resolvedOn, timeline: [...before.timeline, this.event(actor, 'status', text, at)], updatedAt: at }))!;
      await this.activity.record(tx, actor, { action: 'StatusChange', entityType: 'complaint', entityId: id, details: `${c.complaintNo}: ${before.status} → ${status}` });
      return c;
    });
  }

  private async store(complaintId: string, files: Upload[], allow: 'photo' | 'any'): Promise<CpFile[]> {
    const out: CpFile[] = [];
    for (const f of files) {
      const k = fileKind(f);
      if (!k || (allow === 'photo' && k.kind !== 'photo')) throw validationFailed(allow === 'photo' ? `${f.name}: attach a JPG, PNG or WebP photo` : `${f.name}: attach a photo (JPG, PNG, WebP) or a video (MP4, MOV, WebM)`);
      const max = k.kind === 'photo' ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
      if (f.bytes.length > max) throw validationFailed(`${f.name} is over ${max / 1024 / 1024} MB`);
      out.push({ id: newId(), kind: k.kind, name: f.name.replace(/[\\/]/g, '_').slice(0, 200), mime: k.mime, sizeBytes: f.bytes.length, blobKey: '' });
    }
    for (const [i, f] of out.entries()) {
      f.blobKey = `complaints/${complaintId}/${f.id}`;
      await this.blobs.put(f.blobKey, files[i]!.bytes, f.mime);
    }
    return out;
  }

  /** Photo evidence on the complaint, up to six (legacy). */
  async addPhotos(actor: Actor, id: string, files: Upload[]): Promise<Complaint> {
    const before = await this.get(id);
    if (!files.length) throw validationFailed('Attach at least one photo');
    if (before.photos.length + files.length > MAX_COMPLAINT_PHOTOS) throw validationFailed(`Up to ${MAX_COMPLAINT_PHOTOS} photos per complaint (${before.photos.length} attached)`);
    const stored = await this.store(id, files, 'photo');
    try {
      return await this.data.uow.run(async (tx) => {
        const cur = (await tx.complaints.getById(id))!;
        if (cur.photos.length + stored.length > MAX_COMPLAINT_PHOTOS) throw validationFailed(`Up to ${MAX_COMPLAINT_PHOTOS} photos per complaint`);
        const c = (await tx.complaints.update(id, { photos: [...cur.photos, ...stored], updatedAt: isoNow(this.clock) }))!;
        await this.activity.record(tx, actor, { action: 'Edit', entityType: 'complaint', entityId: id, details: `${c.complaintNo}: ${stored.length} photo(s) attached` });
        return c;
      });
    } catch (err) {
      for (const f of stored) await this.blobs.delete(f.blobKey);
      throw err;
    }
  }

  async removePhoto(actor: Actor, id: string, fileId: string): Promise<Complaint> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.complaints.getById(id);
      const f = before?.photos.find((p) => p.id === fileId);
      if (!before || !f) throw notFound('Photo');
      const c = (await tx.complaints.update(id, { photos: before.photos.filter((p) => p.id !== fileId), updatedAt: isoNow(this.clock) }))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'complaint', entityId: id, details: `${c.complaintNo}: removed photo ${f.name}` });
      return c;
    });
  }

  /** A comment with photos and videos on the case timeline (legacy postComment). */
  async comment(actor: Actor, id: string, text: string, files: Upload[]): Promise<Complaint> {
    await this.get(id);
    if (!text.trim() && !files.length) throw validationFailed('Add a comment, photo or video first');
    if (files.length > 10) throw validationFailed('Up to 10 files per comment');
    const stored = await this.store(id, files, 'any');
    try {
      return await this.data.uow.run(async (tx) => {
        const before = (await tx.complaints.getById(id))!;
        const at = isoNow(this.clock);
        const c = (await tx.complaints.update(id, { timeline: [...before.timeline, this.event(actor, 'comment', text.trim(), at, stored)], updatedAt: at }))!;
        await this.activity.record(tx, actor, { action: 'Edit', entityType: 'complaint', entityId: id, details: `${c.complaintNo} comment${stored.length ? ` (${stored.length} file(s))` : ''}: ${text.trim().slice(0, 160)}` });
        return c;
      });
    } catch (err) {
      for (const f of stored) await this.blobs.delete(f.blobKey);
      throw err;
    }
  }

  /** A photo or comment file. */
  async file(id: string, fileId: string): Promise<{ file: CpFile; blob: StoredBlob }> {
    const c = await this.get(id);
    const file = [...c.photos, ...c.timeline.flatMap((e) => e.files)].find((f) => f.id === fileId);
    const blob = file ? await this.blobs.get(file.blobKey) : null;
    if (!file || !blob) throw notFound('File');
    return { file, blob };
  }

  async remove(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const c = await tx.complaints.getById(id);
      if (!c) throw notFound('Complaint');
      await tx.complaints.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'complaint', entityId: id, details: `Deleted ${c.complaintNo} ${c.customerName}` });
    });
  }

  /** Open complaints for the sidebar badge. */
  async openCount() {
    return (await this.data.repos.complaints.listAll()).filter((c) => c.status === 'Open').length;
  }
}


// Purchase documents: invoices, weighment slips, GRN/MRN, photos (legacy Documents page and the entry
// form's attachments). Metadata in pu_documents, bytes in the BlobStore.
import type { DocumentFilters, DocumentType, PurchaseDocument, PurchaseDocumentView } from '../../contracts/purchase';
import type { BlobStore, StoredBlob } from '../../lib/blob-store';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { notFound, validationFailed } from '../../lib/errors';
import type { DataLayer, ListQuery } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { materialLabel } from './common';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

/** Checks the first bytes match the extension, so a renamed file can't pass as a PDF or image. */
function sniff(bytes: Uint8Array, mime: string): boolean {
  const b = (i: number) => bytes[i];
  if (mime === 'application/pdf') return b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46;
  if (mime === 'image/png') return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47;
  if (mime === 'image/jpeg') return b(0) === 0xff && b(1) === 0xd8;
  return false;
}

export class PurchaseDocumentService {
  constructor(
    private readonly data: DataLayer,
    private readonly blobs: BlobStore,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  private async views(rows: PurchaseDocument[]): Promise<PurchaseDocumentView[]> {
    const entryIds = [...new Set(rows.map((r) => r.entryId).filter((x): x is string => !!x))];
    const entries = await Promise.all(entryIds.map((id) => this.data.repos.purchaseEntries.getById(id)));
    const people = await this.data.repos.users.getByIds([...new Set(rows.map((r) => r.createdBy).filter((x): x is string => !!x))]);
    const entryLabel = new Map(entries.filter((e) => !!e).map((e) => [e.id, `${materialLabel(e.material)} ${e.lotNo} · ${e.invoiceNo}`]));
    return rows.map((r) => ({
      ...r,
      entryLabel: r.entryId ? (entryLabel.get(r.entryId) ?? 'Deleted entry') : null,
      uploadedByName: r.createdBy ? (people.find((u) => u.id === r.createdBy)?.name ?? null) : null,
    }));
  }

  async list(query: ListQuery<DocumentFilters>) {
    const { rows, total } = await this.data.repos.purchaseDocuments.list(query);
    return { rows: await this.views(rows), total, byType: await this.data.repos.purchaseDocuments.countByType() };
  }

  async upload(actor: Actor, file: { name: string; bytes: Uint8Array }, meta: { type: DocumentType; entryId: string | null }): Promise<PurchaseDocumentView> {
    const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
    const mime = MIME_BY_EXT[ext];
    if (!mime) throw validationFailed('Upload a PDF, JPG or PNG file');
    if (file.bytes.length === 0) throw validationFailed('The file is empty');
    if (file.bytes.length > MAX_DOCUMENT_BYTES) throw validationFailed('Files can be up to 10 MB');
    if (!sniff(file.bytes, mime)) throw validationFailed(`The file’s contents don’t match .${ext}`);
    if (meta.entryId && !(await this.data.repos.purchaseEntries.getById(meta.entryId))) {
      throw validationFailed('Invalid input', [{ path: 'entryId', message: 'Unknown purchase entry' }]);
    }
    const id = newId();
    const blobKey = `purchase/${id}`;
    await this.blobs.put(blobKey, file.bytes, mime);
    const at = isoNow(this.clock);
    try {
      const doc = await this.data.uow.run(async (tx) => {
        const d = await tx.purchaseDocuments.create({
          id,
          name: file.name.replace(/[\\/]/g, '_').slice(0, 200),
          type: meta.type,
          mime,
          sizeBytes: file.bytes.length,
          blobKey,
          entryId: meta.entryId,
          createdBy: actor.id,
          createdAt: at,
          updatedAt: at,
        });
        await this.activity.record(tx, actor, { action: 'Create', entityType: 'purchase_document', entityId: id, details: `Uploaded ${meta.type} ${d.name}` });
        return d;
      });
      return (await this.views([doc]))[0]!;
    } catch (err) {
      await this.blobs.delete(blobKey); // don't leave an orphaned file behind
      throw err;
    }
  }

  async file(id: string): Promise<{ doc: PurchaseDocument; blob: StoredBlob }> {
    const doc = await this.data.repos.purchaseDocuments.getById(id);
    const blob = doc ? await this.blobs.get(doc.blobKey) : null;
    if (!doc || !blob) throw notFound('Document');
    return { doc, blob };
  }

  /** Soft-deletes the record. The bytes stay until a retention job removes them (TODO(r2)). */
  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const d = await tx.purchaseDocuments.getById(id);
      if (!d) throw notFound('Document');
      await tx.purchaseDocuments.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'purchase_document', entityId: id, details: `Deleted document ${d.name}` });
    });
  }
}

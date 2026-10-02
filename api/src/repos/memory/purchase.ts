import { fyEnd, fyStart, type DocumentFilters, type EntryFilters, type OpeningStock, type PurchaseDocument, type PurchaseEntry, type PurchaseOrder, type PurchaseReturn, type PurchaseType, type TypeKind } from '../../contracts/purchase';
import { normName } from '../../lib/text';
import type { NewRow } from '../masters';
import type { ConsumptionRepo, OpeningStockRepo, PurchaseDocumentRepo, PurchaseEntryRepo, PurchaseOrderRepo, PurchaseReturnRepo, PurchaseTypeRepo } from '../purchase';
import { UniqueViolationError, type ListQuery } from '../types';
import { SoftTable } from './crud';
import { listRows } from './list';
import type { MemoryStore } from './store';

const inFy = (date: string, fy: unknown) => date >= fyStart(String(fy)) && date <= fyEnd(String(fy));
const byDate = <T extends { date: string }>(a: T, b: T) => a.date.localeCompare(b.date);
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '');

export class MemoryPurchaseTypeRepo extends SoftTable<PurchaseType> implements PurchaseTypeRepo {
  constructor(store: MemoryStore) {
    super(store, 'puTypes', 'purchase_types');
  }

  async listAll(kind?: TypeKind) {
    return structuredClone(
      this.live()
        .filter((t) => !kind || t.kind === kind)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    );
  }

  override async create(row: NewRow<PurchaseType>) {
    if (this.live().some((t) => t.kind === row.kind && normName(t.name) === normName(row.name))) throw new UniqueViolationError('purchase_types', 'name');
    return super.create(row);
  }
}

export class MemoryPurchaseEntryRepo extends SoftTable<PurchaseEntry> implements PurchaseEntryRepo {
  constructor(store: MemoryStore) {
    super(store, 'puEntries', 'purchase_entries');
  }

  async list(query: ListQuery<EntryFilters>) {
    return listRows(this.live(), query, {
      searchFields: ['vendorName', 'invoiceNo', 'lotNo', 'vehicleNo', 'rstNo', 'mrnNo', 'grnNo', 'species', 'veneerType'],
      sortable: ['date', 'lotNo', 'invoiceNo', 'vendorName', 'splQty', 'createdAt'],
      defaultSort: '-date',
      customFilters: {
        fy: (r, v) => inFy(r.date, v),
        month: (r, v) => r.date.startsWith(String(v)),
        posted: (r, v) => (v ? r.status !== 'draft' : r.status === 'draft'),
      },
    });
  }

  async listBetween(from: string, to: string) {
    return structuredClone(this.live().filter((r) => r.date >= from && r.date <= to).sort(byDate));
  }

  async listByPo(poId: string) {
    return structuredClone(this.live().filter((r) => r.poId === poId));
  }

  async findByInvoice(vendorName: string, invoiceNo: string) {
    return structuredClone(this.live().filter((r) => normName(r.vendorName) === normName(vendorName) && squash(r.invoiceNo) === squash(invoiceNo)));
  }

  async lotNos(material: string, from: string, to: string) {
    return this.live()
      .filter((r) => r.material === material && r.date >= from && r.date <= to)
      .map((r) => r.lotNo);
  }
}

export class MemoryPurchaseOrderRepo extends SoftTable<PurchaseOrder> implements PurchaseOrderRepo {
  constructor(store: MemoryStore) {
    super(store, 'puOrders', 'purchase_orders', ['poNo']);
  }

  async getByPoNo(poNo: string) {
    const n = normName(poNo);
    const p = this.live().find((x) => normName(x.poNo) === n);
    return p ? structuredClone(p) : null;
  }

  async listAll(filters: { material?: string } = {}) {
    return structuredClone(
      this.live()
        .filter((p) => !filters.material || p.material === filters.material)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    );
  }
}

export class MemoryPurchaseReturnRepo extends SoftTable<PurchaseReturn> implements PurchaseReturnRepo {
  constructor(store: MemoryStore) {
    super(store, 'puReturns', 'purchase_returns');
  }

  async list(query: ListQuery<{ material: string; status: string; fy: string }>) {
    return listRows(this.live(), query, {
      searchFields: ['returnNo', 'vendorName', 'originalInvoiceNo', 'reason'],
      sortable: ['date', 'returnNo', 'createdAt'],
      defaultSort: '-date',
      customFilters: { fy: (r, v) => inFy(r.date, v) },
    });
  }

  async listBetween(from: string, to: string) {
    return structuredClone(this.live().filter((r) => r.date >= from && r.date <= to).sort(byDate));
  }
}

export class MemoryOpeningStockRepo implements OpeningStockRepo {
  constructor(private readonly store: MemoryStore) {}

  async get(fy: string) {
    const r = this.store.tables.puOpening.get(fy);
    return r && r.deletedAt === null ? structuredClone(r) : null;
  }

  async put(row: Omit<OpeningStock, 'deletedAt'>) {
    const prev = this.store.tables.puOpening.get(row.fy);
    const full: OpeningStock = { ...structuredClone(row), createdAt: prev?.createdAt ?? row.createdAt, createdBy: prev?.createdBy ?? row.createdBy, deletedAt: null };
    this.store.tables.puOpening.set(row.fy, full);
    this.store.changed();
    return structuredClone(full);
  }
}

export class MemoryConsumptionRepo implements ConsumptionRepo {
  constructor(private readonly store: MemoryStore) {}

  async forFy(fy: string) {
    const out: Record<string, number> = {};
    for (const r of this.store.tables.puConsumption.values()) if (r.fy === fy) out[r.key] = r.qty;
    return out;
  }

  async set(fy: string, key: string, qty: number, by: string | null, at: string) {
    const id = `${fy}|${key}`;
    const prev = this.store.tables.puConsumption.get(id);
    this.store.tables.puConsumption.set(id, { fy, key, qty, createdBy: prev?.createdBy ?? by, createdAt: prev?.createdAt ?? at, updatedAt: at, deletedAt: null });
    this.store.changed();
  }
}

export class MemoryPurchaseDocumentRepo extends SoftTable<PurchaseDocument> implements PurchaseDocumentRepo {
  constructor(store: MemoryStore) {
    super(store, 'puDocuments', 'purchase_documents');
  }

  async list(query: ListQuery<DocumentFilters>) {
    return listRows(this.live(), query, { searchFields: ['name'], sortable: ['createdAt', 'name', 'type'], defaultSort: '-createdAt' });
  }

  async countByEntry(entryIds: string[]) {
    const want = new Set(entryIds);
    const out = new Map<string, number>();
    for (const d of this.live()) if (d.entryId && want.has(d.entryId)) out.set(d.entryId, (out.get(d.entryId) ?? 0) + 1);
    return out;
  }

  async countByType() {
    const out: Record<string, number> = {};
    for (const d of this.live()) out[d.type] = (out[d.type] ?? 0) + 1;
    return out;
  }
}

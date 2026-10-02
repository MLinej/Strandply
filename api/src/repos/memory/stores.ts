import { fyEnd, fyStart } from '../../contracts/purchase';
import type { Grn, GrnFilters, Mrn, MrnFilters } from '../../contracts/stores';
import { normName } from '../../lib/text';
import type { GrnRepo, MrnRepo } from '../stores';
import type { ListQuery } from '../types';
import { SoftTable } from './crud';
import { listRows } from './list';
import type { MemoryStore } from './store';

const inFy = (date: string, fy: unknown) => date >= fyStart(String(fy)) && date <= fyEnd(String(fy));

export class MemoryMrnRepo extends SoftTable<Mrn> implements MrnRepo {
  constructor(store: MemoryStore) {
    super(store, 'stoMrns', 'store_mrns', ['mrnNo']);
  }

  async getByMrnNo(mrnNo: string) {
    const n = normName(mrnNo);
    const r = this.live().find((x) => normName(x.mrnNo) === n);
    return r ? structuredClone(r) : null;
  }

  async list(query: ListQuery<MrnFilters>) {
    return listRows(this.live(), query, {
      searchFields: ['mrnNo', 'vendorName', 'vehicleNo', 'invoiceNo'],
      sortable: ['createdAt', 'date', 'mrnNo', 'vendorName'],
      defaultSort: '-createdAt',
      customFilters: {
        material: (r, v) => r.items.some((i) => i.material === v),
        from: (r, v) => r.date >= String(v),
        to: (r, v) => r.date <= String(v),
        fy: (r, v) => inFy(r.date, v),
      },
    });
  }

  async listPending() {
    return structuredClone(
      this.live()
        .filter((r) => r.status === 'pending_grn')
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    );
  }

  async countByDate(date: string) {
    return this.live().filter((r) => r.date === date).length;
  }
}

export class MemoryGrnRepo extends SoftTable<Grn> implements GrnRepo {
  constructor(store: MemoryStore) {
    super(store, 'stoGrns', 'store_grns', ['grnNo']);
  }

  async getByGrnNo(grnNo: string) {
    const n = normName(grnNo);
    const r = this.live().find((x) => normName(x.grnNo) === n);
    return r ? structuredClone(r) : null;
  }

  async getByMrn(mrnId: string) {
    const r = this.live().find((x) => x.mrnId === mrnId);
    return r ? structuredClone(r) : null;
  }

  async list(query: ListQuery<GrnFilters>) {
    return listRows(this.live(), query, {
      searchFields: ['grnNo', 'mrnNo', 'vendorName', 'invoiceNo'],
      sortable: ['createdAt', 'date', 'grnNo', 'approvedAt'],
      defaultSort: '-createdAt',
      customFilters: {
        fy: (r, v) => inFy(r.date, v),
        accounted: (r, v) => r.accounted === v,
      },
    });
  }

  async countByDate(date: string) {
    return this.live().filter((r) => r.date === date).length;
  }

  async countByStatus() {
    const out = { draft: 0, reviewed: 0, approved: 0, unaccounted: 0 };
    for (const r of this.live()) {
      out[r.status]++;
      if (r.status === 'approved' && !r.accounted) out.unaccounted++;
    }
    return out;
  }
}

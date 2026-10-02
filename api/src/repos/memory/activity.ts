import type { ActivityEntry, ActivityFilters, ActivityRepo } from '../activity';
import type { ListQuery } from '../types';
import { listRows } from './list';
import type { MemoryStore } from './store';

export class MemoryActivityRepo implements ActivityRepo {
  constructor(private readonly store: MemoryStore) {}

  private get rows() {
    return this.store.tables.activity;
  }

  async append(entry: ActivityEntry) {
    this.rows.set(entry.id, structuredClone(entry));
    this.store.changed();
    return structuredClone(entry);
  }

  async list(query: ListQuery<ActivityFilters>) {
    return listRows(this.rows.values(), query, {
      searchFields: ['details', 'userName'],
      sortable: ['createdAt', 'action', 'userName'],
      defaultSort: '-createdAt',
      customFilters: {
        // ISO strings compare correctly as text. A bare YYYY-MM-DD means midnight UTC.
        from: (r, v) => r.createdAt >= String(v),
        to: (r, v) => r.createdAt < String(v),
      },
    });
  }

  async purgeBefore(cutoffIso: string) {
    let n = 0;
    for (const [id, e] of this.rows) {
      if (e.createdAt < cutoffIso) {
        this.rows.delete(id);
        n++;
      }
    }
    if (n) this.store.changed();
    return n;
  }
}

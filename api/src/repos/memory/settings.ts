import type { SettingsRepo } from '../settings';
import type { MemoryStore } from './store';

export class MemorySettingsRepo implements SettingsRepo {
  constructor(private readonly store: MemoryStore) {}

  async getMany(keys: string[]) {
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      const row = this.store.tables.settings.get(k);
      if (row && row.deletedAt === null) out[k] = structuredClone(row.value);
    }
    return out;
  }

  async set(key: string, value: unknown, by: string | null, at: string) {
    const existing = this.store.tables.settings.get(key);
    const row = {
      key,
      value: structuredClone(value),
      createdBy: existing?.createdBy ?? by,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
      deletedAt: null,
    };
    this.store.tables.settings.set(key, row);
    this.store.changed();
    return structuredClone(row);
  }
}

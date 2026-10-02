import { UniqueViolationError } from '../types';
import { normName } from '../../lib/text';
import type { MemoryStore, TableName } from './store';

type SoftRow = { id: string; deletedAt: string | null; updatedAt: string };

/** Shared get/create/update/softDelete for the soft-deleted tables keyed by `id`. */
export class SoftTable<T extends SoftRow> {
  constructor(
    protected readonly store: MemoryStore,
    private readonly table: TableName,
    private readonly entity: string,
    /** Fields that must be unique (case-insensitive) among live rows. */
    private readonly uniqueFields: (keyof T & string)[] = [],
  ) {}

  protected get rows(): Map<string, T> {
    return this.store.tables[this.table] as unknown as Map<string, T>;
  }

  protected live(): T[] {
    return [...this.rows.values()].filter((r) => r.deletedAt === null);
  }

  private assertUnique(row: Partial<T>, exceptId?: string) {
    for (const f of this.uniqueFields) {
      const v = row[f];
      if (typeof v !== 'string') continue;
      const n = normName(v);
      if (this.live().some((r) => r.id !== exceptId && typeof r[f] === 'string' && normName(r[f] as string) === n)) {
        throw new UniqueViolationError(this.entity, f);
      }
    }
  }

  async getById(id: string): Promise<T | null> {
    const r = this.rows.get(id);
    return r && r.deletedAt === null ? structuredClone(r) : null;
  }

  async create(row: Omit<T, 'deletedAt'>): Promise<T> {
    if (this.rows.has(row.id)) throw new UniqueViolationError(this.entity, 'id');
    this.assertUnique(row as Partial<T>);
    const full = { ...structuredClone(row), deletedAt: null } as T;
    this.rows.set(full.id, full);
    this.store.changed();
    return structuredClone(full);
  }

  async update(id: string, patch: Partial<T> & { updatedAt: string }): Promise<T | null> {
    const current = this.rows.get(id);
    if (!current || current.deletedAt !== null) return null;
    this.assertUnique(patch, id);
    const next = { ...current };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (next as Record<string, unknown>)[k] = v;
    this.rows.set(id, next);
    this.store.changed();
    return structuredClone(next);
  }

  async softDelete(id: string, at: string): Promise<boolean> {
    const current = this.rows.get(id);
    if (!current || current.deletedAt !== null) return false;
    this.rows.set(id, { ...current, deletedAt: at, updatedAt: at });
    this.store.changed();
    return true;
  }
}

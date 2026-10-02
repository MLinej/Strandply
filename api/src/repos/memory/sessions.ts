import { UniqueViolationError } from '../types';
import type { Session, SessionRepo } from '../sessions';
import type { MemoryStore } from './store';

export class MemorySessionRepo implements SessionRepo {
  constructor(private readonly store: MemoryStore) {}

  private get rows() {
    return this.store.tables.sessions;
  }

  async create(session: Session) {
    if ([...this.rows.values()].some((s) => s.tokenHash === session.tokenHash)) {
      throw new UniqueViolationError('sessions', 'tokenHash');
    }
    this.rows.set(session.id, structuredClone(session));
    this.store.changed();
    return structuredClone(session);
  }

  async getByTokenHash(tokenHash: string) {
    const s = [...this.rows.values()].find((x) => x.tokenHash === tokenHash);
    return s ? structuredClone(s) : null;
  }

  async touch(id: string, lastSeenAt: string) {
    const s = this.rows.get(id);
    if (!s) return;
    this.rows.set(id, { ...s, lastSeenAt });
    this.store.changed();
  }

  async delete(id: string) {
    if (this.rows.delete(id)) this.store.changed();
  }

  async deleteByUser(userId: string) {
    let n = 0;
    for (const [id, s] of this.rows) {
      if (s.userId === userId) {
        this.rows.delete(id);
        n++;
      }
    }
    if (n) this.store.changed();
    return n;
  }
}

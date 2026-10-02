/** Table `sessions` (db/migrations/0004_access_control.sql). Short-lived, so rows are hard-deleted. */
export interface Session {
  id: string;
  userId: string;
  /** sha256 of the cookie token. The token itself is never stored. */
  tokenHash: string;
  createdAt: string;
  lastSeenAt: string;
  /** Absolute expiry. Idle expiry is lastSeenAt + idle window, checked by the auth service. */
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
}

export interface SessionRepo {
  create(session: Session): Promise<Session>;
  getByTokenHash(tokenHash: string): Promise<Session | null>;
  touch(id: string, lastSeenAt: string): Promise<void>;
  delete(id: string): Promise<void>;
  /** Returns how many sessions were removed. */
  deleteByUser(userId: string): Promise<number>;
}

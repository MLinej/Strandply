import type { AppConfig } from '../config';
import { HttpError } from '../lib/errors';
import { isoNow, type Clock } from '../lib/clock';
import { newId, newSessionToken, sha256Hex } from '../lib/crypto';
import type { DataLayer, Session, User } from '../repos';
import type { ActivityService } from '../modules/sampletrack/activity-service';
import { actorOf } from '../modules/sampletrack/actor';
import { hashPassword, verifyPassword } from './password';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface ResolvedSession {
  session: Session;
  user: User;
}

/** Only refresh lastSeenAt once a minute, to save writes. */
const TOUCH_EVERY_MS = 60_000;

const invalidCredentials = () => new HttpError(401, 'invalid_credentials', 'Invalid username or password');

/**
 * ERP-wide sign-in and server-side sessions (PLAN.md §4).
 * The browser holds an opaque token in an httpOnly cookie, and only its sha256 is stored.
 */
export class AuthService {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async login(username: string, password: string, meta: RequestMeta): Promise<{ token: string; user: User; session: Session }> {
    const user = await this.data.repos.users.getByUsername(username);

    if (!user || !user.passwordHash) {
      // Spend the same time as a real check, so response timing doesn't reveal which usernames exist.
      await verifyPassword(password, await this.getDummyHash());
      await this.logFailure(null, `Failed login for unknown username "${username}"`);
      throw invalidCredentials();
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      await this.logFailure(user, `Failed login for ${user.username}: wrong password`);
      throw invalidCredentials();
    }
    if (user.status !== 'Active') {
      await this.logFailure(user, `Blocked login for ${user.username}: account inactive`);
      throw new HttpError(403, 'account_inactive', 'This account is inactive. Contact your administrator.');
    }

    const token = newSessionToken();
    const now = this.clock();
    const at = now.toISOString();
    const session: Session = {
      id: newId(),
      userId: user.id,
      tokenHash: await sha256Hex(token),
      createdAt: at,
      lastSeenAt: at,
      expiresAt: new Date(now.getTime() + this.config.sessionMaxDays * 86_400_000).toISOString(),
      ip: meta.ip,
      userAgent: meta.userAgent,
    };
    await this.data.uow.run(async (tx) => {
      await tx.sessions.create(session);
      await this.activity.record(tx, actorOf(user), {
        action: 'Login',
        entityType: 'user',
        entityId: user.id,
        details: `${user.name} signed in`,
      });
    });
    return { token, user, session };
  }

  async logout(resolved: ResolvedSession): Promise<void> {
    await this.data.uow.run(async (tx) => {
      await tx.sessions.delete(resolved.session.id);
      await this.activity.record(tx, actorOf(resolved.user), {
        action: 'Logout',
        entityType: 'user',
        entityId: resolved.user.id,
        details: `${resolved.user.name} signed out`,
      });
    });
  }

  /**
   * Returns the session for a cookie token, or null. A session dies once it is past its absolute
   * expiry, has been idle too long, or its user is deleted or inactive. Checked on every request,
   * so deactivating a user takes effect at once.
   */
  async resolve(token: string): Promise<ResolvedSession | null> {
    const { sessions, users } = this.data.repos;
    const session = await sessions.getByTokenHash(await sha256Hex(token));
    if (!session) return null;

    const now = this.clock().getTime();
    const idleDeadline = Date.parse(session.lastSeenAt) + this.config.sessionIdleHours * 3_600_000;
    if (now >= Date.parse(session.expiresAt) || now >= idleDeadline) {
      await sessions.delete(session.id);
      return null;
    }

    const user = await users.getById(session.userId);
    if (!user || user.status !== 'Active') {
      await sessions.delete(session.id);
      return null;
    }

    if (now - Date.parse(session.lastSeenAt) >= TOUCH_EVERY_MS) {
      const lastSeenAt = isoNow(this.clock);
      await sessions.touch(session.id, lastSeenAt);
      session.lastSeenAt = lastSeenAt;
    }
    return { session, user };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword('dummy-password-for-timing', this.config.argon2);
    return this.dummyHash;
  }

  private logFailure(user: User | null, details: string) {
    return this.data.uow.run((tx) =>
      this.activity.record(tx, user ? actorOf(user) : null, {
        action: 'LoginFailed',
        entityType: 'user',
        entityId: user?.id,
        details,
      }),
    );
  }
}

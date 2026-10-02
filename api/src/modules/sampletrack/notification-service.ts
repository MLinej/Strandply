import type { Badges, Notification, NotificationFeedFilters, NotificationType } from '../../contracts/sampletrack';
import type { PermissionSet } from '../../domain/access';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import type { DataLayer, ListQuery, Repos } from '../../repos';
import type { Actor } from './actor';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  message: string;
  entityType?: 'request' | 'dispatch';
  entityId?: string;
  /** Omit to notify everyone who can open Notifications. */
  targetUserId?: string;
}

/**
 * System notifications, with read and cleared state kept per user.
 * Only users with the Notifications page can read them (enforced on the routes).
 * The client polls the badge count every 30 s.
 */
export class NotificationService {
  constructor(
    private readonly data: DataLayer,
    private readonly clock: Clock,
  ) {}

  /**
   * Written through `tx`, so it commits or rolls back with the change that caused it. The user
   * whose action caused it gets it already marked read: it shouldn't light up their own badge.
   */
  async notify(tx: Repos, actor: Actor | null, input: NotifyInput): Promise<Notification> {
    const at = isoNow(this.clock);
    const n = await tx.notifications.create({
      id: newId(),
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      targetUserId: input.targetUserId ?? null,
      createdBy: actor?.id ?? null,
      createdAt: at,
      updatedAt: at,
    });
    if (actor) await tx.notifications.markRead(actor.id, [n.id], at);
    return n;
  }

  feed(userId: string, query: ListQuery<NotificationFeedFilters>) {
    return this.data.repos.notifications.listForUser(userId, query);
  }

  async unreadCount(userId: string) {
    return { count: await this.data.repos.notifications.unreadCount(userId) };
  }

  async markRead(userId: string, ids: string[]) {
    return { updated: await this.data.repos.notifications.markRead(userId, ids, isoNow(this.clock)) };
  }

  /** `upTo` = the newest createdAt the user has seen, so something that arrives meanwhile stays unread. */
  async markAllRead(userId: string, upTo?: string) {
    return { updated: await this.data.repos.notifications.markAllRead(userId, isoNow(this.clock), upTo) };
  }

  /** Clears (hides) for this user only: the given ids, or everything up to `upTo` (default: all). */
  async clear(userId: string, opts: { ids?: string[]; upTo?: string }) {
    return { cleared: await this.data.repos.notifications.dismiss(userId, isoNow(this.clock), opts) };
  }

  /** Sidebar badges, each only if the user may see that page. */
  async badges(userId: string, perms: PermissionSet): Promise<Badges> {
    const out: Badges = {};
    if (perms.pages.includes('notifications')) out.unreadNotifications = await this.data.repos.notifications.unreadCount(userId);
    if (perms.pages.includes('requests')) out.pendingRequests = (await this.data.repos.requests.countByStatus({})).Pending;
    if (perms.pages.includes('vendors')) out.pendingVendors = (await this.data.repos.vendors.countByStatus()).pending;
    if (perms.pages.includes('stores_grn')) out.pendingGrn = (await this.data.repos.mrns.listPending()).length;
    return out;
  }
}

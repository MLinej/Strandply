import { ROLE_LABELS } from '../../domain/access';
import { forbidden, validationFailed } from '../../lib/errors';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import type { ActivityAction, ActivityEntry, ActivityFilters, DataLayer, ListQuery, Repos } from '../../repos';
import type { Actor } from './actor';

export interface ActivityInput {
  action: ActivityAction;
  details: string;
  entityType?: string;
  entityId?: string;
}

export const PURGE_MIN_DAYS = 1;

export class ActivityService {
  constructor(
    private readonly data: DataLayer,
    private readonly clock: Clock,
  ) {}

  /** Appends through `tx`, so the entry commits or rolls back with the change it describes. */
  record(tx: Repos, actor: Actor | null, input: ActivityInput): Promise<ActivityEntry> {
    return tx.activity.append({
      id: newId(),
      userId: actor?.id ?? null,
      userName: actor?.name ?? null,
      userRole: actor ? ROLE_LABELS[actor.role] : null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      details: input.details,
      createdAt: isoNow(this.clock),
    });
  }

  list(query: ListQuery<ActivityFilters>) {
    return this.data.repos.activity.list(query);
  }

  /** Superadmin only. Deletes entries older than `olderThanDays` days, then logs the purge itself. */
  async purge(actor: Actor, olderThanDays: number): Promise<{ purged: number; cutoff: string }> {
    if (actor.role !== 'superadmin') throw forbidden('superadmin_only', 'Only a Super Admin can purge the activity log');
    if (!Number.isInteger(olderThanDays) || olderThanDays < PURGE_MIN_DAYS) {
      throw validationFailed(`olderThanDays must be a whole number ≥ ${PURGE_MIN_DAYS}`);
    }
    const cutoff = new Date(this.clock().getTime() - olderThanDays * 86_400_000).toISOString();
    return this.data.uow.run(async (tx) => {
      const purged = await tx.activity.purgeBefore(cutoff);
      await this.record(tx, actor, {
        action: 'Purge',
        entityType: 'activity_log',
        details: `Purged ${purged} activity entr${purged === 1 ? 'y' : 'ies'} older than ${olderThanDays} day(s) (before ${cutoff})`,
      });
      return { purged, cutoff };
    });
  }
}

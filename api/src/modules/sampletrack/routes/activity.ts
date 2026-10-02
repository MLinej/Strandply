import { z } from 'zod';
import { policy, requireAuthContext } from '../../../auth/guards';
import { SecureRouter } from '../../../auth/secure-router';
import { ACTIVITY_ACTIONS } from '../../../repos';
import { paging, parseJson, parseQuery } from '../../../lib/validate';
import { actorOf } from '../actor';
import { PURGE_MIN_DAYS } from '../activity-service';

const isoDateOrTimestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/, 'Use YYYY-MM-DD or an ISO UTC timestamp');

const listQuery = z.object({
  ...paging,
  userId: z.string().max(64).optional(),
  action: z.enum(ACTIVITY_ACTIONS).optional(),
  entityType: z.string().max(40).optional(),
  from: isoDateOrTimestamp.optional(),
  to: isoDateOrTimestamp.optional(),
  sort: z.string().max(30).optional(),
});

const purgeBody = z.object({ olderThanDays: z.number().int().min(PURGE_MIN_DAYS).max(36_500) });

export function activityRoutes(r: SecureRouter) {
  r.get('/activity', policy.page('users'), async (c) => {
    const { userId, action, entityType, from, to, ...rest } = parseQuery(c, listQuery);
    return c.json(await c.var.services.activity.list({ ...rest, filters: { userId, action, entityType, from, to } }));
  });

  r.post('/activity/purge', policy.superadmin(), async (c) => {
    const { olderThanDays } = await parseJson(c, purgeBody);
    const actor = actorOf(requireAuthContext(c).user);
    return c.json(await c.var.services.activity.purge(actor, olderThanDays));
  });
}

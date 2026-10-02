import type { Context } from 'hono';
import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../../../contracts/sampletrack';
import { policy, requireAuthContext } from '../../../auth/guards';
import { SecureRouter } from '../../../auth/secure-router';
import { optionalText, paging, parseJson, parseQuery } from '../../../lib/validate';
import { actorOf } from '../actor';

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/, 'Use an ISO UTC timestamp');
const ids = z.array(z.string().max(64)).min(1).max(500);

const feedQuery = z.object({
  ...paging,
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === 'true' ? true : undefined)),
  type: z.enum(NOTIFICATION_TYPES).optional(),
});

const user = (c: Context) => requireAuthContext(c as never);

export function notificationRoutes(r: SecureRouter) {
  // Reading notifications is part of the Notifications page; it needs no edit permission.
  const page = policy.page('notifications');

  r.get('/notifications', page, async (c) => {
    const { unread, type, ...rest } = parseQuery(c, feedQuery);
    return c.json(await c.var.services.notifications.feed(user(c).user.id, { ...rest, filters: { unread, type } }));
  });
  r.get('/notifications/unread-count', page, async (c) => c.json(await c.var.services.notifications.unreadCount(user(c).user.id)));
  r.post('/notifications/read', page, async (c) => {
    const body = await parseJson(c, z.object({ ids }));
    return c.json(await c.var.services.notifications.markRead(user(c).user.id, body.ids));
  });
  r.post('/notifications/read-all', page, async (c) => {
    const body = await parseJson(c, z.object({ upTo: iso.optional() }));
    return c.json(await c.var.services.notifications.markAllRead(user(c).user.id, body.upTo));
  });
  r.post('/notifications/clear', page, async (c) => {
    const body = await parseJson(c, z.object({ ids: ids.optional(), upTo: iso.optional() }));
    return c.json(await c.var.services.notifications.clear(user(c).user.id, body));
  });

  // Sidebar badges for any signed-in user; each count only appears with the matching page.
  r.get('/badges', policy.authenticated(), async (c) => {
    const auth = user(c);
    return c.json(await c.var.services.notifications.badges(auth.user.id, auth.permissions));
  });
}

const llpin = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
  z.union([z.literal(''), z.null(), z.string().regex(/^[A-Z]{3}-\d{4}$/, 'LLPIN looks like AAP-7300')]).optional(),
);
const gst = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
  z
    .union([z.literal(''), z.null(), z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Not a valid GSTIN')])
    .optional(),
);

const companyBody = z.object({
  name: z.string().trim().min(1, 'Company name is required').max(120).optional(),
  llpin,
  city: optionalText(200).optional(),
  phone: z
    .preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.union([z.literal(''), z.null(), z.string().max(40).regex(/^[+0-9][0-9\s\-()/,]{5,}$/, 'Enter a valid phone number')]))
    .optional(),
  gst,
});

export function settingsRoutes(r: SecureRouter) {
  r.get('/settings/company', policy.page('settings'), async (c) => c.json(await c.var.services.company.get()));
  r.put('/settings/company', policy.page('settings', 'edit'), async (c) => {
    const body = await parseJson(c, companyBody);
    const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v || null);
    return c.json(
      await c.var.services.company.update(actorOf(user(c).user), {
        name: body.name,
        llpin: blankToNull(body.llpin),
        city: blankToNull(body.city),
        phone: blankToNull(body.phone),
        gst: blankToNull(body.gst),
      }),
    );
  });
}

import { z } from 'zod';
import { ACTION_KEYS, isRole, PAGE_KEYS, WIDGET_KEYS } from '../../../domain/access';
import { policy, requireAuthContext } from '../../../auth/guards';
import { SecureRouter } from '../../../auth/secure-router';
import { notFound } from '../../../lib/errors';
import { parseJson } from '../../../lib/validate';
import { actorOf } from '../actor';

const permissionSetBody = z.object({
  pages: z.array(z.enum(PAGE_KEYS)),
  actions: z.array(z.enum(ACTION_KEYS)),
  widgets: z.array(z.enum(WIDGET_KEYS)),
});

/** The role × permission matrix. Viewable with the Users page; only a superadmin can change it. */
export function rolePermissionRoutes(r: SecureRouter) {
  r.get('/role-permissions', policy.page('users'), async (c) => {
    return c.json({ rows: await c.var.services.permissions.listAll() });
  });

  r.put('/role-permissions/:role', policy.superadmin(), async (c) => {
    const role = c.req.param('role') ?? '';
    if (!isRole(role)) throw notFound('Role');
    const body = await parseJson(c, permissionSetBody);
    const actor = actorOf(requireAuthContext(c).user);
    return c.json(await c.var.services.permissions.update(actor, role, body));
  });

  r.post('/role-permissions/reset', policy.superadmin(), async (c) => {
    const actor = actorOf(requireAuthContext(c).user);
    return c.json({ rows: await c.var.services.permissions.resetToDefaults(actor) });
  });
}

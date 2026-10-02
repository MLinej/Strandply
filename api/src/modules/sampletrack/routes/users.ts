import { z } from 'zod';
import { ROLES } from '../../../domain/access';
import { policy, requireAuthContext } from '../../../auth/guards';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../../auth/password';
import { SecureRouter } from '../../../auth/secure-router';
import { USER_STATUSES } from '../../../repos';
import { optionalText, paging, parseJson, parseQuery } from '../../../lib/validate';
import { actorOf } from '../actor';
import { idParam } from './params';

const username = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, digits, dot, dash or underscore');

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH);

const email = z
  .union([z.literal(''), z.email().max(200)])
  .nullish()
  .transform((v) => (v ? v.trim().toLowerCase() : null));

const createBody = z.object({
  username,
  name: z.string().trim().min(1).max(100),
  email,
  phone: optionalText(20),
  department: optionalText(100),
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES).default('Active'),
  password,
});

const updateBody = z.object({
  username: username.optional(),
  name: z.string().trim().min(1).max(100).optional(),
  email: email.optional(),
  phone: optionalText(20).optional(),
  department: optionalText(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  // Blank or missing keeps the current password.
  password: z.union([z.literal(''), password]).nullish(),
});

const listQuery = z.object({
  ...paging,
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  sort: z.string().max(30).optional(),
});

export function userRoutes(r: SecureRouter) {
  r.get('/users', policy.page('users'), async (c) => {
    const { role, status, ...rest } = parseQuery(c, listQuery);
    return c.json(await c.var.services.users.list({ ...rest, filters: { role, status } }));
  });

  r.get('/users/stats', policy.page('users'), async (c) => c.json(await c.var.services.users.stats()));

  r.get('/users/:id', policy.page('users'), async (c) => c.json(await c.var.services.users.get(idParam(c))));

  r.post('/users', policy.page('users', 'edit'), async (c) => {
    const body = await parseJson(c, createBody);
    const actor = actorOf(requireAuthContext(c).user);
    return c.json(await c.var.services.users.create(actor, body), 201);
  });

  r.patch('/users/:id', policy.page('users', 'edit'), async (c) => {
    const body = await parseJson(c, updateBody);
    const actor = actorOf(requireAuthContext(c).user);
    return c.json(await c.var.services.users.update(actor, idParam(c), body));
  });

  r.post('/users/:id/toggle-status', policy.page('users', 'edit'), async (c) => {
    const actor = actorOf(requireAuthContext(c).user);
    return c.json(await c.var.services.users.toggleStatus(actor, idParam(c)));
  });

  r.delete('/users/:id', policy.page('users', 'delete'), async (c) => {
    const actor = actorOf(requireAuthContext(c).user);
    await c.var.services.users.remove(actor, idParam(c));
    return c.body(null, 204);
  });
}

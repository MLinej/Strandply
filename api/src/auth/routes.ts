import { z } from 'zod';
import { ROLE_LABELS } from '../domain/access';
import { erpPermissions, FIRMS } from './erp-permissions';
import type { AuthContext } from '../env';
import { parseJson } from '../lib/validate';
import { toPublicUser } from '../modules/sampletrack/user-service';
import { policy, requireAuthContext } from './guards';
import { PASSWORD_MAX_LENGTH } from './password';
import { SecureRouter } from './secure-router';
import { clearSessionCookie, setSessionCookie } from './session-middleware';

const loginBody = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

/** What the web app uses to build nav and enable buttons. The server still enforces everything. */
export function mePayload(auth: AuthContext) {
  const { pages, actions, widgets } = auth.permissions;
  return {
    user: toPublicUser(auth.user),
    role: auth.user.role,
    roleLabel: ROLE_LABELS[auth.user.role],
    isSuperadmin: auth.user.role === 'superadmin',
    permissions: { pages, actions, widgets },
    /** ERP-wide permission strings for the web shell (sidebar, routes). */
    erp: { permissions: erpPermissions(auth.user.role, auth.permissions), firms: [...FIRMS] },
    can: {
      edit: actions.includes('edit'),
      delete: actions.includes('delete'),
      approve: actions.includes('approve'),
      print: actions.includes('print'),
      export: actions.includes('export'),
      dashboardFull: actions.includes('dashboard_full'),
    },
  };
}

/** ERP-wide auth, mounted at /api. */
export function authRoutes(): SecureRouter {
  const r = new SecureRouter();

  r.post('/auth/login', policy.public(), async (c) => {
    const { username, password } = await parseJson(c, loginBody);
    const { auth, permissions } = c.var.services;
    const { token, user, session } = await auth.login(username, password, {
      ip: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: c.req.header('user-agent')?.slice(0, 300) ?? null,
    });
    setSessionCookie(c, token);
    return c.json(mePayload({ user, session, permissions: await permissions.effective(user.role) }));
  });

  r.post('/auth/logout', policy.authenticated(), async (c) => {
    await c.var.services.auth.logout(requireAuthContext(c));
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  r.get('/me', policy.authenticated(), (c) => c.json(mePayload(requireAuthContext(c))));

  return r;
}

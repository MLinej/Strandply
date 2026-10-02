import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../env';

export const SESSION_COOKIE = 'sid';

/** Resolves the session cookie into c.var.auth. Never rejects. Guards decide what anonymous users can reach. */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('auth', null);
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const { auth, permissions } = c.var.services;
    const resolved = await auth.resolve(token);
    if (resolved) {
      c.set('auth', { ...resolved, permissions: await permissions.effective(resolved.user.role) });
    } else {
      clearSessionCookie(c);
    }
  }
  await next();
};

export function setSessionCookie(c: Context<AppEnv>, token: string) {
  const { cookieSecure, sessionMaxDays } = c.var.config;
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'Lax',
    path: '/',
    maxAge: sessionMaxDays * 86_400,
  });
}

export function clearSessionCookie(c: Context<AppEnv>) {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: c.var.config.cookieSecure });
}

/**
 * CSRF guard on top of SameSite=Lax. Every state-changing request must send
 * X-Requested-With. Browsers won't add custom headers to cross-site requests without a CORS preflight.
 */
export const csrfHeaderMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !c.req.header('x-requested-with')) {
    return c.json({ error: { code: 'csrf_header_missing', message: 'X-Requested-With header required' } }, 403);
  }
  await next();
};

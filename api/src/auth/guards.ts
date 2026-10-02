import type { Context, MiddlewareHandler } from 'hono';
import { ROLE_LABELS, type ActionKey, type PageKey } from '../domain/access';
import type { AppEnv, AuthContext } from '../env';
import { forbidden, unauthenticated } from '../lib/errors';

/** The signed-in user, or a 401. Use it in handlers that sit behind a guard. */
export function requireAuthContext(c: Context<AppEnv>): AuthContext {
  const auth = c.var.auth;
  if (!auth) throw unauthenticated();
  return auth;
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  requireAuthContext(c);
  await next();
};

export function requirePage(page: PageKey): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = requireAuthContext(c);
    if (!auth.permissions.pages.includes(page)) {
      throw forbidden('page_forbidden', `${ROLE_LABELS[auth.user.role]} cannot access ${page}`);
    }
    await next();
  };
}

/** Passes if the user has at least one of `pages`. For endpoints shared by two screens (e.g. a dropdown). */
export function requireAnyPage(pages: PageKey[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = requireAuthContext(c);
    if (!pages.some((p) => auth.permissions.pages.includes(p))) {
      throw forbidden('page_forbidden', `${ROLE_LABELS[auth.user.role]} cannot access ${pages.join(' or ')}`);
    }
    await next();
  };
}

export function requireAction(action: ActionKey): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = requireAuthContext(c);
    if (!auth.permissions.actions.includes(action)) {
      throw forbidden('action_forbidden', `${ROLE_LABELS[auth.user.role]} cannot ${action}`);
    }
    await next();
  };
}

export const requireSuperadmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = requireAuthContext(c);
  if (auth.user.role !== 'superadmin') throw forbidden('superadmin_only', 'Super Admin only');
  await next();
};

/** What an endpoint needs. Every route has to declare one (see SecureRouter). */
export type Policy =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'superadmin' }
  /** Needs ANY of `pages`, plus EVERY one of `actions`. */
  | { kind: 'page'; pages: PageKey[]; actions: ActionKey[] };

export const policy = {
  public: (): Policy => ({ kind: 'public' }),
  authenticated: (): Policy => ({ kind: 'authenticated' }),
  superadmin: (): Policy => ({ kind: 'superadmin' }),
  page: (page: PageKey, ...actions: ActionKey[]): Policy => ({ kind: 'page', pages: [page], actions }),
  anyPage: (pages: PageKey[], ...actions: ActionKey[]): Policy => ({ kind: 'page', pages, actions }),
};

export function guardsFor(p: Policy): MiddlewareHandler<AppEnv>[] {
  switch (p.kind) {
    case 'public':
      return [];
    case 'authenticated':
      return [requireAuth];
    case 'superadmin':
      return [requireSuperadmin];
    case 'page':
      return [p.pages.length === 1 ? requirePage(p.pages[0]!) : requireAnyPage(p.pages), ...p.actions.map(requireAction)];
  }
}

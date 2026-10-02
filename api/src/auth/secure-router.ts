import { Hono, type Handler, type MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { guardsFor, type Policy } from './guards';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RoutePolicy {
  method: HttpMethod;
  /** Full path, including the mount prefix. */
  path: string;
  policy: Policy;
}

/**
 * The only way to register an endpoint. Every route has to name a Policy, and its
 * guards run before the handler. The recorded policies let the test suite prove that
 * every registered route is guarded and matches the expected role matrix.
 */
export class SecureRouter {
  readonly hono = new Hono<AppEnv>();
  readonly policies: RoutePolicy[] = [];

  private add(method: HttpMethod, path: string, p: Policy, handler: Handler<AppEnv>) {
    this.policies.push({ method, path, policy: p });
    const chain: (MiddlewareHandler<AppEnv> | Handler<AppEnv>)[] = [...guardsFor(p), handler];
    (this.hono.on as (m: string, path: string, ...h: typeof chain) => unknown)(method, path, ...chain);
    return this;
  }

  get = (path: string, p: Policy, h: Handler<AppEnv>) => this.add('GET', path, p, h);
  post = (path: string, p: Policy, h: Handler<AppEnv>) => this.add('POST', path, p, h);
  put = (path: string, p: Policy, h: Handler<AppEnv>) => this.add('PUT', path, p, h);
  patch = (path: string, p: Policy, h: Handler<AppEnv>) => this.add('PATCH', path, p, h);
  delete = (path: string, p: Policy, h: Handler<AppEnv>) => this.add('DELETE', path, p, h);
}

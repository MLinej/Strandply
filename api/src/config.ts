import { DEFAULT_ARGON2, type Argon2Params } from './auth/password';

export interface AppConfig {
  sessionIdleHours: number;
  sessionMaxDays: number;
  /** Secure flag on the session cookie. Off only for plain-http local dev. */
  cookieSecure: boolean;
  /** How long role permissions stay cached. Writes in this process clear the cache at once. */
  permissionCacheMs: number;
  argon2: Argon2Params;
}

type Env = Record<string, string | undefined>;

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback;
};

export function loadConfig(env: Env): AppConfig {
  return {
    sessionIdleHours: num(env.SESSION_IDLE_HOURS, 12),
    sessionMaxDays: num(env.SESSION_MAX_DAYS, 7),
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE !== 'false' : env.NODE_ENV === 'production',
    permissionCacheMs: num(env.PERMISSION_CACHE_MS, 5000),
    argon2: DEFAULT_ARGON2,
  };
}

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEV_USERS, type SessionUser } from './dev-users';
import { MODULES, modulePerm, pagePerm, type ModuleDef, type PageDef } from './modules';

export type FirmCode = 'llp' | 'osb';
/** What figures are shown for. "both" is a view of each firm side by side, never a sum. */
export type FirmScope = 'both' | FirmCode;

export const FIRMS: Record<FirmCode, { code: FirmCode; name: string }> = {
  llp: { code: 'llp', name: 'Strandply LLP' },
  osb: { code: 'osb', name: 'OSB Unit' },
};

export function firmScopeLabel(scope: FirmScope) {
  return scope === 'both' ? 'Both firms' : FIRMS[scope].name;
}

interface Session {
  user: SessionUser;
  can: (perm: string) => boolean;
  canSeeModule: (mod: ModuleDef) => boolean;
  canSeePage: (mod: ModuleDef, page: PageDef) => boolean;
  /** Modules (with only the pages) this user may open, in sidebar order. */
  visibleModules: ModuleDef[];

  firm: FirmScope;
  /** Scopes this user may pick: "both" only when they have access to both firms. */
  firmOptions: FirmScope[];
  setFirm: (scope: FirmScope) => void;

  /** Dev only, until sign-in exists: preview the app as another user/role. */
  previewAs: (userId: string) => void;
  logout: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside <SessionProvider>');
  return s;
}

/** Current firm scope. Put it in every TanStack Query key for firm-scoped data: ['grns', firm, filters]. */
export function useFirmScope() {
  return useSession().firm;
}

const FIRM_KEY = (userId: string) => `strandply.firm.${userId}`;
const USER_KEY = 'strandply.devUser';

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: state still works for this tab */
  }
}

function optionsFor(user: SessionUser): FirmScope[] {
  return user.firms.length > 1 ? ['both', ...user.firms] : [...user.firms];
}

function initialFirm(user: SessionUser): FirmScope {
  const saved = read(FIRM_KEY(user.id)) as FirmScope | null;
  const options = optionsFor(user);
  return saved && options.includes(saved) ? saved : options[0];
}

/**
 * Holds the signed-in user and the firm scope. Today the user comes from DEV_USERS.
 * In Phase 0 this reads GET /auth/me instead, and the firm is persisted server-side on the session
 * (POST /auth/firm); the context shape stays the same, so no consumer changes.
 */
export function SessionProvider({ children, initialUserId }: { children: ReactNode; initialUserId?: string }) {
  const [user, setUser] = useState<SessionUser>(
    () => DEV_USERS.find((u) => u.id === (initialUserId ?? read(USER_KEY))) ?? DEV_USERS[0],
  );
  const [firm, setFirmState] = useState<FirmScope>(() => initialFirm(user));

  const setFirm = useCallback(
    (scope: FirmScope) => {
      if (!optionsFor(user).includes(scope)) return;
      write(FIRM_KEY(user.id), scope);
      setFirmState(scope);
    },
    [user],
  );

  const previewAs = useCallback((userId: string) => {
    const next = DEV_USERS.find((u) => u.id === userId);
    if (!next) return;
    write(USER_KEY, next.id);
    setUser(next);
    setFirmState(initialFirm(next));
  }, []);

  const value = useMemo<Session>(() => {
    const perms = new Set(user.permissions);
    const can = (perm: string) => perms.has('*') || perms.has(perm);
    const canSeePage = (mod: ModuleDef, page: PageDef) => can(modulePerm(mod.key)) && can(pagePerm(mod, page));
    const canSeeModule = (mod: ModuleDef) =>
      mod.key === 'home' || (can(modulePerm(mod.key)) && (mod.pages.length === 0 || mod.pages.some((p) => canSeePage(mod, p))));
    const visibleModules = MODULES.filter(canSeeModule).map((m) => ({ ...m, pages: m.pages.filter((p) => canSeePage(m, p)) }));

    return {
      user,
      can,
      canSeeModule,
      canSeePage,
      visibleModules,
      firm,
      firmOptions: optionsFor(user),
      setFirm,
      previewAs,
      logout: () => {
        /* Phase 0: POST /auth/logout, then navigate to /sign-in */
      },
    };
  }, [user, firm, setFirm, previewAs]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

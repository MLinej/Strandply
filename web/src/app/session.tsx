import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PermissionSetView } from '@contracts/session';
import { api, ApiError } from '@/api/client';
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

export interface SessionUser {
  id: string;
  /** Sign-in code (username). */
  code: string;
  name: string;
  role: string;
  /** Shown under the name in the sidebar footer. */
  scopeNote: string;
  firms: FirmCode[];
  /** ERP-wide: `*` = everything, else `<module>.view` and page strings such as `samples.requests`. */
  permissions: string[];
  /** SampleTrack pages/actions/widgets, for finer UI checks (approve, delete, export, print…). */
  st: PermissionSetView;
  /** Only a Super Admin edits role permissions, purges the activity log and manages Super Admin accounts. */
  isSuperadmin?: boolean;
}

/** GET /api/me (see api/src/auth/routes.ts). */
export interface MePayload {
  user: { id: string; username: string; name: string; department: string | null };
  role: string;
  roleLabel: string;
  isSuperadmin: boolean;
  permissions: PermissionSetView;
  erp: { permissions: string[]; firms: FirmCode[] };
}

export function toSessionUser(me: MePayload): SessionUser {
  const all = me.erp.permissions.includes('*');
  return {
    id: me.user.id,
    code: me.user.username,
    name: me.user.name,
    role: me.roleLabel,
    scopeNote: all ? 'All modules' : (me.user.department ?? me.roleLabel),
    firms: me.erp.firms,
    permissions: me.erp.permissions,
    st: me.permissions,
    isSuperadmin: me.isSuperadmin,
  };
}

interface Session {
  user: SessionUser;
  can: (perm: string) => boolean;
  /** SampleTrack action check: edit | delete | approve | print | export | dashboard_full. */
  canDo: (action: string) => boolean;
  canSeeModule: (mod: ModuleDef) => boolean;
  canSeePage: (mod: ModuleDef, page: PageDef) => boolean;
  /** Modules (with only the pages) this user may open, in sidebar order. */
  visibleModules: ModuleDef[];

  firm: FirmScope;
  /** Scopes this user may pick: "both" only when they have access to both firms. */
  firmOptions: FirmScope[];
  setFirm: (scope: FirmScope) => void;

  logout: () => Promise<void>;
}

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  /** The API couldn't be reached (not a 401). */
  | { status: 'error'; retry: () => void }
  | { status: 'authenticated'; session: Session };

interface Auth {
  state: AuthState;
  /** Signs in, stores the chosen firm and loads the session. Throws ApiError on failure. */
  login: (username: string, password: string, firm: FirmCode) => Promise<SessionUser>;
}

const AuthContext = createContext<Auth | null>(null);

export const ME_KEY = ['me'] as const;

export function useAuth() {
  const a = useContext(AuthContext);
  if (!a) throw new Error('useAuth must be used inside <SessionProvider>');
  return a;
}

/** The signed-in session. Only valid inside the app shell (behind RequireSession). */
export function useSession(): Session {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('useSession needs a signed-in user');
  return state.session;
}

/** Current firm scope. Put it in every TanStack Query key for firm-scoped data: ['grns', firm, filters]. */
export function useFirmScope() {
  return useSession().firm;
}

const FIRM_KEY = (userId: string) => `strandply.firm.${userId}`;

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
  return saved && options.includes(saved) ? saved : options[0]!;
}

function dropAllButMe(qc: ReturnType<typeof useQueryClient>) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
}

/** null = signed out. Other errors propagate (the API is down, etc.). */
async function fetchMe(signal?: AbortSignal): Promise<MePayload | null> {
  try {
    return await api<MePayload>('/me', { signal });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

function buildSession(user: SessionUser, firm: FirmScope, setFirm: (f: FirmScope) => void, logout: () => Promise<void>): Session {
  const perms = new Set(user.permissions);
  const can = (perm: string) => perms.has('*') || perms.has(perm);
  const canSeePage = (mod: ModuleDef, page: PageDef) => can(modulePerm(mod.key)) && can(pagePerm(mod, page));
  const canSeeModule = (mod: ModuleDef) =>
    mod.key === 'home' || (can(modulePerm(mod.key)) && (mod.pages.length === 0 || mod.pages.some((p) => canSeePage(mod, p))));
  const visibleModules = MODULES.filter(canSeeModule).map((m) => ({ ...m, pages: m.pages.filter((p) => canSeePage(m, p)) }));
  const actions = new Set(user.st.actions);
  return {
    user,
    can,
    canDo: (action) => perms.has('*') || actions.has(action),
    canSeeModule,
    canSeePage,
    visibleModules,
    firm,
    firmOptions: optionsFor(user),
    setFirm,
    logout,
  };
}

/**
 * Holds the signed-in user (from GET /api/me) and the firm scope.
 * Tests pass `user` to skip the network. Firm access per user isn't modelled server-side yet,
 * so the firm choice is kept per user in localStorage.
 */
export function SessionProvider({ children, user: fixedUser }: { children: ReactNode; user?: SessionUser }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: ({ signal }) => fetchMe(signal),
    enabled: !fixedUser,
    retry: false,
    staleTime: 5 * 60_000,
    // Picks up permission changes (they apply on the server at once) when the user comes back to the tab.
    refetchOnWindowFocus: true,
  });

  const user = useMemo(() => fixedUser ?? (me.data ? toSessionUser(me.data) : null), [fixedUser, me.data]);
  const [firmByUser, setFirmByUser] = useState<Record<string, FirmScope>>({});
  const firm = user ? (firmByUser[user.id] ?? initialFirm(user)) : 'both';

  const setFirm = useCallback(
    (scope: FirmScope) => {
      if (!user || !optionsFor(user).includes(scope)) return;
      write(FIRM_KEY(user.id), scope);
      setFirmByUser((m) => ({ ...m, [user.id]: scope }));
    },
    [user],
  );

  const logout = useCallback(async () => {
    try {
      await api<void>('/auth/logout', { method: 'POST' });
    } catch {
      /* an expired session is already logged out */
    }
    // Mark signed out first (the session observer sees it at once), then drop everyone else's cached data.
    // Clearing the whole cache first would leave the observer holding the old user.
    qc.setQueryData(ME_KEY, null);
    dropAllButMe(qc);
  }, [qc]);

  const login = useCallback(
    async (username: string, password: string, chosenFirm: FirmCode) => {
      const payload = await api<MePayload>('/auth/login', { method: 'POST', body: { username, password } });
      const u = toSessionUser(payload);
      const scope: FirmScope = u.firms.includes(chosenFirm) ? chosenFirm : optionsFor(u)[0]!;
      write(FIRM_KEY(u.id), scope);
      setFirmByUser((m) => ({ ...m, [u.id]: scope }));
      qc.setQueryData(ME_KEY, payload);
      dropAllButMe(qc); // nothing from a previous user's session survives
      return u;
    },
    [qc],
  );

  const state: AuthState = useMemo(() => {
    if (user) return { status: 'authenticated', session: buildSession(user, firm, setFirm, logout) };
    if (!fixedUser && me.isPending) return { status: 'loading' };
    if (me.isError) return { status: 'error', retry: () => void me.refetch() };
    return { status: 'anonymous' };
  }, [user, firm, setFirm, logout, fixedUser, me.isPending, me.isError, me.refetch]);

  const auth = useMemo<Auth>(() => ({ state, login }), [state, login]);
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

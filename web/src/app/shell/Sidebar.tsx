import { clsx } from 'clsx';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { Avatar } from '@/components/ui';
import { modulePath, pagePath, type ModuleDef, type ModuleKey } from '../modules';
import { useSession } from '../session';
import { useBadges } from '@/modules/samples/api/notifications';
import { Logo, LogoMark } from './Logo';

/** Small red-light count pill; on the collapsed rail it floats over the icon. */
function CountBadge({ count, label, floating }: { count: number; label: string; floating?: boolean }) {
  return (
    <span
      aria-label={label}
      className={clsx(
        'inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary-light px-1.5 text-label font-semibold tabular-nums text-primary',
        floating && 'absolute right-1 top-0.5 h-4 min-w-4 px-1',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Which module the current URL belongs to ("/stores/grn" → "stores", "/" → "home"). */
export function activeModuleKey(pathname: string, modules: ModuleDef[]): ModuleKey | undefined {
  const seg = pathname.split('/')[1] ?? '';
  if (seg === '') return 'home';
  return modules.find((m) => m.key === seg)?.key;
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
}

/**
 * Sidebar.dc.html: 232px, logo header 60px, 32px module rows (13.5px) with 17px outline icons,
 * active row red-light with a 3px red bar on the left edge, 28px sub-rows indented under the icon.
 * Collapsed: a 64px icon rail; each icon goes to the module's first page and names itself on hover.
 */
export function Sidebar({ collapsed, onToggle, onLogout }: SidebarProps) {
  const { visibleModules, user } = useSession();
  const badges = useBadges().data;
  // Sidebar counts from GET /badges (polled every 30 s). Keyed by module, and by "module/page".
  const counts: Record<string, number | undefined> = {
    samples: badges?.pendingRequests,
    'samples/requests': badges?.pendingRequests,
    vendors: badges?.pendingVendors,
    'vendors/directory': badges?.pendingVendors,
    stores: badges?.pendingGrn,
    'stores/grn': badges?.pendingGrn,
  };
  const { pathname } = useLocation();
  const activeKey = activeModuleKey(pathname, visibleModules);

  // Several sub-menus may be open; the active module opens itself on navigation.
  const [open, setOpen] = useState<Set<ModuleKey>>(() => new Set(activeKey ? [activeKey] : []));
  useEffect(() => {
    if (activeKey) setOpen((s) => (s.has(activeKey) ? s : new Set(s).add(activeKey)));
  }, [activeKey]);

  function toggle(key: ModuleKey) {
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <aside
      className={clsx(
        'flex h-full shrink-0 flex-col border-r border-border bg-card transition-[width] duration-150',
        collapsed ? 'w-sidebar-rail' : 'w-sidebar',
      )}
    >
      <div className={clsx('flex h-topbar shrink-0 items-center border-b border-divider', collapsed ? 'justify-center' : 'justify-between pl-4.5 pr-3.5')}>
        {!collapsed && (
          <Link to="/" aria-label="Home" className="hover:text-ink">
            <Logo />
          </Link>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={clsx(
            'flex items-center justify-center rounded-pager border border-border bg-card text-muted hover:text-ink',
            collapsed ? 'h-9 w-9 border-transparent' : 'h-7 w-7',
          )}
        >
          {collapsed ? <LogoMark size={24} /> : <ChevronLeft size={16} strokeWidth={1.8} aria-hidden />}
        </button>
      </div>

      <nav aria-label="Modules" className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-2.5">
        {visibleModules.map((m) => {
          const active = m.key === activeKey;
          const hasPages = m.pages.length > 0;
          const isOpen = hasPages && open.has(m.key) && !collapsed;
          const rowClass = clsx(
            'relative flex h-8 w-full shrink-0 items-center gap-2.5 rounded text-md transition-colors',
            collapsed ? 'justify-center' : 'px-2.5',
            active ? 'bg-primary-light font-semibold text-primary' : 'font-medium text-muted hover:bg-page hover:text-ink',
          );
          const Icon = m.icon;
          const inner = (
            <>
              <span
                aria-hidden
                className={clsx('absolute -left-2.5 bottom-1.75 top-1.75 w-0.75 rounded-r-[3px]', active ? 'bg-primary' : 'bg-transparent')}
              />
              <Icon size={17} strokeWidth={1.8} className="shrink-0" aria-hidden />
              {!collapsed && <span className="flex-1 truncate text-left">{m.label}</span>}
              {counts[m.key] ? (
                <CountBadge count={counts[m.key]!} label={`${counts[m.key]} pending`} floating={collapsed} />
              ) : null}
              {!collapsed && hasPages &&
                (isOpen ? (
                  <ChevronDown size={14} strokeWidth={1.8} className="shrink-0 opacity-70" aria-hidden />
                ) : (
                  <ChevronRight size={14} strokeWidth={1.8} className="shrink-0 opacity-70" aria-hidden />
                ))}
            </>
          );

          return (
            <div key={m.key} className="flex flex-col">
              {collapsed || !hasPages ? (
                <Link
                  to={hasPages ? pagePath(m.key, m.pages[0].slug) : modulePath(m.key)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? m.label : undefined}
                  title={collapsed ? m.label : undefined}
                  className={rowClass}
                >
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => toggle(m.key)}
                  aria-expanded={isOpen}
                  aria-controls={`nav-${m.key}`}
                  className={rowClass}
                >
                  {inner}
                </button>
              )}

              {isOpen && (
                <div id={`nav-${m.key}`} className="mb-1 mt-0.5 flex flex-col gap-px">
                  {m.pages.map((p) => (
                    <NavLink
                      key={p.slug}
                      to={pagePath(m.key, p.slug)}
                      className={({ isActive }) =>
                        clsx(
                          // 37px = row padding + icon + gap, so sub-labels line up with module labels
                          'flex h-7 shrink-0 items-center truncate rounded-pager pl-[37px] pr-2.5 text-base transition-colors',
                          isActive ? 'bg-primary-tint font-semibold text-primary' : 'font-medium text-muted hover:text-ink',
                        )
                      }
                    >
                      <span className="flex-1 truncate">{p.label}</span>
                      {counts[`${m.key}/${p.slug}`] ? <CountBadge count={counts[`${m.key}/${p.slug}`]!} label={`${counts[`${m.key}/${p.slug}`]} pending`} /> : null}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className={clsx('flex h-16 shrink-0 items-center gap-2.5 border-t border-divider', collapsed ? 'justify-center' : 'pl-4 pr-3.5')}>
        {!collapsed && (
          <>
            <Avatar name={user.name} />
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              <div className="truncate text-base font-semibold">{user.name}</div>
              <div className="truncate text-caption text-faint">{user.scopeNote}</div>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={onLogout}
          aria-label="Log out"
          title="Log out"
          className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-pager text-muted hover:bg-page hover:text-ink"
        >
          <LogOut size={17} strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    </aside>
  );
}

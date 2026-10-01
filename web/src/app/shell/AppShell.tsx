import { useEffect, useState } from 'react';
import { Outlet, useMatches } from 'react-router';
import { useToast } from '@/components/ui';
import { PrimaryScope } from '@/lib/primary-scope';
import type { RouteHandle } from '../route-handle';
import { useSession } from '../session';
import { CommandPalette } from './CommandPalette';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const COLLAPSE_KEY = 'strandply.sidebarCollapsed';

function readCollapsed() {
  try {
    const saved = localStorage.getItem(COLLAPSE_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    /* ignore */
  }
  return typeof window !== 'undefined' && window.innerWidth < 1024;
}

export function AppShell() {
  const { logout } = useSession();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [searchOpen, setSearchOpen] = useState(false);

  const matches = useMatches();
  const crumb = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.crumb)?.handle as RouteHandle | undefined;

  useEffect(() => {
    document.title = crumb?.crumb ? `${crumb.crumb.page} · Strandply ERP` : 'Strandply ERP';
  }, [crumb]);

  // Ctrl K / ⌘ K opens search from anywhere, including while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function toggleSidebar() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  }

  function onLogout() {
    logout();
    toast({ tone: 'info', title: 'Sign-in isn’t built yet', description: 'Log out will end the session once auth lands in Phase 0.' });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} onLogout={onLogout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar crumb={crumb?.crumb} onSearch={() => setSearchOpen(true)} onLogout={onLogout} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          {/* Each page is one "screen" for the one-primary-action rule. */}
          <PrimaryScope name={crumb?.crumb?.page ?? 'page'}>
            <Outlet />
          </PrimaryScope>
        </main>
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

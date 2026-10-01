import { ChevronRight, Search } from 'lucide-react';
import { Kbd } from '@/components/ui';
import { NotificationsMenu } from './NotificationsMenu';
import { UserMenu } from './UserMenu';

export interface Crumb {
  module: string;
  page: string;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Topbar.dc.html: 60px, 24px side padding. Breadcrumb (module › page) left, 420px search trigger
 * centred, then notifications, a 28px divider and the user menu.
 */
export function Topbar({ crumb, onSearch, onLogout }: { crumb: Crumb | undefined; onSearch: () => void; onLogout: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-topbar shrink-0 items-center gap-4 border-b border-border bg-card px-6">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-base text-muted lg:min-w-[260px]">
        {crumb && (
          <>
            <span className="truncate">{crumb.module}</span>
            <ChevronRight size={14} strokeWidth={1.8} className="shrink-0" aria-hidden />
            <span aria-current="page" className="truncate font-semibold text-ink">
              {crumb.page}
            </span>
          </>
        )}
      </nav>

      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={onSearch}
          aria-keyshortcuts="Control+K Meta+K"
          className="flex h-ctl w-full max-w-[420px] items-center gap-2 rounded border border-border bg-page pl-3 pr-2 text-base text-faint hover:border-faint"
        >
          <Search size={16} strokeWidth={1.8} aria-hidden />
          <span className="flex-1 text-left">Search anything...</span>
          <Kbd>{isMac ? '⌘ K' : 'Ctrl K'}</Kbd>
        </button>
      </div>

      <div className="flex items-center gap-4">
        <NotificationsMenu />
        <span className="h-7 w-px bg-border" aria-hidden />
        <UserMenu onLogout={onLogout} />
      </div>
    </header>
  );
}

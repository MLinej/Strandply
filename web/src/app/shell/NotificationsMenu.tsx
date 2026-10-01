import { clsx } from 'clsx';
import { Bell, BellOff } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Popover } from '@/components/ui';
import { MODULE_BY_KEY } from '../modules';
import { useSession } from '../session';
import { SAMPLE_NOTIFICATIONS } from './notifications';

const DOT = { bad: 'bg-primary', warn: 'bg-amber', info: 'bg-purple' };

/** Bell with a red dot while anything is unread (Topbar.dc.html); panel lists items for modules the user can see. */
export function NotificationsMenu() {
  const { canSeeModule } = useSession();
  const items = SAMPLE_NOTIFICATIONS.filter((n) => canSeeModule(MODULE_BY_KEY[n.module]));
  const [read, setRead] = useState<Set<string>>(new Set());
  const unread = items.filter((n) => !read.has(n.id)).length;

  return (
    <Popover
      role="dialog"
      aria-label="Notifications"
      widthClass="w-[380px] !py-0"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative flex h-ctl w-ctl items-center justify-center rounded text-muted hover:bg-page hover:text-ink"
        >
          <Bell size={19} strokeWidth={1.8} aria-hidden />
          {unread > 0 && <span className="absolute right-2 top-1.75 h-1.75 w-1.75 rounded-full border-[1.5px] border-card bg-primary" aria-hidden />}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between border-b border-divider px-4 py-3">
            <span className="text-title font-semibold">Notifications</span>
            {unread > 0 && (
              <button type="button" className="text-sm font-semibold text-muted hover:text-ink" onClick={() => setRead(new Set(items.map((n) => n.id)))}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-base text-muted">
              <BellOff size={18} strokeWidth={1.8} aria-hidden />
              Nothing for your modules right now.
            </div>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto">
              {items.map((n) => {
                const isUnread = !read.has(n.id);
                return (
                  <li key={n.id} className="border-b border-divider last:border-b-0">
                    <Link
                      to={n.href}
                      onClick={() => {
                        setRead((s) => new Set(s).add(n.id));
                        close();
                      }}
                      className="flex gap-2.5 px-4 py-3 hover:bg-page"
                    >
                      <span className={clsx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', isUnread ? DOT[n.tone] : 'bg-transparent')} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={clsx('block text-base', isUnread ? 'font-semibold' : 'font-medium text-muted')}>{n.title}</span>
                        <span className="mt-0.5 block text-caption text-faint">
                          {n.moduleLabel} · {n.when}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Popover>
  );
}

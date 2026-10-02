import { clsx } from 'clsx';
import { Bell, BellOff } from 'lucide-react';
import { Link } from 'react-router';
import type { NotificationView } from '@contracts/sampletrack';
import { Popover } from '@/components/ui';
import { timeAgo } from '@/lib/format';
import { useBadges, useMarkAllNotificationsRead, useMarkNotificationsRead, useNotifications } from '@/modules/samples/api/notifications';
import { useSession } from '../session';

const DOT = { danger: 'bg-primary', warning: 'bg-amber', info: 'bg-purple', success: 'bg-green' };

function hrefFor(n: NotificationView) {
  if (n.entityType === 'request') return `/samples/requests?open=${n.entityId}`;
  if (n.entityType === 'dispatch') return `/samples/tracking?open=${n.entityId}`;
  return '/';
}

/** Bell with a red dot while anything is unread (Topbar.dc.html). Live from GET /notifications, polled every 30 s. */
export function NotificationsMenu() {
  const { can } = useSession();
  if (!can('notifications.view')) return null;
  return <Bellmenu />;
}

function Bellmenu() {
  const unread = useBadges().data?.unreadNotifications ?? 0;
  const feed = useNotifications({ pageSize: 15 });
  const markRead = useMarkNotificationsRead();
  const markAll = useMarkAllNotificationsRead();
  const items = feed.data?.rows ?? [];

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
              <button
                type="button"
                className="text-sm font-semibold text-muted hover:text-ink"
                onClick={() => markAll.mutate(items[0]?.createdAt)}
              >
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-base text-muted">
              <BellOff size={18} strokeWidth={1.8} aria-hidden />
              {feed.isLoading ? 'Loading…' : 'Nothing new.'}
            </div>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="border-b border-divider last:border-b-0">
                  <Link
                    to={hrefFor(n)}
                    onClick={() => {
                      if (!n.read) markRead.mutate([n.id]);
                      close();
                    }}
                    className="flex gap-2.5 px-4 py-3 hover:bg-page"
                  >
                    <span className={clsx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', n.read ? 'bg-transparent' : DOT[n.type])} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={clsx('block text-base', n.read ? 'font-medium text-muted' : 'font-semibold')}>{n.message ?? n.title}</span>
                      <span className="mt-0.5 block text-caption text-faint">
                        {n.title} · {timeAgo(n.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Popover>
  );
}

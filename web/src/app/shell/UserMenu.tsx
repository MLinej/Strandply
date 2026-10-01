import { ChevronDown, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Avatar, MenuItem, MenuLabel, MenuSeparator, Popover } from '@/components/ui';
import { DEV_USERS } from '../dev-users';
import { firmScopeLabel, useSession } from '../session';

export function UserMenu({ onLogout }: { onLogout: () => void }) {
  const { user, firm, firmOptions, setFirm, previewAs } = useSession();
  const navigate = useNavigate();

  return (
    <Popover
      aria-label="Account"
      widthClass="w-72"
      trigger={(props) => (
        <button {...props} type="button" className="flex items-center gap-2.5 rounded p-1 text-left hover:bg-page">
          <Avatar name={user.name} />
          <span className="hidden flex-col gap-px md:flex">
            <span className="text-base font-semibold text-ink">{user.name}</span>
            <span className="text-caption text-faint">
              {user.role} · {firmScopeLabel(firm)}
            </span>
          </span>
          <ChevronDown size={14} strokeWidth={1.8} className="text-muted" aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="px-3 pb-2 pt-1">
            <div className="text-base font-semibold">{user.name}</div>
            <div className="text-caption text-faint">
              {user.code} · {user.role}
            </div>
          </div>
          <MenuSeparator />
          <MenuLabel>Firm</MenuLabel>
          {firmOptions.map((f) => (
            <MenuItem
              key={f}
              checked={f === firm}
              onClick={() => {
                setFirm(f);
                close();
              }}
            >
              {firmScopeLabel(f)}
            </MenuItem>
          ))}
          {import.meta.env.DEV && (
            <>
              <MenuSeparator />
              <MenuLabel>Preview as · dev only</MenuLabel>
              {DEV_USERS.map((u) => (
                <MenuItem
                  key={u.id}
                  checked={u.id === user.id}
                  hint={u.scopeNote}
                  onClick={() => {
                    previewAs(u.id);
                    close();
                    navigate('/'); // the current page may not exist for the previewed role
                  }}
                >
                  {u.name} · {u.role}
                </MenuItem>
              ))}
            </>
          )}
          <MenuSeparator />
          <MenuItem
            icon={LogOut}
            onClick={() => {
              close();
              onLogout();
            }}
          >
            Log out
          </MenuItem>
        </>
      )}
    </Popover>
  );
}

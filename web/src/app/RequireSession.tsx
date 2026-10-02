import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Button } from '@/components/ui';
import { LogoMark } from './shell/Logo';
import { useAuth } from './session';

/** Renders the app only for a signed-in user. Anyone else goes to /sign-in?next=<where they were going>. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-subtle" role="status" aria-label="Loading">
        <div className="animate-pulse">
          <LogoMark size={36} />
        </div>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-subtle text-center">
        <p className="text-title font-semibold">Can’t reach the server</p>
        <p className="max-w-sm text-base text-muted">Check that the API is running, then try again.</p>
        <Button variant="secondary" icon={RefreshCw} onClick={state.retry}>
          Try again
        </Button>
      </div>
    );
  }
  if (state.status === 'anonymous') {
    const next = location.pathname + location.search;
    return <Navigate to={next === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

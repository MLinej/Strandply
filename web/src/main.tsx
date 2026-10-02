import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { ApiError } from '@/api/client';
import { ME_KEY, SessionProvider } from '@/app/session';
import { ToastProvider } from '@/components/ui';
import { router } from './router';
import './styles/index.css';

/** A 401 anywhere means the session ended (expired, logged out elsewhere, user deactivated): drop it, so RequireSession sends the user to /sign-in. */
function onApiError(err: unknown) {
  if (err instanceof ApiError && err.status === 401) queryClient.setQueryData(ME_KEY, null);
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Retrying a 401/403/404 can't help.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);

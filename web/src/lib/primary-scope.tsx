import { createContext, useContext, useEffect, useId, useMemo, useRef, type ReactNode } from 'react';

/**
 * Dev-time enforcement of "red appears once per screen".
 *
 * A PrimaryScope is a screen or a self-contained surface: a page, a modal, or a table's bulk-action bar
 * (the GRN mockup has "New GRN" in the header and "Approve" in the selection bar).
 * Every <Button variant="primary"> registers with its nearest scope. In development
 * a second one in the same scope logs a console error naming both buttons.
 * Production builds do nothing.
 */
interface Registry {
  name: string;
  register: (id: string, label: string) => () => void;
}

const PrimaryScopeContext = createContext<Registry | null>(null);

export function PrimaryScope({ name, children }: { name: string; children: ReactNode }) {
  const entries = useRef(new Map<string, string>());
  const registry = useMemo<Registry>(
    () => ({
      name,
      register(id, label) {
        entries.current.set(id, label);
        if (entries.current.size > 1) {
          console.error(
            `[design-system] Scope "${name}" has ${entries.current.size} primary buttons: ` +
              `${[...entries.current.values()].map((l) => `"${l}"`).join(', ')}. ` +
              'Keep one primary; make the others secondary or danger-outline.',
          );
        }
        return () => entries.current.delete(id);
      },
    }),
    [name],
  );
  return <PrimaryScopeContext.Provider value={registry}>{children}</PrimaryScopeContext.Provider>;
}

export function usePrimaryRegistration(active: boolean, label: string) {
  const scope = useContext(PrimaryScopeContext);
  const id = useId();
  useEffect(() => {
    if (!import.meta.env.DEV || !active || !scope) return;
    return scope.register(id, label || 'unlabelled');
  }, [active, scope, id, label]);
}

import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

/** 32px neutral circle with initials (sidebar footer, topbar user menu). */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-meta font-semibold text-ink', className)}
    >
      {initials(name)}
    </span>
  );
}

/** Keyboard hint chip: "Ctrl K", "Esc". */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={clsx('rounded-kbd border border-border bg-card px-1.5 py-0.5 font-sans text-label font-semibold text-muted', className)}>
      {children}
    </kbd>
  );
}

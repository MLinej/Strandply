import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Popover } from '@/components/ui';

/** The "⋯" row-actions menu. `children(close)` renders MenuItems. Clicking it doesn't open the row. */
export function RowMenu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  return (
    <Popover
      aria-label={label}
      widthClass="w-56"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation();
            props.onClick();
          }}
          className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-page hover:text-ink"
        >
          <MoreHorizontal size={16} strokeWidth={1.8} aria-hidden />
        </button>
      )}
    >
      {children}
    </Popover>
  );
}

/** Wraps a menu action so the menu closes first. */
export const runAndClose = (close: () => void, fn: () => void) => () => {
  close();
  fn();
};

import { clsx } from 'clsx';
import { Check, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';

export interface PopoverTriggerProps {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  'aria-expanded': boolean;
  'aria-haspopup': 'menu' | 'dialog';
  'aria-controls': string;
}

export interface PopoverProps {
  trigger: (props: PopoverTriggerProps) => ReactNode;
  /** Receives `close` so items can dismiss the panel after acting. */
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  /** Tailwind width class for the panel. */
  widthClass?: string;
  role?: 'menu' | 'dialog';
  'aria-label': string;
}

/** Anchored panel for menus and small dialogs (user menu, notifications). Closes on outside click and Esc. */
export function Popover({ trigger, children, align = 'end', widthClass = 'w-64', role = 'menu', ...rest }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      {trigger({ ref: button, onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': role, 'aria-controls': id })}
      {open && (
        <div
          id={id}
          role={role}
          aria-label={rest['aria-label']}
          className={clsx(
            'absolute top-full z-40 mt-2 overflow-hidden rounded-lg border border-border bg-card py-1.5 shadow-overlay',
            align === 'end' ? 'right-0' : 'left-0',
            widthClass,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="label-caps px-3 pb-1 pt-2">{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className="my-1.5 h-px bg-divider" />;
}

export interface MenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  /** For radio-like items (firm, preview-as). */
  checked?: boolean;
  hint?: ReactNode;
}

export function MenuItem({ icon: Icon, checked, hint, className, children, ...rest }: MenuItemProps) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      className={clsx(
        'flex w-full items-center gap-2.5 px-3 py-1.75 text-left text-base hover:bg-page focus-visible:bg-page focus-visible:outline-none',
        checked ? 'font-semibold text-ink' : 'text-ink',
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={16} strokeWidth={1.8} className="shrink-0 text-muted" aria-hidden />}
      <span className="min-w-0 flex-1">
        {children}
        {hint && <span className="block text-caption font-normal text-faint">{hint}</span>}
      </span>
      {checked && <Check size={15} strokeWidth={2} className="shrink-0 text-ink" aria-hidden />}
    </button>
  );
}

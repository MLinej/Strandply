import { clsx } from 'clsx';
import { Check, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';

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

const GAP = 8;

/**
 * Anchored panel for menus and small dialogs (user menu, notifications, table row menus). Closes on outside click and Esc.
 * The panel is portalled and fixed-positioned so table cells and scroll containers can't clip it; it opens upwards
 * when there's more room above than below.
 */
export function Popover({ trigger, children, align = 'end', widthClass = 'w-64', role = 'menu', ...rest }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const b = button.current?.getBoundingClientRect();
      if (!b) return;
      const height = panel.current?.offsetHeight ?? 0;
      const vh = window.innerHeight;
      const below = vh - b.bottom;
      const up = height + GAP > below && b.top > below;
      setPos({
        top: up ? undefined : b.bottom + GAP,
        bottom: up ? vh - b.top + GAP : undefined,
        left: align === 'start' ? b.left : undefined,
        right: align === 'end' ? document.documentElement.clientWidth - b.right : undefined,
        maxHeight: (up ? b.top : below) - GAP * 2,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
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
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role={role}
            aria-label={rest['aria-label']}
            // React events bubble through portals; keep menu clicks from reaching a clickable table row.
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', ...(pos ?? { top: 0, left: 0, visibility: 'hidden' }) }}
            className={clsx('z-40 overflow-y-auto rounded-lg border border-border bg-card py-1.5 shadow-overlay', widthClass)}
          >
            {children(close)}
          </div>,
          // Inside a modal <dialog> the panel must stay in the dialog's top layer.
          button.current?.closest('dialog') ?? document.body,
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

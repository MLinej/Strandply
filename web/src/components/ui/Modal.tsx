import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { PrimaryScope } from '@/lib/primary-scope';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons, right-aligned. One primary at most; the modal is its own primary scope. */
  footer?: ReactNode;
  /** xl: wide document forms with line items (Sales). */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Set false for forms with unsaved input, so a stray backdrop click doesn't discard work. */
  closeOnBackdrop?: boolean;
  children?: ReactNode;
}

const WIDTH = { sm: 'w-[400px]', md: 'w-[560px]', lg: 'w-[720px]', xl: 'w-[1000px]' };

/**
 * Built on native <dialog>: the browser provides the focus trap, the top layer, Esc and inert background.
 * Top-aligned 92px down like the command palette, on an ink/32% backdrop.
 */
export function Modal({ open, onClose, title, description, footer, size = 'md', closeOnBackdrop = true, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal?.();
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
        if (dialog.open) dialog.close?.();
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault(); // Esc: let React state own open/closed
        onClose();
      }}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
      className={clsx(
        'mx-auto mt-modal-top max-h-[calc(100vh-184px)] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-border bg-card p-0 text-ink shadow-overlay',
        WIDTH[size],
      )}
    >
      <PrimaryScope name="modal">
        <div className="flex max-h-[calc(100vh-184px)] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-divider px-5 py-4">
            <div className="flex flex-col gap-0.5">
              <h2 id={titleId} className="text-title font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descId} className="text-base text-muted">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-ink"
            >
              <X size={16} strokeWidth={1.8} aria-hidden />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-border bg-page px-5 py-3">{footer}</footer>}
        </div>
      </PrimaryScope>
    </dialog>
  );
}

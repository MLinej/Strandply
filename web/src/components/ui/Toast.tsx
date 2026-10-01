import { clsx } from 'clsx';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** ms before auto-dismiss. Errors stay 8s by default, everything else 4s. 0 = stay until closed. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const TONE: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  success: { icon: CheckCircle2, className: 'text-green' },
  error: { icon: AlertCircle, className: 'text-primary' },
  warning: { icon: AlertTriangle, className: 'text-amber' },
  info: { icon: Info, className: 'text-purple' },
};

const ToastContext = createContext<((t: ToastOptions) => void) | null>(null);

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside <ToastProvider>');
  return toast;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback((t: ToastOptions) => {
    const id = nextId.current++;
    setItems((xs) => [...xs.slice(-3), { ...t, id }]); // at most 4 on screen
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2">
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const tone = item.tone ?? 'success';
  const { icon: Icon, className } = TONE[tone];
  const duration = item.duration ?? (tone === 'error' ? 8000 : 4000);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!duration || paused) return;
    const t = setTimeout(() => onDismiss(item.id), duration);
    return () => clearTimeout(t);
  }, [duration, paused, onDismiss, item.id]);

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border bg-card p-3.5 shadow-overlay"
    >
      <Icon size={17} strokeWidth={1.8} className={clsx('mt-px shrink-0', className)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold text-ink">{item.title}</div>
        {item.description && <div className="mt-0.5 text-sm text-muted">{item.description}</div>}
      </div>
      <button type="button" onClick={() => onDismiss(item.id)} aria-label="Dismiss" className="-m-1 rounded-md p-1 text-faint hover:text-ink">
        <X size={14} strokeWidth={1.8} aria-hidden />
      </button>
    </div>
  );
}

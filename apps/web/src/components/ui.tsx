import { clsx } from 'clsx';
import { Loader2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { ButtonHTMLAttributes, createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger'; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm',
        variant === 'primary' && 'bg-brand text-snow shadow-glow hover:brightness-110',
        variant === 'ghost' && 'text-ink-300 hover:text-white hover:bg-white/5',
        variant === 'outline' && 'border border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.07]',
        variant === 'danger' && 'bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25',
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('glass rounded-2xl', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-300">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

const STATUS: Record<string, { label: string; cls: string; pulse?: boolean }> = {
  APPROVED: { label: 'Aprovado', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  PENDING: { label: 'Em análise', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', pulse: true },
  IN_APPEAL: { label: 'Em recurso', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', pulse: true },
  REJECTED: { label: 'Rejeitado', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  PAUSED: { label: 'Pausado', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  DISABLED: { label: 'Desativado', cls: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' },
  DELETED: { label: 'Excluído', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
  DRAFT: { label: 'Rascunho', cls: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' },
  SCHEDULED: { label: 'Agendada', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  RUNNING: { label: 'Enviando', cls: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30', pulse: true },
  COMPLETED: { label: 'Concluída', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
  FAILED: { label: 'Falhou', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  SENDING: { label: 'Enviando', cls: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30', pulse: true },
  SENT: { label: 'Enviada', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  DELIVERED: { label: 'Entregue', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  READ: { label: 'Lida', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  SKIPPED: { label: 'Ignorada', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
  MARKETING: { label: 'Marketing', cls: 'bg-pink-500/15 text-pink-300 border-pink-500/30' },
  UTILITY: { label: 'Utilidade', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
};
STATUS.PENDING_RECIPIENT = { label: 'Na fila', cls: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' };

export function StatusBadge({ status, recipient }: { status: string; recipient?: boolean }) {
  const s = (recipient && status === 'PENDING' ? STATUS.PENDING_RECIPIENT : STATUS[status]) ?? { label: status, cls: 'bg-white/5 text-ink-300 border-white/10' };
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', s.cls)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full bg-current', s.pulse && 'animate-pulse')} />
      {s.label}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin text-fuchsia-400', className)} />;
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-fuchsia-300">{icon}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-300">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  if (!open) return null;
  // portal no <body>: dentro de um elemento com backdrop-filter (ex.: Card .glass) o "fixed" ficaria preso a ele
  return createPortal(
    <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className={clsx('glass w-full rounded-2xl bg-ink-900/95 p-6 animate-fade-up', wide ? 'max-w-3xl' : 'max-w-md')}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-300 hover:bg-white/5 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Stat({ label, value, icon, accent, sub }: { label: string; value: ReactNode; icon: ReactNode; accent?: string; sub?: ReactNode }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className={clsx('absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl opacity-40', accent ?? 'bg-fuchsia-500')} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-300">{label}</span>
        <span className="text-ink-300">{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-extrabold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-400">{sub}</div>}
    </Card>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-3 text-sm">
      <span className={clsx('relative h-6 w-11 rounded-full transition', checked ? 'bg-brand' : 'bg-white/10')}>
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-snow shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
      {label}
    </button>
  );
}

/* ---------- Toasts ---------- */
type Toast = { id: number; text: string; kind: 'ok' | 'error' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[3000] flex w-[min(380px,calc(100vw-2.5rem))] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'glass animate-fade-up rounded-xl bg-ink-900/95 px-4 py-3 text-sm',
              t.kind === 'error' ? 'border-rose-500/40 text-rose-200' : 'border-emerald-500/30 text-emerald-200',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

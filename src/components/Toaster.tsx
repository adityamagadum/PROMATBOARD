import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';
import { AlertCircle, Info } from 'lucide-react';

type Kind = 'success' | 'info' | 'error';
interface Toast {
  id: number;
  kind: Kind;
  message: string;
  action?: { label: string; run: () => void };
}

const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));
let seq = 0;

export function toast(message: string, opts: { kind?: Kind; action?: Toast['action']; duration?: number } = {}) {
  const id = ++seq;
  // One toast at a time keeps the narrow popup calm; the newest wins.
  useToasts.setState({ toasts: [{ id, kind: opts.kind ?? 'success', message, action: opts.action }] });
  window.setTimeout(
    () => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    opts.duration ?? (opts.action ? 5000 : 1800),
  );
}

const dismiss = (id: number) => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));

/** Check mark drawn with a quick stroke animation. */
function DrawnCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        fill="var(--success)"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 600, damping: 26 }}
      />
      <motion.path
        d="M7 12.5l3.2 3.2L17 9"
        fill="none"
        stroke="#0a0a0c"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.22, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-11 z-[60] flex flex-col items-center gap-2 px-3"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            role="status"
            className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-line-strong bg-s3/95 py-1.5 pr-1.5 pl-2.5 text-[12.5px] font-medium text-fg shadow-pop backdrop-blur-md"
          >
            {t.kind === 'success' && <DrawnCheck />}
            {t.kind === 'info' && <Info size={15} className="text-accent" />}
            {t.kind === 'error' && <AlertCircle size={15} className="text-danger" />}
            <span className="truncate pr-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
                className="rounded-full bg-s4 px-2.5 py-0.5 text-[12px] font-semibold text-accent-strong transition-colors hover:bg-accent hover:text-accent-fg"
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

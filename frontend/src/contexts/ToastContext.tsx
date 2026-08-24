'use client';

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

type ToastType = 'success' | 'error' | 'info';

// Solid dark pill + colored icon dot, not a pale bordered box (2026-08-20,
// explicit user report: on the light cream theme, a white box with a thin
// pale border barely registered — "on ne le voit pas bien"). One consistent
// treatment differentiated only by icon/dot color reads as more deliberate
// than three different border/text color combos, and a solid
// bg-foreground/text-background pill stays legible regardless of what's
// behind it (a header, the page background, anything).
const TYPE_STYLES: Record<ToastType, { icon: 'check-circle' | 'x-circle' | 'bell'; dot: string }> =
  {
    success: { icon: 'check-circle', dot: 'bg-emerald-400' },
    error: { icon: 'x-circle', dot: 'bg-red-400' },
    info: { icon: 'bell', dot: 'bg-primary' },
  };

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  toast: () => {},
});

const TOAST_DURATION = 3000;
const FADE_OUT_DURATION = 300;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextIdRef.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    }, TOAST_DURATION);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION + FADE_OUT_DURATION);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast: addToast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 z-[100] flex flex-col items-center gap-2 px-4"
        style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        {toasts.map((t) => {
          const style = TYPE_STYLES[t.type];
          return (
            <div
              key={t.id}
              className={`animate-fade-in-down pointer-events-auto flex items-center gap-3 rounded-full bg-foreground py-2.5 pl-3 pr-5 font-body text-sm font-medium text-background shadow-xl transition-opacity duration-300 ${
                t.exiting ? 'opacity-0' : 'opacity-100'
              }`}
              style={{ maxWidth: '90vw' }}
            >
              <span
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${style.dot}`}
              >
                <Icon name={style.icon} size={14} className="text-white" />
              </span>
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

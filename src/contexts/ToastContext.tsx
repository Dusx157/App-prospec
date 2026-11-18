import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface ToastItem {
  id: string;
  type: 'success' | 'error';
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4400);
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex items-start gap-3 bg-[#141821]/95 backdrop-blur-xl border border-[#252B36] rounded-2xl px-4 py-3 shadow-2xl text-xs text-[#F5F7FA]"
            >
              {t.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-[#19C37D] shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <span className="flex-1 leading-relaxed">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-[#929BAA] hover:text-[#F5F7FA] transition-colors shrink-0 p-0.5"
                aria-label="Fechar notificação"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

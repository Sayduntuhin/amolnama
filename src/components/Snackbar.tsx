import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, X, Info } from 'lucide-react';

export type SnackbarType = 'success' | 'error' | 'info' | 'warning';

export interface SnackbarMessage {
  id: string;
  message: string;
  type: SnackbarType;
}

interface SnackbarContextType {
  showSnackbar: (message: string, type?: SnackbarType) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  showWarning: (message: string) => void;
}

const SnackbarContext = createContext<SnackbarContextType | undefined>(undefined);

export function useSnackbar() {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
}

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [snackbars, setSnackbars] = useState<SnackbarMessage[]>([]);

  const showSnackbar = useCallback((message: string, type: SnackbarType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setSnackbars((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setSnackbars((prev) => prev.filter((s) => s.id !== id));
    }, 4500);
  }, []);

  const showSuccess = useCallback((message: string) => showSnackbar(message, 'success'), [showSnackbar]);
  const showError = useCallback((message: string) => showSnackbar(message, 'error'), [showSnackbar]);
  const showInfo = useCallback((message: string) => showSnackbar(message, 'info'), [showSnackbar]);
  const showWarning = useCallback((message: string) => showSnackbar(message, 'warning'), [showSnackbar]);

  const removeSnackbar = (id: string) => {
    setSnackbars((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <SnackbarContext.Provider value={{ showSnackbar, showSuccess, showError, showInfo, showWarning }}>
      {children}
      {/* Toast container overlay */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 min-w-[300px] max-w-[420px] pointer-events-none">
        <AnimatePresence>
          {snackbars.map((s) => (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
              className="pointer-events-auto flex items-start gap-3 bg-white text-slate-800 p-4 rounded-2xl border shadow-lg border-slate-100 shadow-slate-100/50"
            >
              {s.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />}
              {s.type === 'error' && <X className="w-5 h-5 text-rose-500 rounded-full border border-rose-250 bg-rose-50 p-0.5 shrink-0 mt-0.5" />}
              {s.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
              {s.type === 'info' && <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />}
              
              <div className="flex-1 text-xs font-semibold text-slate-700 leading-relaxed pr-2">
                {s.message}
              </div>
              
              <button
                onClick={() => removeSnackbar(s.id)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-50 rounded-lg shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </SnackbarContext.Provider>
  );
}

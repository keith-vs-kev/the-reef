import React, { useState, useCallback, useEffect, createContext, useContext } from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  exiting?: boolean;
}

interface ToastContextType {
  addToast: (message: string, type?: Toast['type']) => void;
}

const ToastContext = createContext<ToastContextType>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    // Auto-remove after 4s
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 200);
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-10 right-4 z-40 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-lg border shadow-lg text-xs font-medium ${
              toast.exiting ? 'toast-exit' : 'toast-enter'
            } ${
              toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
              toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
              'bg-reef-bg-elevated border-reef-border text-reef-text-bright'
            }`}
          >
            {toast.type === 'success' && <span>✓</span>}
            {toast.type === 'error' && <span>✗</span>}
            {toast.type === 'info' && <span className="text-reef-accent">ℹ</span>}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

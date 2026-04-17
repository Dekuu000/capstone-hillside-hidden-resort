"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

type ToastInput = {
  title: string;
  message?: string;
  type?: ToastType;
  durationMs?: number;
};

type ToastItem = {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
  durationMs: number;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClass: Record<ToastType, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
};

const iconByType: Record<ToastType, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4" />,
  error: <XCircle className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
  warning: <TriangleAlert className="h-4 w-4" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: ToastInput) => {
      const id = crypto.randomUUID();
      const entry: ToastItem = {
        id,
        title: toast.title,
        message: toast.message,
        type: toast.type ?? "info",
        durationMs: toast.durationMs ?? 5000,
      };
      setToasts((prev) => [...prev, entry]);
      window.setTimeout(() => dismissToast(id), entry.durationMs);
    },
    [dismissToast],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[120] flex justify-center px-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:block sm:w-[360px]">
        <div className="space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-xl border p-3 shadow-[var(--shadow-md)] ${toneClass[toast.type]}`}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">{iconByType[toast.type]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{toast.title}</p>
                  {toast.message ? <p className="mt-0.5 text-xs">{toast.message}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="rounded-md p-1 hover:bg-black/5"
                  aria-label="Close toast"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

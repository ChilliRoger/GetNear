"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X, ExternalLink } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
  explorerUrl?: string;
}

interface ToastContextType {
  showToast: (title: string, options?: { description?: string; type?: ToastType; explorerUrl?: string }) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(
    (title: string, options?: { description?: string; type?: ToastType; explorerUrl?: string }) => {
      const id = `toast-${++counter}`;
      const item: ToastItem = {
        id,
        title,
        description: options?.description,
        type: options?.type || "info",
        explorerUrl: options?.explorerUrl,
      };

      setToasts((prev) => [...prev.slice(-3), item]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    [],
  );

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-lg border text-xs shadow-lg animate-in slide-in-from-bottom-2 duration-150 ${
              t.type === "success"
                ? "bg-zinc-950 border-emerald-800 text-zinc-100"
                : t.type === "error"
                ? "bg-zinc-950 border-red-800 text-zinc-100"
                : "bg-zinc-950 border-zinc-800 text-zinc-100"
            }`}
          >
            {t.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />}
            {t.type === "error" && <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
            {t.type === "info" && <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />}

            <div className="flex-1 min-w-0">
              <div className="font-semibold text-zinc-100">{t.title}</div>
              {t.description && <div className="text-zinc-400 mt-0.5 break-words">{t.description}</div>}
              {t.explorerUrl && (
                <a
                  href={t.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400 hover:underline mt-1 font-mono text-[11px]"
                >
                  <span>View on NEARBlocks</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>

            <button
              onClick={() => dismiss(t.id)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

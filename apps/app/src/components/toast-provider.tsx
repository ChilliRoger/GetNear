"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Toast, type ToastItem, type ToastType } from "./toast";

interface ToastOptions {
  type?: ToastType;
  explorerUrl?: string;
}

interface ToastContextType {
  showToast: (message: string, typeOrOptions?: ToastType | ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, typeOrOptions?: ToastType | ToastOptions) => {
    const id = `toast-${++toastCounter}`;
    let type: ToastType = "info";
    let explorerUrl: string | undefined;

    if (typeof typeOrOptions === "string") {
      type = typeOrOptions;
    } else if (typeOrOptions && typeof typeOrOptions === "object") {
      if (typeOrOptions.type) type = typeOrOptions.type;
      explorerUrl = typeOrOptions.explorerUrl;
    }

    setToasts((prev) => {
      const next = [...prev, { id, message, type, explorerUrl }];
      return next.length > 3 ? next.slice(-3) : next;
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container — fixed at bottom */}
      <div className="fixed bottom-20 left-0 right-0 z-50 pointer-events-none">
        <div className="mx-auto flex max-w-lg flex-col gap-2 px-4">
          {toasts.map((item) => (
            <div key={item.id} className="pointer-events-auto">
              <Toast item={item} onDismiss={dismiss} />
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

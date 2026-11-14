"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X, ExternalLink } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  explorerUrl?: string;
}

const typeStyles: Record<ToastType, string> = {
  success: "border-green-500/30 bg-green-950/80 text-green-300",
  error: "border-red-500/30 bg-red-950/80 text-red-300",
  info: "border-blue-500/30 bg-blue-950/80 text-blue-300",
};

export function Toast({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(item.id), 200);
    }, 5000);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md transition-all duration-200 ${
        typeStyles[item.type]
      } ${visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
    >
      {item.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />}
      {item.type === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />}
      {item.type === "info" && <Info className="h-4 w-4 shrink-0 text-blue-400" />}

      <span className="flex-1">{item.message}</span>

      {item.explorerUrl && (
        <a
          href={item.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs underline opacity-80 hover:opacity-100"
        >
          <span>Explorer</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      )}

      <button
        onClick={() => {
          setVisible(false);
          setTimeout(() => onDismiss(item.id), 200);
        }}
        className="ml-1 p-0.5 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss alert"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

const typeStyles: Record<ToastType, string> = {
  success: "border-accent-green/30 bg-accent-green/10 text-accent-green",
  error: "border-accent-red/30 bg-accent-red/10 text-accent-red",
  info: "border-accent-blue/30 bg-accent-blue/10 text-accent-blue",
};

const typeIcons: Record<ToastType, string> = {
  success: "\u2713",
  error: "\u2717",
  info: "\u24D8",
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
    // Trigger slide-up animation
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(item.id), 200);
    }, 4000);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md transition-all duration-200 ${
        typeStyles[item.type]
      } ${visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
    >
      <span className="text-base">{typeIcons[item.type]}</span>
      <span className="flex-1">{item.message}</span>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(() => onDismiss(item.id), 200);
        }}
        className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
      >
        &times;
      </button>
    </div>
  );
}

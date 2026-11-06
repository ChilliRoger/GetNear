"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/card";
import { usePrivacyTransactions } from "@/lib/privacy-hooks";

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} />;
}

/** Client-only relative timestamp — avoids SSR/client hydration mismatch. */
function RelativeTime({ timestamp }: { timestamp: number }) {
  const [label, setLabel] = useState("\u2014");

  useEffect(() => {
    const update = () => {
      const diff = Date.now() - timestamp * 1000;
      const mins = Math.floor(diff / 60_000);
      if (mins < 1) {
        setLabel("just now");
      } else if (mins < 60) {
        setLabel(`${mins}m ago`);
      } else {
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) {
          setLabel(`${hrs}h ago`);
        } else {
          setLabel(`${Math.floor(hrs / 24)}d ago`);
        }
      }
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [timestamp]);

  return <span>{label}</span>;
}

const BASE_SEPOLIA_EXPLORER = "https://sepolia.basescan.org/tx/";

export function PrivacyTxHistory() {
  const { data, loading, error } = usePrivacyTransactions();

  return (
    <Card title="Private Transaction History" subtitle="Base Sepolia">
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : error || !data || data.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">
          {error ? "Unable to load transactions" : "No transactions yet"}
        </p>
      ) : (
        <div className="overflow-x-auto">
          {/* Header */}
          <div className="mb-1 grid grid-cols-[1fr_1fr_auto_1fr] gap-2 text-[10px] font-medium uppercase tracking-wide text-muted">
            <span>Type</span>
            <span className="text-right">Amount</span>
            <span className="text-center">Status</span>
            <span className="text-right">Time</span>
          </div>

          {/* Rows */}
          <div className="space-y-0">
            {data.map((tx) => (
              <div
                key={tx.id}
                className="grid grid-cols-[1fr_1fr_auto_1fr] items-center gap-2 border-b border-border/50 py-2 last:border-0"
              >
                <div className="flex items-center gap-1.5">
                  <TxDot type={tx.type} />
                  <span className="text-xs font-medium capitalize text-foreground">
                    {tx.type}
                  </span>
                </div>
                <span className="text-right font-tabular text-xs font-semibold text-foreground">
                  {tx.amount} {tx.token}
                </span>
                <StatusPill status={tx.status} />
                <div className="flex items-center justify-end gap-1">
                  <span className="text-[10px] text-muted">
                    <RelativeTime timestamp={tx.timestamp} />
                  </span>
                  {tx.txHash && (
                    <a
                      href={`${BASE_SEPOLIA_EXPLORER}${tx.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function TxDot({ type }: { type: string }) {
  const color: Record<string, string> = {
    deposit: "bg-accent-blue",
    withdraw: "bg-accent-green",
    swap: "bg-purple-500",
  };
  return (
    <span className={`h-1.5 w-1.5 rounded-full ${color[type] || "bg-border"}`} />
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    complete: "bg-accent-green/15 text-accent-green",
    confirming: "bg-accent-blue/15 text-accent-blue",
    pending: "bg-accent-amber/15 text-accent-amber",
    failed: "bg-accent-red/15 text-accent-red",
  };
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-center text-[9px] font-medium capitalize ${
        styles[status] || "bg-border text-muted"
      }`}
    >
      {status}
    </span>
  );
}

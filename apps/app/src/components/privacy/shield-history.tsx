"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/card";
import { useShieldHistory } from "@/lib/privacy-hooks";
import type { ShieldTransaction } from "@getnear/shared";

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} />;
}

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

function StatusBadge({ status }: { status: ShieldTransaction["status"] }) {
  const styles: Record<string, string> = {
    confirmed: "bg-accent-green/15 text-accent-green",
    pending: "bg-accent-amber/15 text-accent-amber",
    failed: "bg-accent-red/15 text-accent-red",
  };
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize ${
        styles[status] || "bg-border text-muted"
      }`}
    >
      {status}
    </span>
  );
}

export function ShieldHistory() {
  const { data, loading, error } = useShieldHistory();
  const transactions = data?.transactions ?? [];

  return (
    <Card title="Recent Shielding Transactions" subtitle="Shield / Unshield activity">
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error || transactions.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <p className="text-sm text-muted">
            {error ? "Unable to load transactions" : "No shielding transactions yet"}
          </p>
          <p className="mt-1 text-[11px] text-muted/60">
            Shield or unshield tokens to see activity here.
          </p>
        </div>
      ) : (
        <div className="space-y-0">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between border-b border-border/50 py-2.5 last:border-0"
            >
              <div className="flex items-center gap-2.5">
                {/* Direction icon */}
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold ${
                    tx.direction === "shield"
                      ? "bg-purple-500/15 text-purple-400"
                      : "bg-accent-green/15 text-accent-green"
                  }`}
                >
                  {tx.direction === "shield" ? "\u2191" : "\u2193"}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium capitalize text-foreground">
                      {tx.direction}
                    </span>
                    <span className="font-tabular text-[11px] text-muted">
                      {tx.displayAmount} {tx.tokenSymbol}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted">
                    <RelativeTime timestamp={tx.createdAt} />
                    {tx.txHash && (
                      <a
                        href={tx.explorerUrl || `https://sepolia.basescan.org/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-purple-400 hover:text-purple-300"
                      >
                        {tx.txHash.slice(0, 8)}...
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <StatusBadge status={tx.status} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

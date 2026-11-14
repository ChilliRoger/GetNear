"use client";

import { useEffect, useState } from "react";

interface RateStats {
  quoteRate: number;
  refRate: number;
  devBps: number;
}

/** Slim live-rate strip. Shows "unavailable" instead of invented numbers when the oracle is down. */
export function RateBar() {
  const [stats, setStats] = useState<RateStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/oracle/prices/current");
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const p = data["USDC/EURe"];
        if (!p || !mounted) return;
        setStats({ quoteRate: p.quotePrice, refRate: p.refPrice, devBps: p.deviationBps ?? 0 });
        setFailed(false);
      } catch {
        if (mounted) setFailed(true);
      }
    };
    load();
    const id = setInterval(load, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const dev = stats?.devBps ?? 0;
  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 text-xs text-muted">
        <span className="font-semibold text-foreground">USDC → EURe</span>
        {stats ? (
          <>
            <span>
              1Click dry quote <b className="text-foreground">{stats.quoteRate.toFixed(4)}</b>
            </span>
            <span>
              ECB reference <b className="text-foreground">{stats.refRate.toFixed(4)}</b>
            </span>
            <span>
              Deviation{" "}
              <b className={Math.abs(dev) <= 120 ? "text-brand" : "text-warn"}>
                {dev > 0 ? "+" : ""}
                {dev} bps
              </b>
            </span>
          </>
        ) : (
          <span>{failed ? "Live rates unavailable (oracle offline)" : "Loading live rates…"}</span>
        )}
        <span className="ml-auto">Indicative only · FX fill is simulated</span>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

interface TickerStats {
  quoteRate: number;
  refRate: number;
  devBps: number;
}

export function AsciiTickerBar() {
  const [stats, setStats] = useState<TickerStats>({
    quoteRate: 0.9035,
    refRate: 0.9048,
    devBps: -14,
  });

  useEffect(() => {
    let mounted = true;
    const fetchLatest = async () => {
      try {
        const res = await fetch("/api/oracle/prices/current");
        if (!res.ok) return;
        const data = await res.json();
        const pairData = data["USDC/EURe"];
        if (pairData && mounted) {
          setStats({
            quoteRate: pairData.quotePrice || 0.9035,
            refRate: pairData.refPrice || 0.9048,
            devBps: pairData.deviationBps ?? -14,
          });
        }
      } catch {
        // use fallback initial
      }
    };
    fetchLatest();
    const interval = setInterval(fetchLatest, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const items = [
    { label: "PAIR", val: "USDC → EURe" },
    { label: "1CLICK DRY-QUOTE", val: stats.quoteRate.toFixed(4) },
    { label: "ECB REF", val: stats.refRate.toFixed(4) },
    {
      label: "AGENT DEV",
      val: `${stats.devBps > 0 ? "+" : ""}${stats.devBps} bps`,
      color: Math.abs(stats.devBps) <= 120 ? "text-[#00ec97]" : "text-amber-400",
    },
    { label: "CONTRACT", val: "fx-budget.chilliroger-operator.testnet" },
    { label: "SPUTNIK DAO", val: "chilliroger-dao.sputnik-v2.testnet (2-of-3)" },
    { label: "SETTLEMENT", val: "CALLBACK-VERIFIED ON-CHAIN" },
    { label: "AGENT STATUS", val: "ONLINE (Autonomous TWAP)" },
  ];

  return (
    <div className="border-y border-border bg-[#0e1017] overflow-hidden select-none py-1.5 font-mono text-[11px]">
      <div className="animate-ticker items-center gap-6 whitespace-nowrap">
        {/* Render twice for seamless loop */}
        {[...items, ...items].map((it, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-muted/70 tracking-wider">[{it.label}]</span>
            <span className={`font-semibold ${it.color || "text-foreground"}`}>
              {it.val}
            </span>
            <span className="text-border">::</span>
          </div>
        ))}
      </div>
    </div>
  );
}

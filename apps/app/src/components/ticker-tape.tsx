"use client";

import { useEffect, useRef } from "react";
import { useFeed, useOraclePrice } from "@/lib/live";

interface Item {
  key: string;
  label: string;
  value: string;
  tone?: "up" | "down" | "muted";
  suffix?: string;
}

/** Slim market tape under the header. Every number is live; "--" when the source is down. */
export function TickerTape() {
  const { data: price } = useOraclePrice();
  const { data: feed } = useFeed();
  const prev = useRef<number | null>(null);
  const dir = useRef<"up" | "down" | "muted">("muted");

  const p = price?.["USDC/EURe"];
  useEffect(() => {
    if (!p) return;
    if (prev.current !== null && p.quotePrice !== prev.current) dir.current = p.quotePrice > prev.current ? "up" : "down";
    prev.current = p.quotePrice;
  }, [p]);

  const dev = p?.deviationBps;
  const lastScore = feed?.events.find((e) => typeof e.score === "number" && e.tag !== "SETTLED");

  const items: Item[] = [
    { key: "pair", label: "USDC/EURe", value: p ? p.quotePrice.toFixed(4) : "--", tone: dir.current, suffix: dir.current === "up" ? "▲" : dir.current === "down" ? "▼" : "" },
    { key: "ecb", label: "ECB", value: p ? p.refPrice.toFixed(4) : "--" },
    {
      key: "dev",
      label: "Deviation",
      value: typeof dev === "number" ? `${dev > 0 ? "+" : ""}${dev} bps` : "--",
      tone: typeof dev === "number" ? (Math.abs(dev) <= 120 ? "up" : "down") : "muted",
    },
    { key: "score", label: "Timing score", value: lastScore ? String(lastScore.score) : "--" },
    { key: "agent", label: "Agent", value: feed?.online ? `Online · ${feed.agent?.strategyMode ?? "score"}` : "Offline", tone: feed?.online ? "up" : "muted" },
    { key: "chunks", label: "Chunks settled", value: feed?.online ? String(feed.agent?.totalChunksExecuted ?? 0) : "--" },
    { key: "net", label: "Network", value: "NEAR testnet" },
    { key: "fx", label: "FX leg", value: "Simulated", tone: "muted" },
  ];

  const row = (sfx: string) =>
    items.map((it) => (
      <div key={it.key + sfx} className="flex shrink-0 items-center gap-2 border-r border-border px-5">
        <span className="text-muted">{it.label}</span>
        <span className={`num font-medium ${it.tone === "up" ? "text-ok" : it.tone === "down" ? "text-danger" : "text-foreground"}`}>
          {it.value}
          {it.suffix ? <span className="ml-1 text-[9px]">{it.suffix}</span> : null}
        </span>
      </div>
    ));

  return (
    <div className="ticker overflow-hidden border-t border-border bg-surface/60 text-[11px]" aria-label="Live market and agent ticker">
      <div className="ticker-track py-1.5">
        <div className="flex">{row("a")}</div>
        <div className="flex" aria-hidden="true">{row("b")}</div>
      </div>
    </div>
  );
}

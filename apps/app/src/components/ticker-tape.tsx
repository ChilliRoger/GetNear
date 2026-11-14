"use client";

import { useEffect, useRef } from "react";
import { useFeed, useOraclePrice } from "@/lib/live";

interface Item {
  key: string;
  label: string;
  value: string;
  delta?: { text: string; dir: "up" | "down" | "flat" };
}

/** Stock-ticker style tape: dashed rules, ▲▼ glyphs, every number live (or "--" when a source is down). */
export function TickerTape() {
  const { data: price } = useOraclePrice();
  const { data: feed } = useFeed();
  const prev = useRef<number | null>(null);
  const dir = useRef<"up" | "down" | "flat">("flat");

  const p = price?.["USDC/EURe"];
  useEffect(() => {
    if (!p) return;
    if (prev.current !== null) dir.current = p.quotePrice > prev.current ? "up" : p.quotePrice < prev.current ? "down" : dir.current;
    prev.current = p.quotePrice;
  }, [p]);

  const dev = p?.deviationBps;
  const lastScore = feed?.events.find((e) => typeof e.score === "number" && e.tag !== "SETTLED");

  const items: Item[] = [
    { key: "pair", label: "USDC/EURe", value: p ? p.quotePrice.toFixed(4) : "--", delta: p ? { text: dir.current === "up" ? "▲" : dir.current === "down" ? "▼" : "•", dir: dir.current } : undefined },
    { key: "ecb", label: "ECB REF", value: p ? p.refPrice.toFixed(4) : "--" },
    {
      key: "dev",
      label: "DEVIATION",
      value: typeof dev === "number" ? `${dev > 0 ? "+" : ""}${dev} bps` : "--",
      delta: typeof dev === "number" ? { text: Math.abs(dev) <= 120 ? "within limit" : "over limit", dir: Math.abs(dev) <= 120 ? "up" : "down" } : undefined,
    },
    { key: "score", label: "TIMING SCORE", value: lastScore ? `${lastScore.score} ${lastScore.tag === "WAIT" || lastScore.text.includes("WAIT") ? "WAIT" : "EXECUTE"}` : "--" },
    { key: "agent", label: "AGENT", value: feed?.online ? `ONLINE · ${(feed.agent?.strategyMode ?? "score").toUpperCase()}` : "OFFLINE" },
    { key: "chunks", label: "CHUNKS SETTLED", value: feed?.online ? String(feed.agent?.totalChunksExecuted ?? 0) : "--" },
    { key: "net", label: "NETWORK", value: "NEAR TESTNET" },
    { key: "fx", label: "FX LEG", value: "SIMULATED" },
  ];

  const row = (suffix: string) =>
    items.map((it) => (
      <div key={it.key + suffix} className="flex shrink-0 items-center gap-3 px-6">
        <span className="text-muted">{it.label}</span>
        <span className="font-semibold text-foreground">{it.value}</span>
        {it.delta && (
          <span className={it.delta.dir === "up" ? "text-ok" : it.delta.dir === "down" ? "text-danger" : "text-muted"}>{it.delta.text}</span>
        )}
        <span className="text-border-bright">│</span>
      </div>
    ));

  return (
    <div className="ticker overflow-hidden border-y border-dashed border-border-bright bg-background/80 text-[11px] uppercase tracking-[0.14em]" aria-label="Live market and agent ticker">
      <div className="ticker-track py-2">
        <div className="flex">{row("a")}</div>
        <div className="flex" aria-hidden="true">{row("b")}</div>
      </div>
    </div>
  );
}

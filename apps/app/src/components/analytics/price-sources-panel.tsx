"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/card";

interface PriceSourceEntry {
  source: string;
  price: number;
  timestamp: number;
}

interface PriceComparison {
  pair: string;
  sources: PriceSourceEntry[];
  divergence_bps: number;
  average_24h: number | null;
  current_avg: number;
}

/** Raw shape returned by GET /api/oracle/api/prices/comparison */
interface RawPriceComparison {
  chainlink: { price: number; updatedAt: number };
  fynd: { price: number; updatedAt: number };
  uniswap: { price: number; updatedAt: number };
  divergenceBps: number;
  avg24h: number;
  currentVsAvgPct: number;
}

/** Transform the flat server response into PriceComparison[] for the UI. */
function transformPrices(raw: RawPriceComparison): PriceComparison[] {
  const sources = (["chainlink", "fynd", "uniswap"] as const)
    .filter((k) => raw[k] && raw[k].price > 0)
    .map((k) => ({
      source: k.charAt(0).toUpperCase() + k.slice(1),
      price: raw[k].price,
      timestamp: raw[k].updatedAt,
    }));

  const prices = sources.map((s) => s.price);
  const currentAvg =
    prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

  return [
    {
      pair: "EURC/USD",
      sources,
      divergence_bps: raw.divergenceBps,
      average_24h: raw.avg24h || null,
      current_avg: currentAvg,
    },
  ];
}

function divColor(bps: number): string {
  if (bps < 10) return "text-accent-green";
  if (bps < 50) return "text-accent-amber";
  return "text-accent-red";
}

function divDotColor(bps: number): string {
  if (bps < 10) return "bg-accent-green";
  if (bps < 50) return "bg-accent-amber";
  return "bg-accent-red";
}

export function PriceSourcesPanel() {
  const [data, setData] = useState<PriceComparison[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch("/api/oracle/api/prices/comparison");
        if (!res.ok) throw new Error("Endpoint unavailable");
        const json: RawPriceComparison = await res.json();
        if (activeRef.current) {
          setData(transformPrices(json));
          setError(null);
        }
      } catch {
        if (activeRef.current) setError("Endpoint unavailable");
      } finally {
        if (activeRef.current) setLoading(false);
        if (activeRef.current) {
          timeoutId = setTimeout(poll, 15000);
        }
      }
    };
    poll();
    return () => {
      activeRef.current = false;
      clearTimeout(timeoutId);
    };
  }, []);
  if (error && !data) {
    return (
      <Card title="Price Sources" subtitle="Oracle comparison">
        <p className="text-sm text-accent-amber">Endpoint unavailable</p>
      </Card>
    );
  }

  if (loading && !data) {
    return (
      <Card title="Price Sources" subtitle="Oracle comparison">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-border" />
          ))}
        </div>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card title="Price Sources" subtitle="Oracle comparison">
        <p className="text-sm text-muted">No comparison data yet.</p>
      </Card>
    );
  }

  return (
    <Card title="Price Sources" subtitle="Oracle comparison">
      <div className="space-y-3">
        {data.map((comp) => {
          const avgDiffPct =
            comp.average_24h != null && comp.average_24h > 0
              ? ((comp.current_avg - comp.average_24h) / comp.average_24h) * 100
              : null;

          return (
            <div
              key={comp.pair}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {comp.pair}
                </span>
                <span
                  className={`text-xs font-bold tabular-nums ${divColor(comp.divergence_bps)}`}
                >
                  <span
                    className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${divDotColor(comp.divergence_bps)}`}
                  />
                  {comp.divergence_bps.toFixed(1)} bps
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                {comp.sources.map((src) => (
                  <div key={src.source} className="flex flex-col">
                    <span className="text-[0.65rem] uppercase tracking-wider text-muted">
                      {src.source}
                    </span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {src.price.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>

              {avgDiffPct != null && (
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[0.7rem]">
                  <span className="text-muted">
                    24h avg: {comp.average_24h!.toFixed(4)}
                  </span>
                  <span
                    className={
                      avgDiffPct > 0
                        ? "text-accent-green"
                        : avgDiffPct < -0.1
                          ? "text-accent-red"
                          : "text-muted"
                    }
                  >
                    {avgDiffPct > 0 ? "+" : ""}
                    {avgDiffPct.toFixed(3)}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

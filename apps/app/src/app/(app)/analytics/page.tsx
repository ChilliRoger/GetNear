"use client";

import { useMemo } from "react";
import { Card } from "@/components/card";
import { RateChart } from "@/components/rate-chart";
import { LiveFeed } from "@/components/live-feed";
import { Meter, Spark, Stat } from "@/components/ascii-viz";
import { Reveal } from "@/components/reveal";
import { useHistory, useLiveJson, useOraclePrice } from "@/lib/live";

interface StrategyRow {
  id: number;
  timestamp: number;
  order_id: string | null;
  score: number;
  action: string;
  reason: string;
  price_score: number | null;
  divergence_score: number | null;
  urgency_score: number | null;
  chunk_amount: string | null;
  deviation_bps: number | null;
}

export default function AnalyticsPage() {
  const { data: price } = useOraclePrice();
  const { data: hist } = useHistory(24);
  const { data: rows } = useLiveJson<StrategyRow[]>("/api/oracle/api/strategy/decisions?limit=40", 10_000);

  const p = price?.["USDC/EURe"];
  const pts = useMemo(() => hist?.points ?? [], [hist]);

  const devStats = useMemo(() => {
    const d = pts.map((x) => x.deviationBps).filter((v): v is number => typeof v === "number");
    if (!d.length) return null;
    return { min: Math.min(...d), max: Math.max(...d), avg: d.reduce((a, b) => a + b, 0) / d.length, series: d.slice(-48) };
  }, [pts]);

  const scored = (rows ?? []).filter((r) => r.order_id !== null);
  const latest = scored[0] ?? (rows ?? [])[0];
  const scoreSeries = [...(rows ?? [])].reverse().map((r) => r.score);
  const score = latest?.score ?? 0;

  return (
    <div className="space-y-10">
      <Reveal>
        <p className="eyebrow">Analytics</p>
        <h1 className="mt-2 text-2xl font-bold uppercase tracking-tight md:text-3xl">Market &amp; strategy</h1>
        <p className="mt-2 max-w-2xl text-xs leading-6 text-muted">
          Live 1Click dry quotes against the ECB reference, and the timing score the agent uses to decide when to pay a chunk. All quotes are
          indicative; the FX leg is simulated.
        </p>
      </Reveal>

      <Reveal>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="1Click quote" value={p ? p.quotePrice.toFixed(4) : "--"} caption="EURe per USDC" tone="brand" />
          <Stat label="ECB reference" value={p ? p.refPrice.toFixed(4) : "--"} caption="EUR per USD" />
          <Stat
            label="Deviation now"
            value={typeof p?.deviationBps === "number" ? `${p.deviationBps > 0 ? "+" : ""}${p.deviationBps} bps` : "--"}
            caption="negative = quote below ECB"
            tone={typeof p?.deviationBps === "number" && Math.abs(p.deviationBps) > 120 ? "warn" : "ok"}
          />
          <Stat
            label="24h average dev."
            value={devStats ? `${devStats.avg.toFixed(1)} bps` : "--"}
            caption={devStats ? `range ${devStats.min} … ${devStats.max} bps` : "collecting samples"}
          />
        </div>
      </Reveal>

      <Reveal>
        <Card title="USDC → EURe price history" subtitle="Dry quote (cyan) vs ECB reference (dashed). Hover for exact values.">
          <RateChart height={340} />
        </Card>
      </Reveal>

      <div className="grid gap-10 lg:grid-cols-2">
        <Reveal>
          <Card title="Timing score" subtitle="40% price vs average · 20% quote vs ECB · 40% deadline urgency. ≥70 pays a chunk, ≥85 pays double." badge={{ label: latest?.action ?? "WAIT", color: latest?.action === "EXECUTE" ? "green" : "amber" }}>
            <div className="space-y-5 text-sm">
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-muted">Composite</span>
                  <span className="text-3xl font-bold text-foreground">{score}</span>
                </div>
                <Meter value={score} width={34} threshold={70} tone={score >= 70 ? "ok" : "warn"} />
              </div>
              <div className="space-y-3 border-t border-dashed border-border-bright pt-4 text-xs">
                {[
                  ["Price vs avg", latest?.price_score],
                  ["Quote vs ECB", latest?.divergence_score],
                  ["Urgency", latest?.urgency_score],
                ].map(([label, v]) => (
                  <div key={label as string} className="flex items-center justify-between gap-3">
                    <span className="w-28 text-muted">{label}</span>
                    <Meter value={typeof v === "number" ? v : 0} width={22} />
                    <span className="w-8 text-right">{typeof v === "number" ? v : "--"}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-dashed border-border-bright pt-4">
                <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-muted">Score history</div>
                <Spark values={scoreSeries} className="text-lg text-brand" />
              </div>
              <p className="text-xs leading-6 text-muted">{latest?.reason ?? "Waiting for the first strategy evaluation."}</p>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={120}>
          <Card title="Live agent feed" subtitle="On-chain agent decisions and strategy evaluations, newest first.">
            <LiveFeed rows={11} />
          </Card>
        </Reveal>
      </div>

      <Reveal>
        <Card title="Deviation, last 48 samples" subtitle="Absolute distance between quote and ECB. Shorter bars = tighter quotes.">
          <Spark values={(devStats?.series ?? []).map((v) => Math.abs(v))} className="block text-3xl text-info" />
        </Card>
      </Reveal>
    </div>
  );
}

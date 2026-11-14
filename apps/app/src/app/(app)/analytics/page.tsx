"use client";

import { useMemo } from "react";
import { Card } from "@/components/card";
import { RateChart } from "@/components/rate-chart";
import { LiveFeed } from "@/components/live-feed";
import { KpiStrip, Meter, Spark } from "@/components/ascii-viz";
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
    return { min: Math.min(...d), max: Math.max(...d), avg: d.reduce((a, b) => a + b, 0) / d.length, series: d.slice(-60) };
  }, [pts]);

  const all = rows ?? [];
  const latest = all.find((r) => r.order_id !== null) ?? all[0];
  const score = latest?.score ?? 0;
  const scoreSeries = [...all].reverse().map((r) => r.score);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-xs text-muted">Live 1Click dry quotes against the ECB reference, and the timing score that gates each chunk. Indicative only; the FX leg is simulated.</p>
        </div>
      </div>

      <KpiStrip
        items={[
          { label: "1Click quote", value: p ? p.quotePrice.toFixed(4) : "--", sub: "EURe per USDC", tone: "brand" },
          { label: "ECB reference", value: p ? p.refPrice.toFixed(4) : "--", sub: "EUR per USD" },
          {
            label: "Deviation now",
            value: typeof p?.deviationBps === "number" ? `${p.deviationBps > 0 ? "+" : ""}${p.deviationBps} bps` : "--",
            sub: "negative = quote below ECB",
            tone: typeof p?.deviationBps === "number" && Math.abs(p.deviationBps) > 120 ? "warn" : "ok",
          },
          { label: "24h avg deviation", value: devStats ? `${devStats.avg.toFixed(1)} bps` : "--", sub: devStats ? `range ${devStats.min} to ${devStats.max}` : "collecting samples" },
          { label: "Timing score", value: score, sub: latest?.action === "EXECUTE" ? "executing" : "holding capital", tone: score >= 70 ? "ok" : "warn" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-12">
        <Reveal className="lg:col-span-8">
          <Card title="USDC → EURe" subtitle="1Click dry quote vs ECB reference · hover for exact values" className="h-full">
            <RateChart height={320} />
          </Card>
        </Reveal>

        <Reveal delay={80} className="lg:col-span-4">
          <Card title="Timing score" subtitle="≥70 pays a chunk · ≥85 pays double" badge={{ label: latest?.action ?? "WAIT", color: latest?.action === "EXECUTE" ? "green" : "amber" }} className="h-full">
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-xs text-muted">Composite</span>
                  <span className="num text-3xl font-semibold leading-none">{score}</span>
                </div>
                <Meter value={score} threshold={70} tone={score >= 70 ? "ok" : "warn"} />
                <div className="mt-1 flex justify-between text-[10px] text-muted">
                  <span>0</span>
                  <span>70 execute</span>
                  <span>100</span>
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-4 text-xs">
                {(
                  [
                    ["Price vs average", "40%", latest?.price_score],
                    ["Quote vs ECB", "20%", latest?.divergence_score],
                    ["Deadline urgency", "40%", latest?.urgency_score],
                  ] as const
                ).map(([label, weight, v]) => (
                  <div key={label}>
                    <div className="mb-1 flex justify-between">
                      <span className="text-muted">
                        {label} <span className="text-border-bright">· {weight}</span>
                      </span>
                      <span className="num font-medium">{typeof v === "number" ? v : "--"}</span>
                    </div>
                    <Meter value={typeof v === "number" ? v : 0} />
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-4">
                <div className="mb-1.5 text-xs text-muted">Score history</div>
                <Spark values={scoreSeries} color="rgb(34 197 94)" />
              </div>
              <p className="text-xs leading-5 text-muted">{latest?.reason ?? "Waiting for the first strategy evaluation."}</p>
            </div>
          </Card>
        </Reveal>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Reveal className="lg:col-span-7">
          <Card title="Live agent feed" subtitle="On-chain agent decisions and strategy evaluations" className="h-full">
            <LiveFeed rows={10} />
          </Card>
        </Reveal>
        <Reveal delay={80} className="space-y-4 lg:col-span-5">
          <Card title="Deviation, last 60 samples" subtitle="Absolute distance between quote and ECB: shorter is tighter">
            <Spark values={(devStats?.series ?? []).map((v) => Math.abs(v))} height={120} color="rgb(190 200 195)" />
            <dl className="mt-4 grid grid-cols-3 divide-x divide-border border-t border-border pt-3 text-xs">
              {[
                ["Min", devStats ? `${devStats.min} bps` : "--"],
                ["Average", devStats ? `${devStats.avg.toFixed(1)} bps` : "--"],
                ["Max", devStats ? `${devStats.max} bps` : "--"],
              ].map(([l, v]) => (
                <div key={l} className="px-3 first:pl-0">
                  <dt className="text-muted">{l}</dt>
                  <dd className="num mt-0.5 font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="How the timing score works" subtitle="Why the agent waits or pays">
            <ol className="space-y-3 text-xs leading-5 text-muted">
              <li>
                <b className="text-foreground">Price vs average (40%).</b> A quote above its recent average scores higher.
              </li>
              <li>
                <b className="text-foreground">Quote vs ECB (20%).</b> A quote at or above the ECB reference scores 100; it falls as the adverse deviation approaches the order limit.
              </li>
              <li>
                <b className="text-foreground">Deadline urgency (40%).</b> Rises with the square of elapsed time, so the agent always finishes before the deadline.
              </li>
              <li className="border-t border-border pt-3">
                Score <b className="num text-ok">70+</b> pays a normal chunk, <b className="num text-ok">85+</b> pays double, below 70 it waits.
                Hard guards (deviation limit, interval, on-chain caps) always apply. This is a timing heuristic, not a promise of better rates.
              </li>
            </ol>
          </Card>
        </Reveal>
      </div>
    </div>
  );
}

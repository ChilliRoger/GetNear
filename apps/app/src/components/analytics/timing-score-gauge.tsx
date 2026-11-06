"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/card";

interface TimingBreakdownComponent {
  name: string;
  raw_score: number;
  weight: number;
  weighted_score: number;
}

/** Raw breakdown shape from the oracle: an object, not an array. */
interface RawScoreBreakdown {
  priceScore: number;
  divergenceScore: number;
  urgencyScore: number;
}

interface TimingStrategy {
  score: number;
  action: "SWAP" | "WAIT";
  reason: string;
  breakdown?: TimingBreakdownComponent[];
}

/** Raw shape returned by GET /api/oracle/api/strategy/next */
interface RawTimingStrategy {
  score: number;
  action: "SWAP" | "WAIT";
  reason: string;
  breakdown?: RawScoreBreakdown;
}

/** Transform the oracle's breakdown object into the array the UI expects. */
function transformStrategy(raw: RawTimingStrategy): TimingStrategy {
  let breakdown: TimingBreakdownComponent[] | undefined;
  if (raw.breakdown) {
    breakdown = [
      {
        name: "price_vs_avg",
        raw_score: raw.breakdown.priceScore,
        weight: 0.4,
        weighted_score: raw.breakdown.priceScore * 0.4,
      },
      {
        name: "source_divergence",
        raw_score: raw.breakdown.divergenceScore,
        weight: 0.2,
        weighted_score: raw.breakdown.divergenceScore * 0.2,
      },
      {
        name: "urgency",
        raw_score: raw.breakdown.urgencyScore,
        weight: 0.4,
        weighted_score: raw.breakdown.urgencyScore * 0.4,
      },
    ];
  }
  return {
    score: raw.score,
    action: raw.action,
    reason: raw.reason,
    breakdown,
  };
}

function scoreColor(score: number): string {
  if (score > 70) return "text-accent-green";
  if (score >= 40) return "text-accent-amber";
  return "text-accent-red";
}

function scoreBg(score: number): string {
  if (score > 70) return "bg-accent-green";
  if (score >= 40) return "bg-accent-amber";
  return "bg-accent-red";
}

const COMPONENT_LABELS: Record<string, { label: string; weight: string }> = {
  price_vs_avg: { label: "Price vs Avg", weight: "40%" },
  source_divergence: { label: "Source Divergence", weight: "20%" },
  urgency: { label: "Urgency", weight: "40%" },
};

export function TimingScoreGauge() {
  const [data, setData] = useState<TimingStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch("/api/oracle/api/strategy/next");
        if (!res.ok) throw new Error("Endpoint unavailable");
        const json: RawTimingStrategy = await res.json();
        if (activeRef.current) {
          setData(transformStrategy(json));
          setError(null);
        }
      } catch {
        if (activeRef.current) setError("Waiting for oracle strategy endpoint...");
      } finally {
        if (activeRef.current) setLoading(false);
        if (activeRef.current) {
          timeoutId = setTimeout(poll, 10000);
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
      <Card title="Timing Score" subtitle="Strategy engine">
        <p className="text-sm text-accent-amber">{error}</p>
      </Card>
    );
  }

  if (loading && !data) {
    return (
      <Card title="Timing Score" subtitle="Strategy engine">
        <div className="flex animate-pulse items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-border" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded bg-border" />
            <div className="h-3 w-2/3 rounded bg-border" />
          </div>
        </div>
      </Card>
    );
  }

  if (!data) return null;

  const score = data.score ?? 0;
  const hasBreakdown = data.breakdown && data.breakdown.length > 0;
  const isSwap = data.action === "SWAP";

  return (
    <Card
      title="Timing Score"
      subtitle="Strategy engine"
      badge={{
        label: data.action,
        color: isSwap ? "green" : "amber",
      }}
    >
      <div className="mb-4 flex items-center gap-6">
        {/* SVG ring gauge */}
        <div className="relative flex items-center justify-center">
          <svg className="h-24 w-24" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="6"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(score / 100) * 264} 264`}
              transform="rotate(-90 50 50)"
              className={scoreColor(score)}
            />
          </svg>
          <span
            className={`absolute text-2xl font-bold tabular-nums ${scoreColor(score)}`}
          >
            {score}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-3">
            <span
              className={`inline-block rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wider ${
                isSwap
                  ? "bg-accent-green/20 text-accent-green"
                  : "bg-accent-amber/20 text-accent-amber"
              }`}
            >
              {data.action}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-muted">{data.reason}</p>
        </div>
      </div>

      {/* Breakdown bars */}
      {hasBreakdown && (
        <div className="space-y-2.5 border-t border-border pt-3">
          {data.breakdown!.map((comp) => {
            const meta = COMPONENT_LABELS[comp.name] || {
              label: comp.name,
              weight: `${(comp.weight * 100).toFixed(0)}%`,
            };
            const pct = Math.min(100, Math.max(0, comp.raw_score));
            return (
              <div key={comp.name}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted">
                    {meta.label}{" "}
                    <span className="opacity-60">({meta.weight})</span>
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {comp.raw_score.toFixed(0)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-border">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${scoreBg(comp.raw_score)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

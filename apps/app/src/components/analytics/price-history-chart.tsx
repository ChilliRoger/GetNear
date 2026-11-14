"use client";

import { useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/card";

interface PricePoint {
  timestamp: number;
  chainlink: number;
  fynd: number | null;
  divergence_pct: number | null;
}

const TIME_RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
];

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const tooltipStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: "0.8rem",
};

export function PriceHistoryChart() {
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const pair = "USDC/EURe";

  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/oracle/prices/history?pair=${encodeURIComponent(pair)}&hours=${hours}`
        );
        if (!res.ok) return;
        const data = await res.json();
        const rawPoints = Array.isArray(data.points) ? data.points : [];
        const mapped = rawPoints.map((p: any) => ({
          timestamp: p.timestamp,
          chainlink: p.refPrice ?? p.chainlink ?? 0,
          fynd: p.quotePrice ?? p.fynd ?? null,
          divergence_pct:
            p.deviationBps != null
              ? Math.abs(p.deviationBps) / 100
              : p.divergence_pct ?? null,
        }));
        if (activeRef.current) setHistory(mapped);
      } catch (err) {
        console.error("Failed to fetch price history:", err);
      } finally {
        if (activeRef.current) setLoading(false);
        if (activeRef.current) {
          timeoutId = setTimeout(poll, 30000);
        }
      }
    };
    setLoading(true);
    poll();
    return () => {
      activeRef.current = false;
      clearTimeout(timeoutId);
    };
  }, [hours]);

  const formatter = hours <= 6 ? formatTime : formatDateTime;
  const hasFynd = history.some((p) => p.fynd != null);
  const hasDivergence = history.some((p) => p.divergence_pct != null);

  return (
    <div className="space-y-3">
      {/* Time range selector */}
      <div className="flex gap-1">
        {TIME_RANGES.map((r) => (
          <button
            key={r.hours}
            className={`flex-1 rounded-md border py-1.5 text-xs font-semibold transition-all ${
              hours === r.hours
                ? "border-accent-blue bg-accent-blue/15 text-white"
                : "border-border bg-surface text-muted hover:text-foreground"
            }`}
            onClick={() => setHours(r.hours)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Price history chart */}
      <Card title={`${pair} Price History`} subtitle="Multi-source timeline">
        {loading && history.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted">
            Loading price data...
          </div>
        ) : history.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted">
            No data yet for {pair}. Waiting for oracle recording.
          </div>
        ) : (
          <div className="-mx-2">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history}>
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatter}
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                  width={60}
                  tickFormatter={(v: number) => v.toFixed(4)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(ts: number) => formatDateTime(ts)}
                  formatter={(value: number, name: string) => [
                    value.toFixed(6),
                    name === "chainlink" ? "ECB Ref Rate" : "1Click Dry Quote",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="chainlink"
                  stroke="var(--color-accent)"
                  dot={false}
                  strokeWidth={2}
                />
                {hasFynd && (
                  <Line
                    type="monotone"
                    dataKey="fynd"
                    stroke="var(--color-ok)"
                    dot={false}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-2 flex items-center gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded bg-accent-blue" />
            ECB Reference (Frankfurter)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded bg-accent-green" style={{ borderTop: "1px dashed" }} />
            1Click Dry-Quote (Indicative)
          </span>
        </div>
      </Card>

      {/* Divergence chart */}
      {hasDivergence && history.length > 0 && (
        <Card title={`Divergence (${pair})`} subtitle="Source price divergence %">
          <div className="-mx-2">
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart
                data={history.filter((p) => p.divergence_pct != null)}
              >
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatter}
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                />
                <YAxis
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                  width={40}
                  tickFormatter={(v: number) => `${v.toFixed(2)}%`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(ts: number) => formatDateTime(ts)}
                  formatter={(value: number) => [
                    `${value.toFixed(3)}%`,
                    "Divergence",
                  ]}
                />
                <ReferenceLine
                  y={0.1}
                  stroke="var(--color-danger)"
                  strokeDasharray="3 3"
                  strokeOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="divergence_pct"
                  stroke="var(--color-warn)"
                  fill="var(--color-warn)"
                  fillOpacity={0.15}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Red dashed line = 0.1% threshold
          </p>
        </Card>
      )}
    </div>
  );
}

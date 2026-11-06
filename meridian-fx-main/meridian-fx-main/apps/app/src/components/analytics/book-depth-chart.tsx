"use client";

import { useState, useCallback, useMemo } from "react";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/card";

const TOKENS = ["WETH", "USDC", "DAI", "cbBTC", "EURC"] as const;

interface BookLevel {
  size: number;
  base_amount?: number;
  quote_amount?: number;
  price: number;
  price_impact_bps: number | null;
}

interface BookResponse {
  base: string;
  quote: string;
  bids: BookLevel[];
  asks: BookLevel[];
}

interface ChartRow {
  price: number;
  bidCumSize: number | null;
  askCumSize: number | null;
}

const ZOOM_LEVELS = [
  { label: "0.1%", pct: 0.001 },
  { label: "0.5%", pct: 0.005 },
  { label: "1%", pct: 0.01 },
  { label: "5%", pct: 0.05 },
  { label: "10%", pct: 0.1 },
];

function buildChartData(
  bids: BookLevel[],
  asks: BookLevel[]
): { rows: ChartRow[]; midPrice: number | null } {
  if (bids.length === 0 && asks.length === 0)
    return { rows: [], midPrice: null };

  const sortedBids = [...bids].sort((a, b) => b.price - a.price);
  const sortedAsks = [...asks].sort((a, b) => a.price - b.price);

  const bestBid = sortedBids.length > 0 ? sortedBids[0].price : null;
  const bestAsk = sortedAsks.length > 0 ? sortedAsks[0].price : null;
  const midPrice =
    bestBid != null && bestAsk != null
      ? (bestBid + bestAsk) / 2
      : bestBid ?? bestAsk ?? null;

  const bidRows: ChartRow[] = [];
  let cumBid = 0;
  for (const b of sortedBids) {
    cumBid += b.size;
    bidRows.push({ price: b.price, bidCumSize: cumBid, askCumSize: null });
  }
  bidRows.reverse();

  const askRows: ChartRow[] = [];
  let cumAsk = 0;
  for (const a of sortedAsks) {
    cumAsk += a.size;
    askRows.push({ price: a.price, bidCumSize: null, askCumSize: cumAsk });
  }

  return { rows: [...bidRows, ...askRows], midPrice };
}

function formatPrice(v: number): string {
  if (v >= 1000) return v.toFixed(2);
  if (v >= 1) return v.toFixed(4);
  return v.toFixed(6);
}

function formatSize(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

const tooltipStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: "0.8rem",
};

export function BookDepthChart() {
  const [base, setBase] = useState("EURC");
  const [quote, setQuote] = useState("USDC");
  const [data, setData] = useState<BookResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomIdx, setZoomIdx] = useState(2); // default 1%

  const fetchBook = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(
        `/api/oracle/depth/book?base=${base}&quote=${quote}`
      );
      if (!res.ok) {
        if (res.status === 0 || res.status >= 502)
          throw new Error("Oracle server offline");
        throw new Error(`${res.status} ${res.statusText}`);
      }
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      if (e instanceof TypeError && e.message.includes("fetch")) {
        setError("Oracle server offline");
      } else {
        setError(
          e instanceof Error ? e.message : "Failed to fetch book depth"
        );
      }
    } finally {
      setLoading(false);
    }
  }, [base, quote]);

  const { rows, midPrice } = useMemo(() => {
    if (!data) return { rows: [], midPrice: null };
    return buildChartData(data.bids, data.asks);
  }, [data]);

  const zoomPct = ZOOM_LEVELS[zoomIdx].pct;
  const filteredRows = useMemo(() => {
    if (!midPrice || rows.length === 0) return rows;
    const lo = midPrice * (1 - zoomPct);
    const hi = midPrice * (1 + zoomPct);
    return rows.filter((r) => r.price >= lo && r.price <= hi);
  }, [rows, midPrice, zoomPct]);

  const hasChartData = rows.length > 0 && midPrice != null;

  const tableRows = useMemo(() => {
    if (!data) return [];
    const out: {
      side: "Bid" | "Ask";
      size: number;
      price: number;
      impact: number | null;
    }[] = [];
    for (const b of data.bids) {
      out.push({
        side: "Bid",
        size: b.size,
        price: b.price,
        impact: b.price_impact_bps,
      });
    }
    for (const a of data.asks) {
      out.push({
        side: "Ask",
        size: a.size,
        price: a.price,
        impact: a.price_impact_bps,
      });
    }
    return out;
  }, [data]);

  return (
    <div className="space-y-3">
      {/* Token pair selector */}
      <Card title="Order Book Depth" subtitle="Bid/ask step curves">
        <div className="mb-2 flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[0.7rem] uppercase tracking-wide text-muted">
              Base
            </label>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground outline-none transition-colors focus:border-accent-blue"
              value={base}
              onChange={(e) => {
                setBase(e.target.value);
                if (e.target.value === quote) {
                  const alt = TOKENS.find((t) => t !== e.target.value);
                  if (alt) setQuote(alt);
                }
              }}
            >
              {TOKENS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[0.7rem] uppercase tracking-wide text-muted">
              Quote
            </label>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground outline-none transition-colors focus:border-accent-blue"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
            >
              {TOKENS.filter((t) => t !== base).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          className="mt-3 w-full rounded-xl border-none bg-accent-blue py-3 text-[0.95rem] font-semibold text-white transition-colors hover:bg-accent-blue/80 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={fetchBook}
          disabled={loading}
        >
          {loading ? "Loading..." : "Fetch Book"}
        </button>
      </Card>

      {/* Error */}
      {error && (
        <Card title="Error">
          <p className="break-words text-sm text-accent-red">{error}</p>
        </Card>
      )}

      {/* Depth chart */}
      <Card
        title={`Depth Chart \u2014 ${base}/${quote}`}
        subtitle="Cumulative bid/ask size"
      >
        {/* Zoom controls */}
        <div className="mb-3 flex gap-1">
          {ZOOM_LEVELS.map((z, i) => (
            <button
              key={z.label}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all ${
                zoomIdx === i
                  ? "border-accent-blue bg-accent-blue text-white"
                  : "border-border bg-background text-muted hover:text-foreground"
              } disabled:cursor-not-allowed disabled:opacity-45`}
              onClick={() => setZoomIdx(i)}
              disabled={!hasChartData}
            >
              {z.label}
            </button>
          ))}
        </div>

        {hasChartData && filteredRows.length > 0 ? (
          <div className="-mx-2">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={filteredRows}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  strokeOpacity={0.5}
                />
                <XAxis
                  dataKey="price"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v: number) => formatPrice(v)}
                  label={{
                    value: `${quote} per ${base}`,
                    position: "insideBottom",
                    offset: -2,
                    fontSize: 10,
                    fill: "var(--color-muted)",
                  }}
                />
                <YAxis
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                  width={55}
                  tickFormatter={(v: number) => formatSize(v)}
                  label={{
                    value: "Cumulative Size",
                    angle: -90,
                    position: "insideLeft",
                    offset: 10,
                    fontSize: 10,
                    fill: "var(--color-muted)",
                  }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: string | number | (string | number)[], name: string) => {
                    if (value == null) return ["", ""];
                    const label =
                      name === "bidCumSize" ? "Bid Size" : "Ask Size";
                    return [formatSize(Number(value)), label];
                  }}
                  labelFormatter={(v: number) => `Price: ${formatPrice(v)}`}
                />
                <ReferenceLine
                  x={midPrice}
                  stroke="var(--color-muted)"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{
                    value: "Mid",
                    position: "top",
                    fontSize: 10,
                    fill: "var(--color-muted)",
                  }}
                />
                <Area
                  type="stepAfter"
                  dataKey="bidCumSize"
                  stroke="var(--color-ok)"
                  fill="var(--color-ok)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Area
                  type="stepAfter"
                  dataKey="askCumSize"
                  stroke="var(--color-danger)"
                  fill="var(--color-danger)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-background/60 px-4 py-10 text-center text-sm text-muted">
            {hasChartData
              ? "No levels in the current zoom window. Pick a wider zoom to see the chart."
              : "Fetch book data to view the depth chart and enable zoom."}
          </div>
        )}

        {midPrice && (
          <p className="mt-2 text-[11px] text-muted">
            Mid price: {formatPrice(midPrice)} {quote}/{base}
            {data && (
              <>
                {" "}
                &middot; {data.bids.length} bid levels &middot;{" "}
                {data.asks.length} ask levels
              </>
            )}
          </p>
        )}
      </Card>

      {/* Data table */}
      {tableRows.length > 0 && (
        <Card title="Book Data" subtitle="Raw bid/ask levels">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border-b border-border px-2 py-1.5 text-left text-[0.65rem] uppercase tracking-wide text-muted">
                    Side
                  </th>
                  <th className="border-b border-border px-2 py-1.5 text-left text-[0.65rem] uppercase tracking-wide text-muted">
                    Size
                  </th>
                  <th className="border-b border-border px-2 py-1.5 text-left text-[0.65rem] uppercase tracking-wide text-muted">
                    Price
                  </th>
                  <th className="border-b border-border px-2 py-1.5 text-left text-[0.65rem] uppercase tracking-wide text-muted">
                    Impact
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r, i) => {
                  const sideColor =
                    r.side === "Bid" ? "text-accent-green" : "text-accent-red";
                  const impactBps = r.impact ?? 0;
                  const impactColor =
                    impactBps < 50
                      ? "text-accent-green"
                      : impactBps < 200
                        ? "text-accent-amber"
                        : "text-accent-red";
                  return (
                    <tr key={i}>
                      <td
                        className={`border-b border-border px-2 py-2 font-semibold ${sideColor}`}
                      >
                        {r.side}
                      </td>
                      <td className="border-b border-border px-2 py-2 tabular-nums">
                        {r.size.toLocaleString()}
                      </td>
                      <td className="border-b border-border px-2 py-2 tabular-nums">
                        {formatPrice(r.price)}
                      </td>
                      <td
                        className={`border-b border-border px-2 py-2 tabular-nums ${impactColor}`}
                      >
                        {r.impact != null
                          ? `${(r.impact / 100).toFixed(2)}%`
                          : "---"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

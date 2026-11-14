"use client";

import { useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/card";

const TOKENS = [
  { symbol: "USDC", label: "USDC" },
  { symbol: "EURC", label: "EURC" },
  { symbol: "WETH", label: "WETH" },
  { symbol: "DAI", label: "DAI" },
  { symbol: "cbBTC", label: "cbBTC" },
];

interface DepthPoint {
  sell_amount: number;
  buy_amount: number;
  effective_price: number;
  price_impact_bps: number | null;
  gas_estimate: number;
}

const tooltipStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: "0.8rem",
};

export function DepthChart() {
  const [sellToken, setSellToken] = useState("USDC");
  const [buyToken, setBuyToken] = useState("EURC");
  const [points, setPoints] = useState<DepthPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDepth = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPoints([]);
    try {
      const res = await fetch(
        `/api/oracle/depth?sell_token=${sellToken}&buy_token=${buyToken}`
      );
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPoints(data.points || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch depth");
    } finally {
      setLoading(false);
    }
  }, [sellToken, buyToken]);

  const availableBuy = TOKENS.filter((t) => t.symbol !== sellToken);
  const baselinePrice = points.length > 0 ? points[0].effective_price : null;

  return (
    <div className="space-y-3">
      {/* Token pair selector */}
      <Card title="Liquidity Depth" subtitle="Effective price vs trade size">
        <div className="mb-2">
          <label className="mb-1 block text-[0.7rem] uppercase tracking-wide text-muted">
            Sell Token
          </label>
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground outline-none transition-colors focus:border-accent-blue"
            value={sellToken}
            onChange={(e) => {
              setSellToken(e.target.value);
              if (e.target.value === buyToken) {
                const alt = TOKENS.find((t) => t.symbol !== e.target.value);
                if (alt) setBuyToken(alt.symbol);
              }
            }}
          >
            {TOKENS.map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-2">
          <label className="mb-1 block text-[0.7rem] uppercase tracking-wide text-muted">
            Buy Token
          </label>
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground outline-none transition-colors focus:border-accent-blue"
            value={buyToken}
            onChange={(e) => setBuyToken(e.target.value)}
          >
            {availableBuy.map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <button
          className="mt-3 w-full rounded-xl border-none bg-accent-blue py-3 text-[0.95rem] font-semibold text-background transition-colors hover:bg-accent-blue/80 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={fetchDepth}
          disabled={loading}
        >
          {loading ? "Loading..." : "Fetch Depth"}
        </button>
      </Card>

      {/* Error */}
      {error && (
        <Card title="Error">
          <p className="break-words text-sm text-accent-red">{error}</p>
        </Card>
      )}

      {/* Depth chart */}
      {points.length > 0 && (
        <Card
          title={`Price vs Size (${sellToken} \u2192 ${buyToken})`}
          subtitle="Effective price across trade sizes"
        >
          <div className="-mx-2">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={points}>
                <XAxis
                  dataKey="sell_amount"
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1000000
                      ? `${v / 1000000}M`
                      : v >= 1000
                        ? `${v / 1000}K`
                        : String(v)
                  }
                />
                <YAxis
                  domain={["auto", "auto"]}
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                  width={70}
                  tickFormatter={(v: number) => v.toFixed(4)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => {
                    if (name === "effective_price")
                      return [value.toFixed(6), "Eff. Price"];
                    return [value, name];
                  }}
                  labelFormatter={(v: number) =>
                    `${v.toLocaleString()} ${sellToken}`
                  }
                />
                <Area
                  type="monotone"
                  dataKey="effective_price"
                  stroke="var(--color-accent)"
                  fill="var(--color-accent)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {baselinePrice && (
            <p className="mt-2 text-[11px] text-muted">
              Baseline: {baselinePrice.toFixed(6)} {buyToken}/{sellToken} at{" "}
              {points[0].sell_amount.toLocaleString()} {sellToken}
            </p>
          )}
        </Card>
      )}

      {/* Data table */}
      {points.length > 0 && (
        <Card title="Depth Data" subtitle="Raw depth levels">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border-b border-border px-2 py-1.5 text-left text-[0.65rem] uppercase tracking-wide text-muted">
                    Sell
                  </th>
                  <th className="border-b border-border px-2 py-1.5 text-left text-[0.65rem] uppercase tracking-wide text-muted">
                    Buy
                  </th>
                  <th className="border-b border-border px-2 py-1.5 text-left text-[0.65rem] uppercase tracking-wide text-muted">
                    Price
                  </th>
                  <th className="border-b border-border px-2 py-1.5 text-left text-[0.65rem] uppercase tracking-wide text-muted">
                    Impact
                  </th>
                  <th className="border-b border-border px-2 py-1.5 text-left text-[0.65rem] uppercase tracking-wide text-muted">
                    Gas
                  </th>
                </tr>
              </thead>
              <tbody>
                {points.map((p, i) => {
                  const impactBps = p.price_impact_bps;
                  const impactColor =
                    impactBps == null
                      ? "text-muted"
                      : impactBps < 50
                        ? "text-accent-green"
                        : impactBps < 200
                          ? "text-accent-amber"
                          : "text-accent-red";
                  const slippage = baselinePrice
                    ? ((baselinePrice - p.effective_price) / baselinePrice) * 100
                    : 0;
                  return (
                    <tr key={i}>
                      <td className="border-b border-border px-2 py-2 tabular-nums">
                        {p.sell_amount.toLocaleString()}
                      </td>
                      <td className="border-b border-border px-2 py-2 tabular-nums">
                        {p.buy_amount.toLocaleString()}
                      </td>
                      <td className="border-b border-border px-2 py-2 tabular-nums">
                        {p.effective_price.toFixed(4)}
                      </td>
                      <td
                        className={`border-b border-border px-2 py-2 tabular-nums ${impactColor}`}
                      >
                        {impactBps != null
                          ? `${(impactBps / 100).toFixed(2)}%`
                          : "\u2014"}
                        {slippage > 0.01 && (
                          <span className="text-[0.65rem] text-muted">
                            {" "}
                            ({slippage.toFixed(2)}% slip)
                          </span>
                        )}
                      </td>
                      <td className="border-b border-border px-2 py-2 tabular-nums">
                        {p.gas_estimate.toLocaleString()}
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

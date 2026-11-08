"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card } from "@/components/card";
import { RateSparkline } from "@/components/rate-sparkline";
import { LiveQuoteCard } from "@/components/live-quote-card";
import { useBalances, usePolicy, useTreasuryBalances } from "@/lib/hooks";
import { formatDisplayAmount } from "@getnear/shared";
import { formatDisplayAmountFromString, formatBps } from "@/lib/format";
import { SAVINGS_BPS } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";

// ── Live trade types from Oracle API ─────────────────────────────────

interface OracleTrade {
  id: string;
  from_token: string;
  to_token: string;
  input_amount: string;
  filled_amount: string | null;
  output_received: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  mode?: string;
  desired_output?: string | null;
}

function formatTimeAgo(timestampSec: number): string {
  const diff = Date.now() - timestampSec * 1000;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function useRecentTrades() {
  const [trades, setTrades] = useState<OracleTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/oracle/api/trades?status=COMPLETE,FILLING");
        if (res.ok && !cancelled) {
          const rows: OracleTrade[] = await res.json();
          setTrades(rows);
        }
      } catch {
        // Oracle may not be running
      } finally {
        if (!cancelled) {
          setLoading(false);
          timeoutRef.current = setTimeout(poll, 10000);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { trades, loading };
}

interface StrategyDecisionSummary {
  id: number;
  score: number;
  action: string;
  reason: string;
  chunk_amount: string | null;
  from_token: string | null;
}

function useStrategyLatest() {
  const [latest, setLatest] = useState<StrategyDecisionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/oracle/api/strategy/decisions?limit=5");
        if (res.ok && !cancelled) {
          const rows: StrategyDecisionSummary[] = await res.json();
          setLatest(rows.length > 0 ? rows[0] : null);
        }
      } catch {
        // Oracle may not be running
      } finally {
        if (!cancelled) {
          setLoading(false);
          timeoutRef.current = setTimeout(poll, 5000);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { latest, loading };
}

const ORACLE_URL = "/api/oracle";

function usePriceData() {
  const [comparison, setComparison] = useState<{
    chainlink: { price: number };
    fynd: { price: number };
    uniswap: { price: number };
    avg24h: number;
  } | null>(null);
  const [history, setHistory] = useState<{ timestamp: number; chainlink: number; fynd: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [oracleOffline, setOracleOffline] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [compRes, histRes] = await Promise.all([
        fetch(`${ORACLE_URL}/api/prices/comparison`),
        fetch(`${ORACLE_URL}/prices/history?pair=${encodeURIComponent('EURC/USD')}&hours=24`),
      ]);
      const compOk = compRes.ok;
      const histOk = histRes.ok;
      if (compOk) {
        setComparison(await compRes.json());
        setLastUpdated(Date.now());
      }
      if (histOk) {
        const data = await histRes.json();
        setHistory(data.points || []);
      }
      // If both fail, oracle is offline
      setOracleOffline(!compOk && !histOk);
    } catch (err) {
      console.error('usePriceData load:', err);
      setOracleOffline(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  return { comparison, history, loading, oracleOffline, lastUpdated };
}

function useTickingTimeAgo(timestamp: number | null) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (timestamp === null) {
      setLabel("");
      return;
    }

    const update = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
      if (seconds < 60) {
        setLabel(`Updated ${seconds}s ago`);
      } else {
        const minutes = Math.floor(seconds / 60);
        setLabel(`Updated ${minutes}m ago`);
      }
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [timestamp]);

  return label;
}

function LiveTimestamp({ timestamp }: { timestamp: number | null }) {
  const timeAgo = useTickingTimeAgo(timestamp);
  return <span>{timeAgo || "\u2014"}</span>;
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-border ${className}`}
    />
  );
}

export default function DashboardPage() {
  const balances = useBalances();
  const treasury = useTreasuryBalances();
  const policy = usePolicy();
  const price = usePriceData();
  const strategyLatest = useStrategyLatest();
  const recentTrades = useRecentTrades();
  const { t } = useI18n();
  const [pairView, setPairView] = useState<"USDC_EURC" | "EURC_USDC">("USDC_EURC");
  // useTickingTimeAgo moved into LiveTimestamp component to scope per-second re-renders

  // #33: Extract 24h price range calculation to useMemo
  const priceRange24h = useMemo(() => {
    if (price.history.length === 0) return null;
    const prices = price.history.map(p => pairView === "USDC_EURC" ? 1 / p.chainlink : p.chainlink);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [price.history, pairView]);

  // Real price from Oracle (EURC/USD = how many USD per 1 EURC)
  const eurcUsdPrice = price.comparison?.chainlink?.price || 0;
  // USDC/EURC = 1/eurcUsdPrice (how many EURC per 1 USDC)
  const usdcEurcRate = eurcUsdPrice > 0 ? 1 / eurcUsdPrice : 0;
  const displayRate = pairView === "USDC_EURC" ? usdcEurcRate : eurcUsdPrice;
  const avg24h = price.comparison?.avg24h || 0;
  const avg24hDisplay = pairView === "USDC_EURC" ? (avg24h > 0 ? 1 / avg24h : 0) : avg24h;
  const change24h = displayRate - avg24hDisplay;
  const changePct = avg24hDisplay > 0 ? (change24h / avg24hDisplay) * 100 : 0;

  // Format policy values from on-chain (18 decimals for rates, 6 decimals for threshold)
  const policyThreshold = policy.threshold
    ? formatDisplayAmount(policy.threshold)
    : null;
  const policyRateMin = policy.rateMin
    ? (Number(policy.rateMin) / 1e18).toFixed(4)
    : null;
  const policyRateMax = policy.rateMax
    ? (Number(policy.rateMax) / 1e18).toFixed(4)
    : null;

  return (
    <div className="space-y-4">
      {/* Oracle offline banner */}
      {price.oracleOffline && (
        <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-accent-amber text-sm">&#x26A0;</span>
            <span className="text-xs font-medium text-accent-amber">{t("toast.oracle_offline")}</span>
          </div>
        </div>
      )}




      {/* Live 1Click Dry Quote & ECB Reference Card (P5) */}
      <LiveQuoteCard />

      {/* Rate display */}
      <Card title={t("dashboard.rate_subtitle")} badge={{ label: <LiveTimestamp timestamp={price.lastUpdated} />, color: price.lastUpdated ? "green" : "blue" }}>
        {/* Pair toggle — tap to flip */}
        <button
          onClick={() => setPairView(pairView === "USDC_EURC" ? "EURC_USDC" : "USDC_EURC")}
          className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground transition-colors hover:text-accent-blue"
        >
          <span>{pairView === "USDC_EURC" ? "USDC → EURC" : "EURC → USDC"}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-muted">
            <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="flex items-baseline gap-3">
          {price.loading || displayRate === 0 ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <>
              <span className="font-tabular text-2xl font-semibold text-foreground">
                {displayRate.toFixed(4)}
              </span>
              <span
                className={`font-tabular text-sm font-medium ${
                  change24h >= 0 ? "text-accent-green" : "text-accent-red"
                }`}
              >
                {change24h >= 0 ? "+" : ""}
                {change24h.toFixed(4)}{" "}
                <span className="text-xs text-muted">
                  ({changePct >= 0 ? "+" : ""}
                  {changePct.toFixed(2)}%)
                </span>
              </span>
            </>
          )}
        </div>
        <div className="mt-2">
          <RateSparkline data={price.history} inverted={pairView === "USDC_EURC"} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
          <span>{t("dashboard.range_24h")}</span>
          <span className="font-tabular">
            {priceRange24h
              ? `${priceRange24h.min.toFixed(4)} - ${priceRange24h.max.toFixed(4)}`
              : "—"}
          </span>
        </div>
      </Card>

      {/* Balance cards — Treasury (wallet) + In Execution (SwapExecutor) */}
      <div className="grid grid-cols-2 gap-3">
        <Card title={t("dashboard.treasury")} subtitle={t("dashboard.wallet")} className="border-l-2 border-l-accent-green/40">
          <div className="space-y-2">
            <BalanceRow
              token="USDC"
              amount={treasury.usdcBal !== null ? formatDisplayAmount(treasury.usdcBal) : null}
              loading={treasury.loading}
            />
            <BalanceRow
              token="EURC"
              amount={treasury.eurcBal !== null ? formatDisplayAmount(treasury.eurcBal, "EUR") : null}
              loading={treasury.loading}
            />
          </div>
        </Card>
        <Card title={t("dashboard.in_execution")} subtitle="SwapExecutor" className="border-l-2 border-l-accent-blue/40">
          <div className="space-y-2">
            <BalanceRow
              token="USDC"
              amount={balances.usdcBal !== null ? formatDisplayAmount(balances.usdcBal) : null}
              loading={balances.loading}
            />
            <BalanceRow
              token="EURC"
              amount={balances.eurcBal !== null ? formatDisplayAmount(balances.eurcBal, "EUR") : null}
              loading={balances.loading}
            />
          </div>
        </Card>
      </div>

      {/* Active policy — testnet contract limits */}
      <Card
        title={t("dashboard.active_policy")}
        badge={{ label: policy.version ? `v${policy.version}` : "LOADING", color: "green" }}
      >
        <div className="grid grid-cols-3 gap-3">
          <PolicyStat
            label={t("dashboard.auto_threshold")}
            value={policyThreshold}
            loading={policy.loading}
          />
          <PolicyStat
            label={t("dashboard.rate_min")}
            value={policyRateMin}
            loading={policy.loading}
          />
          <PolicyStat
            label={t("dashboard.rate_max")}
            value={policyRateMax}
            loading={policy.loading}
          />
        </div>
      </Card>

      {/* Active strategy — latest decision from Oracle */}
      <Card
        title={t("strategy.latest")}
        badge={{
          label: strategyLatest.latest?.action || "---",
          color: strategyLatest.latest?.action === "SWAP" ? "green" : "blue",
        }}
      >
        {strategyLatest.loading && !strategyLatest.latest ? (
          <Skeleton className="h-5 w-full" />
        ) : strategyLatest.latest ? (
          <p className="text-sm text-foreground">
            <span className="font-tabular font-semibold">
              Score {strategyLatest.latest.score}
            </span>
            {" — "}
            <span className="font-semibold">{strategyLatest.latest.action}</span>
            {strategyLatest.latest.chunk_amount && (
              <span className="font-tabular">
                {" "}{Number(strategyLatest.latest.chunk_amount).toLocaleString()} {strategyLatest.latest.from_token || "USDC"}
              </span>
            )}
            {" "}
            <span className="text-muted text-xs">
              ({strategyLatest.latest.reason})
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted">{t("strategy.latest_empty")}</p>
        )}
      </Card>

      {/* Price comparison widget — all 3 oracle sources */}
      <PriceComparisonWidget comparison={price.comparison} loading={price.loading} />

      {/* Recent trades — live data from Oracle API */}
      <Card title={t("dashboard.recent_trades")} subtitle={t("dashboard.last_48h")}>
        {recentTrades.loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : recentTrades.trades.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <p className="text-sm text-muted">No trades yet</p>
            <p className="mt-1 text-[11px] text-muted/60">
              Trades will appear here once the CRE agent executes orders.
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {recentTrades.trades.map((trade) => {
              const isComplete = trade.status === "COMPLETE";
              // Only use input_amount as fallback when the trade is fully complete.
              // For FILLING trades, filled_amount=null means no fills yet — show "0".
              const filledAmt = trade.filled_amount || (isComplete ? trade.input_amount : "0");
              const outputAmt = trade.output_received || "0";
              // Estimate effective rate from filled/output amounts
              // Both USDC and EURC are 6-decimal tokens, so raw ratio is correct.
              // Normalize to always show USDC-per-EURC for consistency with dashboard rate.
              const filled = Number(filledAmt);
              const output = Number(outputAmt);
              const isBuyingEurc = trade.from_token === "USDC" && trade.to_token === "EURC";
              const effectiveRate = filled > 0 && output > 0
                ? (isBuyingEurc ? filled / output : output / filled)
                : 0;
              // Estimated savings: bank fee minus DEX fee
              const estimatedSavingsBps = SAVINGS_BPS;

              return (
                <div
                  key={trade.id}
                  className="flex items-center justify-between border-b border-border/50 py-2.5 last:border-0"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold ${
                        isComplete
                          ? "bg-accent-green/15 text-accent-green"
                          : "bg-accent-blue/15 text-accent-blue"
                      }`}
                    >
                      {isComplete ? "C" : "F"}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground">
                          {trade.from_token} {"->"} {trade.to_token}
                        </span>
                        <span className="text-[11px] text-muted">
                          {trade.id.slice(0, 8)}...
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted">
                        {effectiveRate > 0 && (
                          <span className="font-tabular">
                            @ {effectiveRate.toFixed(4)}
                          </span>
                        )}
                        <span>{formatTimeAgo(trade.updated_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-tabular text-xs font-medium text-foreground">
                      {!isComplete && filledAmt === "0"
                        ? t("dashboard.pending")
                        : formatDisplayAmountFromString(filledAmt, trade.from_token === "EURC" ? "EUR" : "USD")}
                    </div>
                    <div className="font-tabular text-[11px] text-accent-green">
                      +{formatBps(estimatedSavingsBps)} {t("dashboard.saved")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function BalanceRow({
  token,
  amount,
  loading,
}: {
  token: string;
  amount: string | null;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {token}
      </span>
      {loading || amount === null ? (
        <Skeleton className="h-4 w-20" />
      ) : (
        <span className="font-tabular text-xs font-semibold text-foreground">
          {amount}
        </span>
      )}
    </div>
  );
}

function PolicyStat({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | null;
  loading: boolean;
}) {
  return (
    <div className="text-center">
      {loading || value === null ? (
        <Skeleton className="mx-auto h-5 w-16" />
      ) : (
        <div className="font-tabular text-sm font-semibold text-foreground">
          {value}
        </div>
      )}
      <div className="mt-0.5 text-[11px] text-muted">{label}</div>
    </div>
  );
}

// ── Price Comparison Widget ─────────────────────────────────────────

function PriceComparisonWidget({
  comparison,
  loading,
}: {
  comparison: {
    chainlink: { price: number };
    fynd: { price: number };
    uniswap: { price: number };
    avg24h: number;
  } | null;
  loading: boolean;
}) {
  const { t } = useI18n();

  const sources = comparison
    ? [
        { name: t("dashboard.chainlink"), price: comparison.chainlink.price },
        { name: t("dashboard.fynd"), price: comparison.fynd.price },
        { name: t("dashboard.uniswap"), price: comparison.uniswap.price },
      ]
    : [];

  // Compute average price across all sources
  const avgPrice =
    sources.length > 0
      ? sources.reduce((sum, s) => sum + s.price, 0) / sources.length
      : 0;

  // Compute divergence in bps for each source from the average
  const sourcesWithDiv = sources.map((s) => {
    const divBps = avgPrice > 0 ? Math.abs(((s.price - avgPrice) / avgPrice) * 10000) : 0;
    return { ...s, divBps };
  });

  // Max divergence across all pairs
  const maxDiv =
    sourcesWithDiv.length > 0
      ? Math.max(...sourcesWithDiv.map((s) => s.divBps))
      : 0;

  function divColor(bps: number): string {
    if (bps < 5) return "text-accent-green";
    if (bps <= 20) return "text-accent-amber";
    return "text-accent-red";
  }

  function divDotColor(bps: number): string {
    if (bps < 5) return "bg-accent-green";
    if (bps <= 20) return "bg-accent-amber";
    return "bg-accent-red";
  }

  return (
    <Card
      title={t("dashboard.price_comparison")}
      subtitle={t("dashboard.price_comparison_subtitle")}
      badge={{ label: "EURC/USD", color: "blue" }}
    >
      {loading || !comparison ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : (
        <>
          {/* Header row */}
          <div className="mb-1 grid grid-cols-3 text-[11px] font-medium uppercase tracking-wide text-muted">
            <span>{t("dashboard.source")}</span>
            <span className="text-right">{t("dashboard.price")}</span>
            <span className="text-right">{t("dashboard.divergence")}</span>
          </div>

          {/* Source rows */}
          <div className="space-y-0">
            {sourcesWithDiv.map((source) => (
              <div
                key={source.name}
                className="grid grid-cols-3 items-center border-b border-border/50 py-2 last:border-0"
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${divDotColor(source.divBps)}`} />
                  <span className="text-xs font-medium text-foreground">
                    {source.name}
                  </span>
                </div>
                <span className="text-right font-tabular text-xs font-semibold text-foreground">
                  {source.price.toFixed(4)}
                </span>
                <span
                  className={`text-right font-tabular text-xs font-medium ${divColor(source.divBps)}`}
                >
                  {source.divBps.toFixed(1)} bps
                </span>
              </div>
            ))}
          </div>

          {/* Max divergence summary */}
          <div className="mt-2 flex items-center justify-between rounded-lg bg-background px-3 py-1.5">
            <span className="text-[11px] text-muted">{t("dashboard.max_divergence")}</span>
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${divDotColor(maxDiv)}`} />
              <span className={`font-tabular text-xs font-bold ${divColor(maxDiv)}`}>
                {maxDiv.toFixed(1)} bps
              </span>
            </div>
          </div>

          {/* Oracle dashboard link */}
          <div className="mt-3 text-center">
            <a
              href="https://"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted hover:text-accent-blue transition-colors"
            >
              View Oracle Dashboard &rarr;
            </a>
          </div>
        </>
      )}
    </Card>
  );
}

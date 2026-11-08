"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/card";
import { useToast } from "@/components/toast-provider";
import { useI18n } from "@/lib/i18n";
import { formatDisplayAmount, DISPLAY_MULTIPLIER, type TradeOrder } from "@getnear/shared";

const ORACLE_URL = "/api/oracle";

// #35: The API returns snake_case; map to camelCase TradeOrder from shared types
interface ApiTradeOrder {
  id: string;
  from_token: string;
  to_token: string;
  input_amount: string;
  filled_amount: string;
  output_received: string;
  deadline: number;
  status: string;
  created_at: number;
  updated_at: number;
  timing_score?: number;
  strategy_reason?: string;
  mode?: string;
  desired_output?: string | null;
}

function mapApiTrade(raw: ApiTradeOrder): TradeOrder & { timingScore?: number; strategyReason?: string } {
  return {
    id: raw.id,
    fromToken: raw.from_token as "USDC" | "EURC",
    toToken: raw.to_token as "USDC" | "EURC",
    inputAmount: raw.input_amount,
    filledAmount: raw.filled_amount,
    outputReceived: raw.output_received,
    deadline: raw.deadline,
    status: raw.status as TradeOrder["status"],
    mode: (raw.mode as "INPUT" | "OUTPUT") || "INPUT",
    desiredOutput: raw.desired_output ?? null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    timingScore: raw.timing_score,
    strategyReason: raw.strategy_reason,
  };
}

type MappedTrade = ReturnType<typeof mapApiTrade>;

export default function TradePage() {
  return (
    <div className="space-y-4">
      <TradeForm />
      <TradesList />
    </div>
  );
}

// -- Trade Form --

function TradeForm() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [direction, setDirection] = useState<"USDC_TO_EURC" | "EURC_TO_USDC">("USDC_TO_EURC");
  const [amount, setAmount] = useState("5");
  const [deadline, setDeadline] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [liveRate, setLiveRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(true);

  useEffect(() => {
    const fetchRate = async () => {
      try {
        const res = await fetch(`${ORACLE_URL}/api/prices/comparison`);
        if (res.ok) {
          const data = await res.json();
          const chainlinkPrice = data.chainlink?.price;
          if (chainlinkPrice && chainlinkPrice > 0) {
            setLiveRate(chainlinkPrice);
          }
        }
      } catch (err) {
        console.error("Failed to fetch live rate:", err);
      }
      setRateLoading(false);
    };
    fetchRate();
    const id = setInterval(fetchRate, 30000);
    return () => clearInterval(id);
  }, []);

  const fromToken = direction === "USDC_TO_EURC" ? "USDC" : "EURC";
  const toToken = direction === "USDC_TO_EURC" ? "EURC" : "USDC";
  const parsedAmount = Number(amount);
  const rawAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? Math.floor(parsedAmount * 1e6) : 0;
  const amountCurrency = fromToken === "USDC" ? "USD" : "EUR";
  const displayAmount = (Number(amount) * DISPLAY_MULTIPLIER).toLocaleString("en-US", {
    style: "currency",
    currency: amountCurrency,
    maximumFractionDigits: 0,
  });

  const handleSubmit = async () => {
    if (rawAmount <= 0) return;
    setSubmitting(true);
    try {
      const deadlineTs = Math.floor(Date.now() / 1000) + deadline * 3600;
      const payload = {
        fromToken,
        toToken,
        inputAmount: rawAmount.toString(),
        deadline: deadlineTs,
        maxDeviationBps: 120,
      };
      const res = await fetch(`${ORACLE_URL}/api/trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSubmitted(true);
      showToast(t("toast.trade_submitted"), "success");
      if (data.status === "Pending" || data.status === "PENDING") {
        showToast("Order exceeds auto-cap — submitted to Sputnik DAO for 2-of-3 council approval", "info");
      }
      setTimeout(() => setSubmitted(false), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("toast.error");
      console.error("Failed to submit trade:", e);
      showToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("trade.title")}</h2>
        <p className="text-xs text-muted">{t("trade.subtitle")}</p>
      </div>

      {/* Direction toggle */}
      <Card title={t("trade.direction")}>
        <div className="flex items-center gap-3">
          <button
            className={`flex-1 rounded-lg border py-3 text-center text-sm font-medium transition-colors ${
              direction === "USDC_TO_EURC"
                ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                : "border-border text-muted"
            }`}
            onClick={() => setDirection("USDC_TO_EURC")}
          >
            USDC &rarr; EURC
          </button>
          <button
            onClick={() => setDirection(direction === "USDC_TO_EURC" ? "EURC_TO_USDC" : "USDC_TO_EURC")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-muted hover:text-accent-blue hover:border-accent-blue transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            &harr;
          </button>
          <button
            className={`flex-1 rounded-lg border py-3 text-center text-sm font-medium transition-colors ${
              direction === "EURC_TO_USDC"
                ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                : "border-border text-muted"
            }`}
            onClick={() => setDirection("EURC_TO_USDC")}
          >
            EURC &rarr; USDC
          </button>
        </div>
      </Card>

      {/* Amount */}
      <Card title={t("trade.you_send")} subtitle={t("trade.multiplier_note")}>
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-3 text-center font-mono text-xl text-foreground outline-none focus:border-accent-blue transition-colors"
          placeholder="5"
          min="1"
          step="1"
        />
        <div className="mt-2 text-center font-mono text-sm font-medium text-accent-blue">
          {t("trade.displays_as")} {displayAmount}
        </div>
        <div className="mt-2 flex justify-center gap-2">
          {[1, 5, 10, 50].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-muted hover:border-accent-blue hover:text-accent-blue transition-colors min-h-[36px]"
            >
              ${v}M
            </button>
          ))}
        </div>
      </Card>

      {/* Deadline */}
      <Card title={t("trade.deadline")}>
        <div className="flex gap-2">
          {[1, 4, 24].map((h) => (
            <button
              key={h}
              onClick={() => setDeadline(h)}
              className={`flex-1 rounded-lg border py-2.5 text-center text-xs font-medium transition-colors ${
                deadline === h
                  ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                  : "border-border text-muted"
              }`}
            >
              {h}h
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">{t("trade.deadline_note")}</p>
      </Card>

      {/* Preview */}
      <Card title={t("trade.preview")} badge={{ label: "ESTIMATE", color: "blue" }}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] text-muted">{t("trade.you_send")}</div>
            <div className="font-mono text-xs font-medium text-foreground">{displayAmount}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted">{t("trade.you_receive")}</div>
            <div className="font-mono text-xs font-medium text-accent-green">
              {rateLoading ? (
                <span className="inline-block h-4 w-20 animate-pulse rounded bg-border" />
              ) : liveRate ? (
                <>~{(() => {
                  const previewRate = direction === "USDC_TO_EURC" ? 1 / liveRate : liveRate;
                  const receiveCurrency = direction === "USDC_TO_EURC" ? "EUR" : "USD";
                  return (Number(amount) * previewRate * DISPLAY_MULTIPLIER).toLocaleString("en-US", {
                    style: "currency",
                    currency: receiveCurrency,
                    maximumFractionDigits: 0,
                  });
                })()}</>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted">{t("trade.rate")}</div>
            <div className="font-mono text-xs font-medium text-foreground">
              {rateLoading ? (
                <span className="inline-block h-4 w-12 animate-pulse rounded bg-border" />
              ) : liveRate ? (
                <>~{(direction === "USDC_TO_EURC" ? 1 / liveRate : liveRate).toFixed(4)}</>
              ) : (
                "\u2014"
              )}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted">{t("trade.est_chunks")}</div>
            <div className="font-mono text-xs font-medium text-foreground">~{Math.max(1, Math.floor(deadline * 60 / 1))} {t("trade.swaps")}</div>
          </div>
        </div>
      </Card>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting || rawAmount <= 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-blue py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-blue/90 active:scale-[0.98] disabled:opacity-50"
      >
        {submitted ? (
          "\u2713 Order Submitted"
        ) : submitting ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {t("trade.submitting")}
          </>
        ) : (
          t("trade.submit")
        )}
      </button>
    </>
  );
}

// -- Trades List --

function TradesList() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [trades, setTrades] = useState<MappedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch(`${ORACLE_URL}/api/trades`);
      if (!res.ok) throw new Error(`fetchTrades failed: HTTP ${res.status}`);
      const data: ApiTradeOrder[] = await res.json();
      setTrades(data.map(mapApiTrade));
    } catch (err) {
      console.error("fetchTrades:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTrades();
    const id = setInterval(fetchTrades, 5000);
    return () => clearInterval(id);
  }, [fetchTrades]);

  const handleCancel = async (tradeId: string) => {
    if (cancelConfirmId !== tradeId) {
      setCancelConfirmId(tradeId);
      return;
    }
    setCancelConfirmId(null);
    try {
      const res = await fetch(`${ORACLE_URL}/api/trades/${tradeId}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast(t("toast.trade_cancelled"), "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("toast.error");
      console.error("Failed to cancel trade:", e);
      showToast(msg, "error");
    }
    fetchTrades();
  };

  const dismissCancel = () => setCancelConfirmId(null);

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{t("trades.title")}</h2>
        {trades.length > 0 && (
          <span className="rounded-full bg-accent-blue/15 px-2.5 py-0.5 text-[11px] font-medium text-accent-blue">
            {trades.length}
          </span>
        )}
      </div>

      {loading ? (
        <Card title={t("trades.loading")}>
          <div className="flex items-center justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
          </div>
        </Card>
      ) : trades.length === 0 ? (
        <Card title={t("trades.empty")}>
          <p className="py-4 text-center text-xs text-muted">{t("trades.empty_desc")}</p>
        </Card>
      ) : (
        trades.map((trade) => {
          const input = BigInt(trade.inputAmount);
          const filled = BigInt(trade.filledAmount || "0");
          const fillPct = input > 0n ? Number((filled * 100n) / input) : 0;
          const now = Math.floor(Date.now() / 1000);
          const remaining = Math.max(0, trade.deadline - now);
          const hours = Math.floor(remaining / 3600);
          const mins = Math.floor((remaining % 3600) / 60);
          const isConfirming = cancelConfirmId === trade.id;

          return (
            <Card
              key={trade.id}
              title={`${trade.fromToken} \u2192 ${trade.toToken}`}
              subtitle={trade.id.slice(0, 8)}
              badge={{
                label: trade.mode === "OUTPUT" ? `TARGET \u00b7 ${trade.status}` : trade.status,
                color: trade.status === "COMPLETE" ? "green" : trade.status === "CANCELLED" ? "red" : trade.status === "FILLING" ? "blue" : "amber",
              }}
            >
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-muted">{t("trades.filled")}</span>
                  <span className="font-mono font-medium text-foreground">{fillPct}%</span>
                </div>
                <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ease-out ${
                      fillPct >= 90
                        ? "bg-accent-green"
                        : remaining < 3600 && fillPct < 80
                        ? "bg-accent-amber"
                        : "bg-accent-blue"
                    }`}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-muted">{t("trades.input")}</div>
                  <div className="font-mono text-xs font-medium text-foreground">
                    {formatDisplayAmount(input, trade.fromToken === "EURC" ? "EUR" : "USD")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">{t("trades.output")}</div>
                  <div className="font-mono text-xs font-medium text-accent-green">
                    {BigInt(trade.outputReceived || "0") > 0n
                      ? formatDisplayAmount(BigInt(trade.outputReceived), trade.toToken === "EURC" ? "EUR" : "USD")
                      : "\u2014"}
                  </div>
                </div>
              </div>

              {trade.mode === "OUTPUT" && trade.desiredOutput && (
                <div className="mt-2 rounded-lg bg-accent-blue/5 border border-accent-blue/20 px-3 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted">{t("trade.desired_output")}</span>
                    <span className="font-mono text-[10px] font-medium text-accent-blue">
                      {formatDisplayAmount(BigInt(trade.desiredOutput), trade.toToken === "EURC" ? "EUR" : "USD")}
                    </span>
                  </div>
                </div>
              )}

              {(trade.timingScore != null || trade.strategyReason) && (
                <div className="mt-3 border-t border-border/50 pt-2">
                  <div className="flex items-center gap-3">
                    {trade.timingScore != null && (
                      <TimingScoreBadge score={trade.timingScore} label={t("trades.timing_score")} />
                    )}
                    {trade.strategyReason && (
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-muted">{t("trades.strategy")}</div>
                        <div className="overflow-hidden">
                          <div className="text-[11px] font-medium text-foreground whitespace-nowrap animate-marquee">
                            {trade.strategyReason}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2">
                <span className={`text-[11px] ${remaining < 3600 ? "text-accent-amber" : "text-muted"}`}>
                  {remaining > 0 ? `⏱ ${hours}h ${mins}m ${t("trades.remaining")}` : t("trades.expired")}
                </span>
                {trade.status !== "COMPLETE" && trade.status !== "CANCELLED" && (
                  <div className="flex items-center gap-1.5">
                    {isConfirming && (
                      <button
                        onClick={dismissCancel}
                        className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium text-muted hover:text-foreground transition-colors min-h-[36px] min-w-[36px]"
                      >
                        {"\u2715"}
                      </button>
                    )}
                    <button
                      onClick={() => handleCancel(trade.id)}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors min-h-[36px] ${
                        isConfirming
                          ? "border-accent-red bg-accent-red/15 text-accent-red animate-pulse"
                          : "border-accent-red/30 text-accent-red hover:bg-accent-red/10"
                      }`}
                    >
                      {isConfirming ? t("trades.cancel_confirm") : t("trades.cancel")}
                    </button>
                  </div>
                )}
              </div>
              {isConfirming && (
                <div className="mt-2 rounded-lg bg-accent-red/5 border border-accent-red/20 px-3 py-1.5">
                  <p className="text-[11px] text-accent-red">{t("trades.cancel_prompt")}</p>
                </div>
              )}
            </Card>
          );
        })
      )}
    </>
  );
}

// -- Timing Score Badge --

function TimingScoreBadge({ score, label }: { score: number; label: string }) {
  const color =
    score > 70
      ? "text-accent-green bg-accent-green/15 border-accent-green/30"
      : score >= 40
      ? "text-accent-amber bg-accent-amber/15 border-accent-amber/30"
      : "text-accent-red bg-accent-red/15 border-accent-red/30";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-[11px] text-muted">{label}</div>
      <span className={`rounded-lg border px-2 py-0.5 font-tabular text-xs font-bold ${color}`}>
        {score}
      </span>
    </div>
  );
}

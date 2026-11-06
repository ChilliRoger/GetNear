"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/components/card";
import { useToast } from "@/components/toast-provider";
import { useShieldedBalances } from "@/lib/privacy-hooks";
import type {
  SwapEstimateResponse,
  PrivateSwapResponse,
} from "@getnear/shared";
import { SEPOLIA_TOKEN_META } from "@getnear/shared";
import { formatUnits } from "viem";

type StepStatus = "pending" | "in-progress" | "success" | "failed";

interface SwapStep {
  step: "withdraw" | "swap" | "deposit";
  label: string;
  status: StepStatus;
  txHash?: string;
}

// Tokens available for private swap (exclude ULNKm utility token)
const SWAP_TOKENS = (["USDC", "EURC", "WBTC", "WETH"] as const).map((key) => ({
  key,
  symbol: SEPOLIA_TOKEN_META[key].symbol,
  address: SEPOLIA_TOKEN_META[key].address,
  decimals: SEPOLIA_TOKEN_META[key].decimals,
}));

function formatTokenAmount(raw: string, decimals: number): string {
  try {
    const formatted = formatUnits(BigInt(raw), decimals);
    const num = parseFloat(formatted);
    if (num === 0) return "0";
    if (num < 0.0001) return "<0.0001";
    return num.toLocaleString("en-US", { maximumFractionDigits: 6 });
  } catch {
    return "0";
  }
}

export function PrivateBalanceSwap() {
  const { showToast } = useToast();
  const balances = useShieldedBalances();

  const [tokenIn, setTokenIn] = useState(SWAP_TOKENS[0]);
  const [tokenOut, setTokenOut] = useState(SWAP_TOKENS[1]);
  const [amountIn, setAmountIn] = useState("");

  const [estimate, setEstimate] = useState<SwapEstimateResponse | null>(null);
  const [estimating, setEstimating] = useState(false);

  const [executing, setExecuting] = useState(false);
  const [steps, setSteps] = useState<SwapStep[]>([
    { step: "withdraw", label: "Withdraw", status: "pending" },
    { step: "swap", label: "Swap", status: "pending" },
    { step: "deposit", label: "Deposit", status: "pending" },
  ]);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Derive shielded balance for selected input token (v2 shielded-balances endpoint)
  const shieldedBalanceDisplay = useMemo(() => {
    if (!balances.data?.balances) return "0";
    const match = balances.data.balances.find(
      (b) => b.token.toLowerCase() === tokenIn.address.toLowerCase()
    );
    return match?.displayAmount || "0";
  }, [balances.data, tokenIn.address]);

  const handleMaxAmount = () => {
    const parsed = parseFloat(shieldedBalanceDisplay);
    if (Number.isFinite(parsed) && parsed > 0) {
      setAmountIn(shieldedBalanceDisplay);
    }
  };

  // Convert human-readable amount to raw units
  const toRawUnits = useCallback(
    (humanAmount: string, decimals: number): string => {
      const num = parseFloat(humanAmount);
      if (!Number.isFinite(num) || num <= 0) return "0";
      // Use BigInt for precision with large decimals (e.g., 18)
      const parts = humanAmount.split(".");
      const intPart = parts[0] || "0";
      const fracPart = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
      return BigInt(intPart + fracPart).toString();
    },
    []
  );

  // Auto-estimate on amount/token change with debounce
  useEffect(() => {
    const raw = toRawUnits(amountIn, tokenIn.decimals);
    if (raw === "0" || tokenIn.address === tokenOut.address) {
      setEstimate(null);
      return;
    }

    setEstimating(true);
    const timeout = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn: raw,
        });
        const res = await fetch(`/api/privacy/swap/estimate?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: SwapEstimateResponse = await res.json();
        setEstimate(data);
      } catch {
        setEstimate(null);
      } finally {
        setEstimating(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [amountIn, tokenIn, tokenOut, toRawUnits]);

  const resetSteps = () => {
    setSteps([
      { step: "withdraw", label: "Withdraw", status: "pending" },
      { step: "swap", label: "Swap", status: "pending" },
      { step: "deposit", label: "Deposit", status: "pending" },
    ]);
    setResult(null);
  };

  const handleExecute = async () => {
    if (executing) return;
    const raw = toRawUnits(amountIn, tokenIn.decimals);
    if (raw === "0") return;

    setExecuting(true);
    resetSteps();

    // Mark first step in-progress
    setSteps((prev) =>
      prev.map((s, i) => (i === 0 ? { ...s, status: "in-progress" } : s))
    );

    try {
      const res = await fetch("/api/privacy/execute-swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn: raw,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data: PrivateSwapResponse = await res.json();

      // Update steps from response
      if (data.steps) {
        setSteps((prev) =>
          prev.map((s) => {
            const match = data.steps.find((ds) => ds.step === s.step);
            if (!match) return s;
            return {
              ...s,
              status: match.status === "confirmed" || match.status === "success"
                ? "success"
                : match.status === "failed"
                ? "failed"
                : "in-progress",
              txHash: match.txHash,
            };
          })
        );
      } else {
        // If no step-by-step, mark all success
        setSteps((prev) => prev.map((s) => ({ ...s, status: "success" as StepStatus })));
      }

      setResult({
        success: data.ok,
        message: data.ok
          ? `Swap complete — received ${estimate ? formatTokenAmount(data.estimatedOutput, tokenOut.decimals) : ""} ${tokenOut.symbol}`
          : "Swap reported failure",
      });
      if (data.ok) {
        showToast(`Private swap executed (${data.txId?.slice(0, 10)}...)`, "success");
      }
    } catch (e) {
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "in-progress" ? { ...s, status: "failed" } : s
        )
      );
      const msg = e instanceof Error ? e.message : "Swap failed";
      setResult({ success: false, message: msg });
      showToast(`Private swap failed: ${msg}`, "error");
    } finally {
      setExecuting(false);
    }
  };

  const canExecute =
    !executing &&
    amountIn !== "" &&
    parseFloat(amountIn) > 0 &&
    tokenIn.address !== tokenOut.address;

  return (
    <div className="space-y-4">
      {/* Swap form */}
      <Card
        title="Private Balance Swap"
        badge={{ label: "ZK", color: "blue" }}
        className="border-l-2 border-l-purple-500/40"
      >
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          Swap between shielded token balances privately via the Unlink privacy pool.
        </p>

        {/* Token In selector */}
        <div className="mb-3">
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted">
            From Token
          </label>
          <select
            value={tokenIn.key}
            onChange={(e) => {
              const found = SWAP_TOKENS.find((t) => t.key === e.target.value);
              if (found) {
                setTokenIn(found);
                if (found.address === tokenOut.address) {
                  const other = SWAP_TOKENS.find((t) => t.address !== found.address);
                  if (other) setTokenOut(other);
                }
              }
            }}
            disabled={executing}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-purple-500"
          >
            {SWAP_TOKENS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.symbol}
              </option>
            ))}
          </select>
          <div className="mt-1 text-[10px] text-muted">
            Balance: {shieldedBalanceDisplay}
          </div>
        </div>

        {/* Token Out selector */}
        <div className="mb-3">
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted">
            To Token
          </label>
          <select
            value={tokenOut.key}
            onChange={(e) => {
              const found = SWAP_TOKENS.find((t) => t.key === e.target.value);
              if (found) {
                setTokenOut(found);
                if (found.address === tokenIn.address) {
                  const other = SWAP_TOKENS.find((t) => t.address !== found.address);
                  if (other) setTokenIn(other);
                }
              }
            }}
            disabled={executing}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-purple-500"
          >
            {SWAP_TOKENS.filter((t) => t.address !== tokenIn.address).map((t) => (
              <option key={t.key} value={t.key}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>

        {/* Amount input */}
        <div className="mb-4">
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted">
            Amount
          </label>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-3 pr-16 text-center font-mono text-xl text-foreground outline-none focus:border-purple-500 transition-colors"
              placeholder="0.00"
              min="0"
              step="any"
              disabled={executing}
            />
            <button
              onClick={handleMaxAmount}
              disabled={executing}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-bold text-purple-400 hover:border-purple-500 hover:bg-purple-500/10 transition-colors disabled:opacity-50"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Estimate display */}
        {(estimating || estimate) && (
          <div className="mb-4 rounded-lg border border-border bg-background p-3">
            {estimating ? (
              <div className="flex items-center justify-center gap-2 py-1">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                <span className="text-[11px] text-muted">Estimating...</span>
              </div>
            ) : estimate ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted">Estimated output</span>
                  <span className="font-mono text-xs font-semibold text-accent-green">
                    {formatTokenAmount(estimate.estimatedOutput, tokenOut.decimals)} {tokenOut.symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted">Rate</span>
                  <span className="font-mono text-[11px] text-foreground">
                    1 {tokenIn.symbol} = {estimate.rate.toFixed(6)} {tokenOut.symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted">Source</span>
                  <span className="text-[10px] text-muted">{estimate.source}</span>
                </div>
                {estimate.priceImpactBps !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted">Price impact</span>
                    <span className={`text-[11px] font-medium ${estimate.priceImpactBps > 100 ? "text-accent-red" : "text-muted"}`}>
                      {(estimate.priceImpactBps / 100).toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Execute button */}
        <button
          onClick={handleExecute}
          disabled={!canExecute}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3.5 text-sm font-semibold text-white transition-all hover:bg-purple-500 active:scale-[0.98] disabled:opacity-50"
        >
          {executing ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Executing Swap...
            </>
          ) : (
            "Execute Private Swap"
          )}
        </button>
      </Card>

      {/* Step progress */}
      {(executing || steps.some((s) => s.status !== "pending")) && (
        <Card title="Swap Progress" subtitle="withdraw → swap → deposit">
          <div className="flex items-center justify-between px-2 py-3">
            {steps.map((step, i) => (
              <div key={step.step} className="flex items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <StepCircle status={step.status} index={i + 1} />
                  <span className="text-[10px] font-medium text-muted">{step.label}</span>
                  {step.txHash && (
                    <a
                      href={`https://sepolia.basescan.org/tx/${step.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] text-purple-400 hover:underline"
                    >
                      {step.txHash.slice(0, 8)}...
                    </a>
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`mx-2 h-0.5 w-8 rounded-full transition-colors ${
                      step.status === "success"
                        ? "bg-accent-green"
                        : step.status === "failed"
                        ? "bg-accent-red"
                        : "bg-border"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Result */}
      {result && (
        <div
          className={`rounded-xl border px-4 py-3 text-center text-xs font-medium ${
            result.success
              ? "border-accent-green/20 bg-accent-green/5 text-accent-green"
              : "border-accent-red/20 bg-accent-red/5 text-accent-red"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}

// ── Step Circle ────────────────────────────────────────────────────

function StepCircle({ status, index }: { status: StepStatus; index: number }) {
  const base = "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all";

  switch (status) {
    case "pending":
      return <div className={`${base} border-2 border-border text-muted`}>{index}</div>;
    case "in-progress":
      return <div className={`${base} border-2 border-accent-blue bg-accent-blue/10 text-accent-blue animate-pulse`}>{index}</div>;
    case "success":
      return (
        <div className={`${base} border-2 border-accent-green bg-accent-green/15 text-accent-green`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      );
    case "failed":
      return (
        <div className={`${base} border-2 border-accent-red bg-accent-red/15 text-accent-red`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      );
  }
}

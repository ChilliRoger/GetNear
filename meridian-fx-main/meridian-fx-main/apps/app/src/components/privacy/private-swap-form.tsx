"use client";

import { useState } from "react";
import { Card } from "@/components/card";
import { useI18n } from "@/lib/i18n";
import { usePrivacyStatus } from "@/lib/privacy-hooks";

type StepStatus = "pending" | "in-progress" | "success" | "failed";

interface SwapStep {
  label: string;
  status: StepStatus;
  txHash?: string;
}

export function PrivateSwapForm() {
  const { t } = useI18n();
  const status = usePrivacyStatus();
  const [amount, setAmount] = useState("100");
  const [executing, setExecuting] = useState(false);
  const [steps, setSteps] = useState<SwapStep[]>([
    { label: t("privacy.step_deposit"), status: "pending" },
    { label: t("privacy.step_execute"), status: "pending" },
    { label: t("privacy.step_withdraw"), status: "pending" },
  ]);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const updateStep = (index: number, update: Partial<SwapStep>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...update } : s))
    );
  };

  const resetSteps = () => {
    setSteps([
      { label: t("privacy.step_deposit"), status: "pending" },
      { label: t("privacy.step_execute"), status: "pending" },
      { label: t("privacy.step_withdraw"), status: "pending" },
    ]);
    setResult(null);
  };

  const handleExecute = async () => {
    if (executing) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;

    setExecuting(true);
    resetSteps();

    try {
      // Step 1: Deposit
      updateStep(0, { status: "in-progress" });
      const res = await fetch("/api/privacy/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsedAmount }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      // Parse step results from the demo response
      if (data.steps) {
        for (let i = 0; i < Math.min(data.steps.length, 3); i++) {
          const step = data.steps[i];
          updateStep(i, {
            status: step.success ? "success" : "failed",
            txHash: step.txHash,
          });
        }
      } else {
        // If no step-by-step data, mark all as success
        updateStep(0, { status: "success", txHash: data.depositTx });
        updateStep(1, { status: "success", txHash: data.swapTx });
        updateStep(2, { status: "success", txHash: data.withdrawTx });
      }

      setResult({ success: true, message: data.message || "Private swap completed" });
    } catch (e) {
      // Mark current in-progress step as failed
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "in-progress" ? { ...s, status: "failed" } : s
        )
      );
      setResult({
        success: false,
        message: e instanceof Error ? e.message : "Swap failed",
      });
    } finally {
      setExecuting(false);
    }
  };

  const notConnected = !status.loading && !status.data?.connected;

  return (
    <div className="space-y-4">
      {/* Testnet badge */}
      <div className="flex items-center justify-center">
        <span className="rounded-full border border-accent-amber/30 bg-accent-amber/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-amber">
          {t("privacy.testnet_badge")}
        </span>
      </div>

      {/* Swap form */}
      <Card
        title={t("privacy.execute_swap")}
        badge={{ label: "ZK", color: "blue" }}
        className="border-l-2 border-l-purple-500/40"
      >
        {notConnected ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-sm text-muted">{t("privacy.not_configured")}</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-[11px] leading-relaxed text-muted">
              {t("privacy.swap_explainer")}
            </p>
            <div className="mb-4">
              <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted">
                Amount (USDC)
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-3 text-center font-mono text-xl text-foreground outline-none focus:border-purple-500 transition-colors"
                placeholder="100"
                min="1"
                step="1"
                disabled={executing}
              />
              <div className="mt-2 flex justify-center gap-2">
                {[10, 50, 100, 500].map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(String(v))}
                    disabled={executing}
                    className="rounded-full border border-border bg-background px-3 py-1 text-[10px] font-medium text-muted hover:border-purple-500 hover:text-purple-400 transition-colors disabled:opacity-50"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleExecute}
              disabled={executing || Number(amount) <= 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3.5 text-sm font-semibold text-white transition-all hover:bg-purple-500 active:scale-[0.98] disabled:opacity-50"
            >
              {executing ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Executing...
                </>
              ) : (
                t("privacy.execute_swap")
              )}
            </button>
          </>
        )}
      </Card>

      {/* Step progress */}
      <Card title={t("privacy.swap_progress_title")} subtitle={t("privacy.swap_progress_subtitle")}>
        <div className="flex items-center justify-between px-2 py-3">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-center">
              {/* Step circle */}
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
              {/* Connector line */}
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

      {/* Result message */}
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
      return (
        <div className={`${base} border-2 border-border text-muted`}>
          {index}
        </div>
      );
    case "in-progress":
      return (
        <div className={`${base} border-2 border-accent-blue bg-accent-blue/10 text-accent-blue animate-pulse`}>
          {index}
        </div>
      );
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

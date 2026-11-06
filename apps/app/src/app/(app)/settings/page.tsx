"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DISPLAY_MULTIPLIER, formatDisplayAmount } from "@getnear/shared";
import { Card } from "@/components/card";
import { useToast } from "@/components/toast-provider";
import { usePolicy } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

const ORACLE_PRICE_URL = "/api/oracle";
const RATE_BAND_MIN = 0.60;
const RATE_BAND_MAX = 1.40;

function useLiveRate() {
  const [rate, setRate] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${ORACLE_PRICE_URL}/api/prices/comparison`);
      if (res.ok) {
        const data = await res.json();
        const eurcUsd = data?.chainlink?.price;
        if (eurcUsd && eurcUsd > 0) {
          // EURC/USD price -> USDC/EURC rate = 1/eurcUsd
          setRate(1 / eurcUsd);
        }
      }
    } catch {
      // Oracle may not be running
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      await load();
      if (!cancelled) {
        timeoutRef.current = setTimeout(poll, 30000);
      }
    };
    poll();
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [load]);

  return rate;
}

export default function SettingsPage() {
  const policy = usePolicy();
  const { t } = useI18n();
  const { showToast } = useToast();
  const liveRate = useLiveRate();

  // Derive display values from on-chain data
  const onChainThresholdRaw = policy.threshold ? Number(policy.threshold) / 1e6 : 10;
  const onChainRateMin = policy.rateMin ? Number(policy.rateMin) / 1e18 : 0.80;
  const onChainRateMax = policy.rateMax ? Number(policy.rateMax) / 1e18 : 1.10;

  const [threshold, setThreshold] = useState(String(onChainThresholdRaw));
  const [rateMin, setRateMin] = useState(String(onChainRateMin));
  const [rateMax, setRateMax] = useState(String(onChainRateMax));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Update form when on-chain data loads
  useEffect(() => {
    if (policy.threshold !== null) {
      setThreshold(String(Number(policy.threshold) / 1e6));
    }
    if (policy.rateMin !== null) {
      setRateMin(String((Number(policy.rateMin) / 1e18).toFixed(4)));
    }
    if (policy.rateMax !== null) {
      setRateMax(String((Number(policy.rateMax) / 1e18).toFixed(4)));
    }
  }, [policy.threshold, policy.rateMin, policy.rateMax]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setTxHash(null);
    try {
      const res = await fetch(`${ORACLE_PRICE_URL}/api/policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threshold: Number(threshold),
          rateMin: Number(rateMin),
          rateMax: Number(rateMax),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update policy");
      setTxHash(data.txHash || null);
      const hashPreview = data.txHash ? ` (${data.txHash.slice(0, 10)}...)` : "";
      showToast(`${t("toast.policy_updated")}${hashPreview}`, "success");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("toast.error");
      setError(msg);
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const displayThreshold = (Number(threshold) * DISPLAY_MULTIPLIER).toLocaleString(
    "en-US",
    { style: "currency", currency: "USD", maximumFractionDigits: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {t("settings.title")}
        </h2>
        <p className="text-xs text-muted">
          {t("settings.subtitle")}
        </p>
      </div>

      {/* Current policy — real on-chain data */}
      <Card
        title={t("settings.current_policy")}
        badge={{
          label: policy.version ? `v${policy.version} ON-CHAIN` : "LOADING",
          color: "green",
        }}
      >
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            {policy.loading ? (
              <div className="mx-auto h-5 w-16 animate-pulse rounded bg-border" />
            ) : (
              <div className="font-tabular text-sm font-semibold text-foreground">
                {policy.threshold ? formatDisplayAmount(policy.threshold) : "—"}
              </div>
            )}
            <div className="mt-0.5 text-[11px] text-muted">{t("settings.threshold")}</div>
          </div>
          <div className="text-center">
            {policy.loading ? (
              <div className="mx-auto h-5 w-16 animate-pulse rounded bg-border" />
            ) : (
              <div className="font-tabular text-sm font-semibold text-foreground">
                {onChainRateMin.toFixed(4)}
              </div>
            )}
            <div className="mt-0.5 text-[11px] text-muted">Rate Min</div>
          </div>
          <div className="text-center">
            {policy.loading ? (
              <div className="mx-auto h-5 w-16 animate-pulse rounded bg-border" />
            ) : (
              <div className="font-tabular text-sm font-semibold text-foreground">
                {onChainRateMax.toFixed(4)}
              </div>
            )}
            <div className="mt-0.5 text-[11px] text-muted">Rate Max</div>
          </div>
        </div>
      </Card>

      {/* Update policy form */}
      <Card title="Update Policy" subtitle="Changes require on-chain transaction">
        <div className="space-y-4">
          {/* Threshold input */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              Auto-Execution Threshold
            </label>
            <div className="relative">
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                step="1"
                min="1"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-20 font-tabular text-sm text-foreground outline-none transition-colors focus:border-accent-blue"
                placeholder="10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted">
                raw USD
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
              <span>x1,000,000 display multiplier</span>
              <span className="font-tabular font-medium text-accent-blue">
                Displays as {displayThreshold}
              </span>
            </div>
          </div>

          {/* Rate band inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">
                Rate Band Min
              </label>
              <input
                type="number"
                value={rateMin}
                onChange={(e) => setRateMin(e.target.value)}
                step="0.0001"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-tabular text-sm text-foreground outline-none transition-colors focus:border-accent-blue"
                placeholder="0.8000"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">
                Rate Band Max
              </label>
              <input
                type="number"
                value={rateMax}
                onChange={(e) => setRateMax(e.target.value)}
                step="0.0001"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-tabular text-sm text-foreground outline-none transition-colors focus:border-accent-blue"
                placeholder="1.1000"
              />
            </div>
          </div>

          {/* Rate band visual */}
          <div className="rounded-lg bg-background p-3">
            <div className="mb-2 flex items-center justify-between text-[11px] text-muted">
              <span>Target Rate Band</span>
              <span className="font-tabular">
                {Number(rateMin).toFixed(4)} - {Number(rateMax).toFixed(4)}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-border">
              <div
                className="absolute h-full rounded-full bg-accent-blue/40"
                style={{
                  left: `${Math.max(0, Math.min(100, ((Number(rateMin) - RATE_BAND_MIN) / (RATE_BAND_MAX - RATE_BAND_MIN)) * 100))}%`,
                  right: `${Math.max(0, Math.min(100, 100 - ((Number(rateMax) - RATE_BAND_MIN) / (RATE_BAND_MAX - RATE_BAND_MIN)) * 100))}%`,
                }}
              />
              {liveRate !== null && (
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent-blue bg-background"
                  style={{
                    left: `${Math.max(0, Math.min(100, ((liveRate - RATE_BAND_MIN) / (RATE_BAND_MAX - RATE_BAND_MIN)) * 100))}%`,
                  }}
                />
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted/60">
              <span>{RATE_BAND_MIN.toFixed(4)}</span>
              <span className="text-accent-blue">
                {liveRate !== null ? `Current: ~${liveRate.toFixed(4)}` : "Current: loading..."}
              </span>
              <span>{RATE_BAND_MAX.toFixed(4)}</span>
            </div>
          </div>

          {/* Info notice */}
          <div className="rounded-lg border border-border bg-background p-2.5">
            <p className="text-[11px] text-muted">
              Policy updates are submitted via Sputnik DAO proposals to the FxBudget
              contract on NEAR testnet. In mock mode, changes take effect immediately.
            </p>
          </div>

          {/* Submit button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-blue py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-blue/90 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray="31.4"
                    strokeDashoffset="10"
                    strokeLinecap="round"
                  />
                </svg>
                Submitting...
              </>
            ) : (
              "Update Policy"
            )}
          </button>
          {error && (
            <p className="text-center text-xs text-accent-red">{error}</p>
          )}
          {txHash && (
            <div className="rounded-lg border border-accent-green/20 bg-accent-green/5 p-3 text-center">
              <p className="text-xs text-accent-green font-medium">Policy updated on-chain (Simulated)</p>
              <a
                href={`https://testnet.nearblocks.io/txns/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block font-mono text-[11px] text-accent-blue hover:underline break-all"
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)} ↗
              </a>
            </div>
          )}
        </div>
      </Card>

      {/* Testnet Token Faucet */}
      <TokenFaucet />
    </div>
  );
}

// ── Token Faucet ──────────────────────────────────────────────────

const FAUCET_TOKENS = [
  { key: "USDC" as const, symbol: "USDC", label: "Mint 5,000", amount: "5000000000" },
  { key: "EURC" as const, symbol: "EURC", label: "Mint 5,000", amount: "5000000000" },
] as const;

function TokenFaucet() {
  const { showToast } = useToast();
  const [minting, setMinting] = useState<string | null>(null);

  const handleMint = async (token: typeof FAUCET_TOKENS[number]) => {
    if (minting) return;
    setMinting(token.key);
    setTimeout(() => {
      showToast(`Credited ${token.label} ${token.symbol} (Simulated Testnet Faucet)`, "success");
      setMinting(null);
    }, 400);
  };

  return (
    <Card
      title="Testnet Faucet"
      subtitle="Simulated treasury funds on NEAR Testnet"
      badge={{ label: "TESTNET", color: "amber" }}
    >
      <div className="grid grid-cols-2 gap-3">
        {FAUCET_TOKENS.map((token) => {
          const isLoading = minting === token.key;
          return (
            <button
              key={token.key}
              onClick={() => handleMint(token)}
              disabled={minting !== null}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background py-4 text-sm font-medium text-foreground transition-all hover:border-accent-blue/50 hover:bg-accent-blue/5 active:scale-[0.97] disabled:opacity-50"
            >
              {isLoading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
              ) : (
                <span className="text-base font-semibold">{token.symbol}</span>
              )}
              <span className="text-[11px] text-muted">
                {isLoading ? "Minting..." : token.label}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

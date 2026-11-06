"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { SEPOLIA_TOKEN_META } from "@getnear/shared";
import type { SepoliaToken } from "@getnear/shared";

interface ShieldModalProps {
  token: string;
  maxBalance: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ShieldModal({ token, maxBalance, onClose, onSuccess }: ShieldModalProps) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<{
    evmTxHash: string;
    explorerUrl: string;
  } | null>(null);

  const handleMax = () => setAmount(maxBalance);

  const handleSubmit = async () => {
    if (loading) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (parsedAmount > Number(maxBalance)) {
      setError("Amount exceeds available balance");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convert human-readable amount to raw units
      const meta = SEPOLIA_TOKEN_META[token as SepoliaToken];
      const decimals = meta?.decimals ?? 18;
      const rawAmount = parseUnits(amount, decimals).toString();

      const res = await fetch("/api/privacy/shield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, amount: rawAmount }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setTxResult({
        evmTxHash: data.evmTxHash,
        explorerUrl: data.explorerUrl,
      });

      // Auto-close after showing success briefly
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Shield transaction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Shield {token} to Private Treasury
          </h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-border hover:text-foreground transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {txResult ? (
          /* Success state */
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-green/15">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-accent-green">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm font-medium text-foreground">Shield Submitted</p>
            <p className="text-[11px] text-muted">
              {amount} {token} is being shielded to your private treasury
            </p>
            <a
              href={txResult.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
            >
              View on Basescan
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        ) : (
          /* Input state */
          <>
            {/* Amount input */}
            <div className="mb-4">
              <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted">
                Amount ({token})
              </label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setError(null); }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-3 pr-16 font-mono text-lg text-foreground outline-none focus:border-purple-500 transition-colors"
                  placeholder="0.00"
                  disabled={loading}
                />
                <button
                  onClick={handleMax}
                  disabled={loading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-purple-500/15 px-2.5 py-1 text-[10px] font-bold text-purple-400 hover:bg-purple-500/25 transition-colors disabled:opacity-50"
                >
                  MAX
                </button>
              </div>
              <div className="mt-1 text-[10px] text-muted">
                Available: <span className="font-tabular">{maxBalance}</span> {token}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-3 rounded-lg border border-accent-red/20 bg-accent-red/5 px-3 py-2 text-xs text-accent-red">
                {error}
              </div>
            )}

            {/* Loading info */}
            {loading && (
              <div className="mb-3 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                  <span className="text-[11px] text-purple-400">
                    Processing Unlink deposit... this may take ~30s
                  </span>
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={loading || !amount || Number(amount) <= 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 text-sm font-semibold text-white transition-all hover:bg-purple-500 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Shielding...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Shield to Private Treasury
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

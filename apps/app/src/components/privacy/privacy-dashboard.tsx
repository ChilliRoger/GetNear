"use client";

import { useState } from "react";
import { Card } from "@/components/card";
import { useI18n } from "@/lib/i18n";
import { usePrivacyStatus, useShieldedBalances } from "@/lib/privacy-hooks";
import { UnshieldModal } from "./unshield-modal";
import { ShieldHistory } from "./shield-history";

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} />;
}

export function PrivacyDashboard() {
  const { t } = useI18n();
  const status = usePrivacyStatus();
  const shielded = useShieldedBalances();
  const [unshieldTarget, setUnshieldTarget] = useState<{
    symbol: string;
    token: string;
    displayAmount: string;
  } | null>(null);

  // Not connected state
  if (!status.loading && !status.data?.connected) {
    return (
      <div className="space-y-4">
        <TestnetBadge />
        <Card title={t("privacy.pool_balance")}>
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-purple-400">
                <path
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-sm text-muted">{t("privacy.not_configured")}</p>
            <p className="text-[10px] text-muted/60 text-center max-w-[240px]">
              Start the privacy sidecar to enable private treasury features
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const balances = shielded.data?.balances ?? [];

  return (
    <div className="space-y-4">
      <TestnetBadge />

      {/* Explanation */}
      <div className="rounded-xl border border-purple-500/15 bg-purple-500/5 px-4 py-3">
        <p className="text-[11px] leading-relaxed text-muted">
          {t("privacy.dashboard_explainer")}
        </p>
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-2 rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-2.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-purple-500" />
        </span>
        <span className="text-xs font-medium text-purple-400">
          Unlink Shielded Private Treasury
        </span>
        <span className="ml-auto text-[10px] text-muted">
          {status.data?.network || "base-sepolia"}
        </span>
      </div>

      {/* Shielded balances */}
      <Card
        title="Shielded Balances"
        badge={{ label: "PRIVATE", color: "blue" }}
        className="border-l-2 border-l-purple-500/40"
      >
        {shielded.loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-28" />
          </div>
        ) : balances.length > 0 ? (
          <div className="space-y-2">
            {balances.map((bal) => (
              <div key={bal.token} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    {bal.symbol}
                  </span>
                  <span className="font-tabular text-xs font-semibold text-foreground">
                    {bal.displayAmount}
                  </span>
                </div>
                <button
                  onClick={() =>
                    setUnshieldTarget({
                      symbol: bal.symbol,
                      token: bal.token,
                      displayAmount: bal.displayAmount,
                    })
                  }
                  className="rounded-lg bg-accent-green/15 px-3 py-1 text-[10px] font-semibold text-accent-green hover:bg-accent-green/25 transition-colors"
                >
                  Unshield
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-2 text-center text-xs text-muted">No shielded balances yet</p>
        )}
      </Card>

      {/* Shield history */}
      <ShieldHistory />

      {/* Unshield modal */}
      {unshieldTarget && (
        <UnshieldModal
          token={unshieldTarget.symbol}
          tokenAddress={unshieldTarget.token}
          maxBalance={unshieldTarget.displayAmount}
          onClose={() => setUnshieldTarget(null)}
          onSuccess={() => setUnshieldTarget(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function TestnetBadge() {
  return (
    <div className="flex items-center justify-center">
      <span className="rounded-full border border-accent-amber/30 bg-accent-amber/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-amber">
        Base Sepolia Testnet
      </span>
    </div>
  );
}

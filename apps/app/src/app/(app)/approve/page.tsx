"use client";

import { useState } from "react";
import { Card } from "@/components/card";
import { useToast } from "@/components/toast-provider";
import { usePendingTrades } from "@/lib/hooks";
import { formatDisplayAmount } from "@getnear/shared";
import { formatBps } from "@/lib/format";
import { SAVINGS_BPS } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";

function formatTimeRemaining(expiresAtSec: bigint): string {
  const diff = Number(expiresAtSec) * 1000 - Date.now();
  if (diff <= 0) return "Expired";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m remaining`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m remaining`;
}

function formatRateBigInt(rateX18: bigint): string {
  return (Number(rateX18) / 1e18).toFixed(4);
}

export default function ApprovePage() {
  const { trades, loading } = usePendingTrades();
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [verifying, setVerifying] = useState<string | null>(null);
  const { t } = useI18n();
  const { showToast } = useToast();

  const handleApprove = async (tradeId: string) => {
    setVerifying(tradeId);
    try {
      const res = await fetch(`/api/oracle/api/trades/${tradeId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.ok) {
        setVerified((prev) => ({ ...prev, [tradeId]: true }));
        showToast("Order approved by council (simulated DAO vote)", "success");
      } else {
        showToast(data.error || t("toast.error"), "error");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("toast.error");
      console.error("Verification failed:", e);
      showToast(msg, "error");
    } finally {
      setVerifying(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t("approve.title")}
          </h2>
          <p className="text-xs text-muted">
            {t("approve.subtitle")}
          </p>
        </div>
        {trades.length > 0 && (
          <span className="pulse-subtle flex h-6 w-6 items-center justify-center rounded-full bg-accent-amber/20 text-xs font-bold text-accent-amber">
            {trades.length}
          </span>
        )}
      </div>

      {/* Loading state */}
      {loading ? (
        <Card title={t("approve.loading")}>
          <div className="flex flex-col items-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
            <p className="mt-3 text-xs text-muted">{t("approve.loading_desc")}</p>
          </div>
        </Card>
      ) : trades.length === 0 ? (
        <Card title={t("approve.all_clear")}>
          <div className="flex flex-col items-center py-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-green/15">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                className="text-accent-green"
              >
                <path
                  d="M9 12l2 2 4-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <p className="text-sm text-muted">{t("approve.no_pending")}</p>
            <p className="mt-1 text-[11px] text-muted/60">
              {t("approve.all_within")}
            </p>
          </div>
        </Card>
      ) : (
        trades.map((trade) => {
          const tradeIdStr = trade.tradeId.slice(0, 10) + "...";
          return (
            <Card
              key={trade.tradeId}
              title={(() => {
                // Determine direction from exchange rate: rate > 1 means EURC/USD > 1, so USDC -> EURC
                const rate = Number(trade.exchangeRate) / 1e18;
                return rate >= 1 ? "USDC to EURC" : "EURC to USDC";
              })()}
              subtitle={tradeIdStr}
              badge={{ label: t("approve.pending"), color: "amber" }}
            >
              <div className="space-y-3">
                {/* Amount */}
                <div className="rounded-lg bg-background p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">{t("approve.amount")}</span>
                    <span className="font-tabular text-lg font-semibold text-foreground">
                      {formatDisplayAmount(trade.fromAmount)}
                    </span>
                  </div>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-3">
                  <DetailRow
                    label={t("approve.exchange_rate")}
                    value={formatRateBigInt(trade.exchangeRate)}
                  />
                  <DetailRow
                    label={t("approve.you_receive")}
                    value={formatDisplayAmount(trade.toAmount, "EUR")}
                  />
                  <DetailRow
                    label={t("approve.projected_savings")}
                    value={formatBps(SAVINGS_BPS) + " " + t("approve.vs_bank")}
                    valueColor="text-accent-green"
                  />
                  <DetailRow
                    label={t("approve.expires")}
                    value={formatTimeRemaining(trade.expiresAt)}
                    valueColor="text-accent-amber"
                  />
                </div>

                {/* Policy context */}
                <div className="rounded-lg border border-accent-amber/20 bg-accent-amber/5 p-2.5">
                  <p className="text-[11px] text-accent-amber">
                    {t("approve.exceeds_threshold")}
                  </p>
                </div>

                {/* Verified success banner */}
                {verified[trade.tradeId] && (
                  <div className="rounded-lg border border-accent-green/20 bg-accent-green/5 p-2.5">
                    <p className="text-[11px] text-accent-green">
                      {t("approve.verified_msg")}
                    </p>
                  </div>
                )}

                {/* Approve button */}
                <button
                  onClick={() => handleApprove(trade.tradeId)}
                  disabled={verifying === trade.tradeId || verified[trade.tradeId]}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-blue py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-blue/90 active:scale-[0.98] disabled:opacity-50"
                >
                  {verified[trade.tradeId] ? (
                    <>
                      <CheckIcon />
                      {t("approve.btn_approved")}
                    </>
                  ) : verifying === trade.tradeId ? (
                    <>
                      <LoadingSpinner />
                      {t("approve.btn_verifying")}
                    </>
                  ) : (
                    <>
                      <CouncilIcon />
                      {t("approve.btn_approve")}
                    </>
                  )}
                </button>
              </div>
            </Card>
          );
        })
      )}

      {/* Recent approvals section */}
      <Card title={t("approve.recent_title")} subtitle={t("approve.recent_subtitle")}>
        <div className="flex flex-col items-center py-4 text-center">
          <p className="text-xs text-muted/60">
            {t("approve.recent_empty")}
          </p>
        </div>
      </Card>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueColor = "text-foreground",
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`font-tabular text-xs font-medium ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
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
  );
}

function CouncilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-accent-green">
      <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

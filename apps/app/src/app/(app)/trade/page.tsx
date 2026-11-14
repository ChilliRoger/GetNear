"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/card";
import { LiveQuoteCard } from "@/components/live-quote-card";
import { RateChart } from "@/components/rate-chart";
import { AiOrderIntake } from "@/components/ai-order-intake";
import { useToast } from "@/components/toast-provider";
import { useNearWallet } from "@/lib/near-wallet";
import type { ParsedOrderData } from "@getnear/shared";
import { CheckCircle2, AlertCircle, PlusCircle } from "lucide-react";

export default function TradePage() {
  const { accountId, connect, signAndSendTransaction } = useNearWallet();
  const { showToast } = useToast();

  const [contractId] = useState("fx-budget.chilliroger-operator.testnet");
  const [amount, setAmount] = useState("50");
  const [maxChunk, setMaxChunk] = useState("20");
  const [maxDevBps, setMaxDevBps] = useState("120");
  const [deadlineHours, setDeadlineHours] = useState("4");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [targetEure, setTargetEure] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [autoCapUsdc, setAutoCapUsdc] = useState(100);
  const [maxChunkLimitUsdc, setMaxChunkLimitUsdc] = useState(20);
  const [usdcContractId, setUsdcContractId] = useState(
    "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af",
  );
  const [userCircleUsdc, setUserCircleUsdc] = useState(0);
  const [fundWithCircleEscrow, setFundWithCircleEscrow] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Live quote estimates
  const [quoteRate, setQuoteRate] = useState<number | null>(null);
  const [refRate, setRefRate] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);

  const numAmount = parseFloat(amount) || 0;
  const isAboveCap = numAmount > autoCapUsdc;

  useEffect(() => {
    const url = accountId ? `/api/near?account=${encodeURIComponent(accountId)}` : "/api/near";
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.contract?.limits?.auto_cap_in) {
          setAutoCapUsdc(Number(d.contract.limits.auto_cap_in) / 1e6);
        }
        if (d?.contract?.limits?.max_chunk_in) {
          setMaxChunkLimitUsdc(Number(d.contract.limits.max_chunk_in) / 1e6);
        }
        if (d?.tokens?.usdcId) {
          setUsdcContractId(d.tokens.usdcId);
        }
        if (typeof d?.tokens?.userUsdc === "number") {
          setUserCircleUsdc(d.tokens.userUsdc);
        }
      })
      .catch(() => {});
  }, [accountId]);

  useEffect(() => {
    let cancelled = false;
    const fetchQuote = async () => {
      setQuoteLoading(true);
      try {
        const res = await fetch(`/api/quotes?amount=${numAmount > 0 ? numAmount : 10}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.quote?.rate) {
            setQuoteRate(data.quote.rate);
          }
          if (data.reference?.rate) {
            setRefRate(data.reference.rate);
          }
        }
      } catch (err) {
        console.warn("Failed to fetch quote:", err);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    };

    fetchQuote();
    const timer = setInterval(fetchQuote, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [numAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) {
      showToast("Please connect your testnet wallet first", "error");
      return;
    }
    if (!numAmount || numAmount <= 0) {
      showToast("Please enter a valid order amount", "error");
      return;
    }

    setSubmitting(true);
    try {
      const chunkInNum = parseFloat(maxChunk || "20");
      if (!chunkInNum || chunkInNum <= 0) {
        showToast("Please enter a valid max chunk size", "error");
        return;
      }
      if (chunkInNum > maxChunkLimitUsdc) {
        showToast(
          `Max chunk size ($${chunkInNum} USDC) exceeds contract limit ($${maxChunkLimitUsdc} USDC). Enter ${maxChunkLimitUsdc} or less.`,
          "error",
        );
        return;
      }

      const totalIn = BigInt(Math.round(numAmount * 1e6)).toString();
      const chunkIn = BigInt(Math.round(chunkInNum * 1e6)).toString();
      const devBps = parseInt(maxDevBps || "120", 10);
      const hours = parseFloat(deadlineHours || "4");
      const deadlineNs = Date.now() * 1_000_000 + Math.round(hours * 3600 * 1_000_000_000);
      const trimmedRecipient = recipientAccount.trim();
      const targetEureNum = parseFloat(targetEure);
      const targetOutAtomic =
        targetEureNum > 0 ? BigInt(Math.round(targetEureNum * 1e6)).toString() : undefined;
      const trimmedInvoiceRef = invoiceRef.trim();

      if (!targetOutAtomic) {
        showToast("Invoice target required: enter the EURe amount due. On-chain payouts are bounded by it.", "error");
        return;
      }

      if (fundWithCircleEscrow && numAmount > userCircleUsdc) {
        showToast(
          `Connected wallet has ${userCircleUsdc.toFixed(2)} Circle USDC. Lower amount or uncheck Circle USDC Escrow.`,
          "error",
        );
        return;
      }

      const res = fundWithCircleEscrow
        ? await signAndSendTransaction({
            receiverId: usdcContractId,
            methodName: "ft_transfer_call",
            args: {
              receiver_id: contractId,
              amount: totalIn,
              memo: `Fund GetNear order (${numAmount} Circle USDC)`,
              msg: JSON.stringify({
                action: "create_escrowed_order",
                pair_label: "USDC/EURe",
                max_chunk_in: chunkIn,
                deadline_ns: deadlineNs,
                max_dev_bps: devBps,
                ...(trimmedRecipient ? { recipient: trimmedRecipient } : {}),
                ...(targetOutAtomic ? { target_out: targetOutAtomic } : {}),
                ...(trimmedInvoiceRef ? { invoice_ref: trimmedInvoiceRef } : {}),
              }),
            },
            depositYocto: "1",
            gasUnits: "120.0 Tgas",
          })
        : await signAndSendTransaction({
            receiverId: contractId,
            methodName: "create_order",
            args: {
              pair_label: "USDC/EURe",
              total_in: totalIn,
              max_chunk_in: chunkIn,
              deadline_ns: deadlineNs,
              max_dev_bps: devBps,
              ...(trimmedRecipient ? { recipient: trimmedRecipient } : {}),
              ...(targetOutAtomic ? { target_out: targetOutAtomic } : {}),
              ...(trimmedInvoiceRef ? { invoice_ref: trimmedInvoiceRef } : {}),
            },
          });

      const modeTag = fundWithCircleEscrow ? "Circle USDC Escrowed" : "Budget-Only";
      const label = numAmount <= autoCapUsdc ? "Active (Auto-Approved)" : "Pending (Submitted to Sputnik DAO)";
      showToast(`Order created (${modeTag}): ${numAmount} USDC [${label}]`, {
        type: "success",
        explorerUrl: res.explorerUrl,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Order submission failed: ${msg}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const estimatedOut = quoteRate && numAmount > 0 ? (numAmount * quoteRate).toFixed(2) : "—";

  return (
    <div className="space-y-4">
      {/* 1. Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Create invoice order</h1>
        <p className="text-xs text-muted">
          Goal-based conversions on NEAR testnet with automated TWAP chunking and DAO-enforced spending limits.
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-12">
      <form onSubmit={handleSubmit} className="min-w-0 space-y-3 lg:col-span-7">
        <Card title="Order Parameters">
          <div className="space-y-3 pt-1 text-xs">
            <AiOrderIntake
              onApply={(parsed: ParsedOrderData) => {
                setAmount(String(parsed.totalUsdc));
                if (parsed.maxChunkUsdc !== null) {
                  const clamped = Math.min(parsed.maxChunkUsdc, maxChunkLimitUsdc);
                  setMaxChunk(String(clamped));
                  if (parsed.maxChunkUsdc > maxChunkLimitUsdc) {
                    showToast(`Max chunk capped at contract limit ($${maxChunkLimitUsdc} USDC)`, "info");
                  }
                }
                if (parsed.deadlineHours !== null) setDeadlineHours(String(Math.max(1, Math.round(parsed.deadlineHours))));
                if (parsed.maxDevBps !== null) setMaxDevBps(String(parsed.maxDevBps));
                if (parsed.recipient !== null) setRecipientAccount(parsed.recipient);
                if (parsed.targetEuRe !== null) setTargetEure(String(parsed.targetEuRe));
                if (parsed.invoiceRef !== null) setInvoiceRef(parsed.invoiceRef);
                if (parsed.fundingMode === "circle_escrow") setFundWithCircleEscrow(true);
                if (parsed.fundingMode === "accounting") setFundWithCircleEscrow(false);
                showToast("AI draft applied to order form. Review all fields before signing.", "info");
              }}
            />
            {/* Pair display */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5">
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wider">Trading Pair</div>
                <div className="font-semibold text-sm text-foreground">USDC &rarr; EURe</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-muted uppercase tracking-wider">Rate Reference</div>
                <div className="text-xs text-accent-blue">1Click Dry-Quote + ECB</div>
              </div>
            </div>

            {/* Amount input */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-medium text-foreground">Total Input Amount (USDC)</label>
                <span className="text-[10px] text-muted ">Auto-Cap: {autoCapUsdc.toFixed(2)} USDC</span>
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent-blue focus:outline-none"
                placeholder="50"
              />
            </div>

            {/* Quick buttons */}
            <div className="grid grid-cols-4 gap-1.5">
              {["20", "50", "100", "250"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(preset)}
                  className={`py-1 rounded border text-xs transition-colors ${
                    amount === preset
                      ? "border-accent-blue bg-accent-blue/15 text-accent-blue font-bold"
                      : "border-border bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  ${preset}
                </button>
              ))}
            </div>

            {/* Threshold condition badge */}
            <div
              className={`rounded-lg p-2.5 text-xs flex items-center justify-between ${
                isAboveCap
                  ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                  : "bg-green-500/10 border border-green-500/20 text-green-400"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {isAboveCap ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                <div>
                  <div className="font-semibold">
                    {isAboveCap ? "Requires Sputnik DAO Approval" : "Auto-Approved Order"}
                  </div>
                  <div className="text-[10px] opacity-80">
                    {isAboveCap
                      ? `Exceeds $${autoCapUsdc} auto-cap — creates a 2-of-3 council proposal`
                      : `Within $${autoCapUsdc} auto-cap — becomes Active immediately`}
                  </div>
                </div>
              </div>
            </div>

            {/* Execution Tuning */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] text-muted block">Max Chunk Size (USDC)</label>
                  <span className="text-[10px] text-muted ">Limit: ${maxChunkLimitUsdc} USDC</span>
                </div>
                <input
                  type="number"
                  value={maxChunk}
                  onChange={(e) => setMaxChunk(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-accent-blue focus:outline-none"
                  placeholder="20"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted block mb-1">Max Deviation (bps)</label>
                <input
                  type="number"
                  value={maxDevBps}
                  onChange={(e) => setMaxDevBps(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-accent-blue focus:outline-none"
                  placeholder="120"
                />
              </div>
            </div>

            {/* Deadline selection */}
            <div>
              <label className="text-[11px] text-muted block mb-1">Execution Deadline</label>
              <div className="grid grid-cols-4 gap-1.5">
                {["1", "4", "12", "24"].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setDeadlineHours(h)}
                    className={`py-1 rounded border text-xs transition-colors ${
                      deadlineHours === h
                        ? "border-accent-blue bg-accent-blue/15 text-accent-blue font-bold"
                        : "border-border bg-surface text-muted hover:text-foreground"
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Supplier Invoice Payable */}
            <div className="rounded-lg border border-border bg-background/60 p-2.5 space-y-2">
              <div className="text-[11px] font-medium text-muted">
                Optional Supplier Invoice Payable (EURe settled via on-chain callback)
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] text-muted block mb-1">Supplier Account</label>
                  <input
                    type="text"
                    value={recipientAccount}
                    onChange={(e) => setRecipientAccount(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-accent-blue focus:outline-none"
                    placeholder={accountId || "supplier.testnet"}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted block mb-1">Target Due (EURe)</label>
                  <input
                    type="number"
                    value={targetEure}
                    onChange={(e) => setTargetEure(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-accent-blue focus:outline-none"
                    placeholder="1000"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-1">Invoice Reference</label>
                <input
                  type="text"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-accent-blue focus:outline-none"
                  placeholder="INV-2026-001"
                />
              </div>
            </div>

            <label className="flex items-start gap-2 rounded-lg border border-border bg-background/60 p-2.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={fundWithCircleEscrow}
                onChange={(e) => setFundWithCircleEscrow(e.target.checked)}
                className="mt-0.5 rounded border-border accent-accent-blue"
              />
              <div>
                <div className="font-medium text-foreground">
                  Lock Real Circle Native USDC Escrow (ft_transfer_call)
                </div>
                <div className="text-[10px] text-muted">
                  Connected balance: {userCircleUsdc.toFixed(2)} Circle USDC (auto-refunds unspent balance on cancel/expiry)
                </div>
              </div>
            </label>
          </div>
        </Card>

        {/* 3. Output Estimate Card */}
        <Card title="Indicative Quote & Callback Settlement Preview">
          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <div className="text-[11px] text-muted">
                {fundWithCircleEscrow ? "Circle USDC Escrow Input" : "FX Budget Input (Simulated Swap)"}
              </div>
              <div className="text-sm font-semibold text-foreground">{numAmount} USDC</div>
            </div>
            <div>
              <div className="text-[11px] text-muted">Est. On-Chain Payout (EURe)</div>
              <div className="text-sm font-semibold text-green-400">
                {quoteLoading ? "Fetching quote..." : `~${estimatedOut} EURe`}
              </div>
            </div>
            <div className="col-span-2 text-[10px] text-muted pt-1 border-t border-border flex justify-between">
              <span>Indicative Quote Rate: {quoteRate ? quoteRate.toFixed(4) : "—"}</span>
              <span>ECB Ref Rate: {refRate ? refRate.toFixed(4) : "—"}</span>
            </div>
          </div>
        </Card>

        {!accountId ? (
          <button
            type="button"
            onClick={() => connect()}
            className="w-full flex items-center justify-center gap-2 border border-info bg-info/10 py-3 text-xs font-bold text-info hover:bg-info/20 transition-colors tracking-wider"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Connect testnet wallet to create order</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 border border-brand bg-brand py-3 text-xs font-bold text-background hover:bg-brand/90 disabled:opacity-50 transition-colors tracking-wider"
          >
            <PlusCircle className="h-4 w-4" />
            <span>{submitting ? "Signing & submitting to NEAR testnet..." : "Sign & create order on NEAR testnet →"}</span>
          </button>
        )}
      </form>
      <aside className="min-w-0 space-y-4 lg:col-span-5">
        <LiveQuoteCard />
        <Card title="USDC / EURe" subtitle="1Click dry quote vs ECB reference">
          <RateChart height={220} defaultHours={6} />
        </Card>
      </aside>
      </div>
    </div>
  );
}

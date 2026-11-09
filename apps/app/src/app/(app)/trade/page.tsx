"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/card";
import { useToast } from "@/components/toast-provider";
import { useNearWallet } from "@/lib/near-wallet";
import { CheckCircle2, AlertCircle, PlusCircle } from "lucide-react";

export default function TradePage() {
  const { accountId, connect, signAndSendTransaction } = useNearWallet();
  const { showToast } = useToast();

  const [contractId] = useState("fx-budget.chilliroger-operator.testnet");
  const [amount, setAmount] = useState("50");
  const [maxChunk, setMaxChunk] = useState("20");
  const [maxDevBps, setMaxDevBps] = useState("120");
  const [deadlineHours, setDeadlineHours] = useState("4");
  const [submitting, setSubmitting] = useState(false);

  // Live quote estimates
  const [quoteRate, setQuoteRate] = useState<number | null>(null);
  const [refRate, setRefRate] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);

  const numAmount = parseFloat(amount) || 0;
  const isAboveCap = numAmount > 100;

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
      const totalIn = BigInt(Math.round(numAmount * 1e6)).toString();
      const chunkIn = BigInt(Math.round(parseFloat(maxChunk || "20") * 1e6)).toString();
      const devBps = parseInt(maxDevBps || "120", 10);
      const hours = parseFloat(deadlineHours || "4");
      const deadlineNs = Date.now() * 1_000_000 + Math.round(hours * 3600 * 1_000_000_000);

      const res = await signAndSendTransaction({
        receiverId: contractId,
        methodName: "create_order",
        args: {
          pair_label: "USDC/EURe",
          total_in: totalIn,
          max_chunk_in: chunkIn,
          deadline_ns: deadlineNs,
          max_dev_bps: devBps,
        },
      });

      const label = numAmount <= 100 ? "Active (Auto-Approved)" : "Pending (Submitted to Sputnik DAO)";
      showToast(`Order created successfully: ${numAmount} USDC [${label}]`, {
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
        <h2 className="text-lg font-semibold text-foreground">Create Treasury FX Goal</h2>
        <p className="text-xs text-muted">
          Goal-based conversions on NEAR testnet with automated TWAP chunking and DAO-enforced spending limits.
        </p>
      </div>

      {/* 2. Order Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Card title="Order Parameters">
          <div className="space-y-3 pt-1 text-xs">
            {/* Pair display */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5">
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wider">Trading Pair</div>
                <div className="font-semibold text-sm text-foreground">USDC &rarr; EURe</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-muted uppercase tracking-wider">Rate Reference</div>
                <div className="font-mono text-xs text-accent-blue">1Click Dry-Quote + ECB</div>
              </div>
            </div>

            {/* Amount input */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-medium text-foreground">Total Input Amount (USDC)</label>
                <span className="text-[10px] text-muted font-mono">Auto-Cap: 100.00 USDC</span>
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-accent-blue focus:outline-none"
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
                  className={`py-1 rounded border text-xs font-mono transition-colors ${
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
                      ? "Exceeds $100 auto-cap — creates a 2-of-3 council proposal"
                      : "Within $100 auto-cap — becomes Active immediately"}
                  </div>
                </div>
              </div>
            </div>

            {/* Execution Tuning */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
              <div>
                <label className="text-[11px] text-muted block mb-1">Max Chunk Size (USDC)</label>
                <input
                  type="number"
                  value={maxChunk}
                  onChange={(e) => setMaxChunk(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground focus:border-accent-blue focus:outline-none"
                  placeholder="20"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted block mb-1">Max Deviation (bps)</label>
                <input
                  type="number"
                  value={maxDevBps}
                  onChange={(e) => setMaxDevBps(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground focus:border-accent-blue focus:outline-none"
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
                    className={`py-1 rounded border text-xs font-mono transition-colors ${
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
          </div>
        </Card>

        {/* 3. Output Estimate Card */}
        <Card title="Simulated Output Preview">
          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <div className="text-[11px] text-muted">You Send (Testnet)</div>
              <div className="font-mono text-sm font-semibold text-foreground">{numAmount} USDC</div>
            </div>
            <div>
              <div className="text-[11px] text-muted">Estimated Output (Simulated)</div>
              <div className="font-mono text-sm font-semibold text-green-400">
                {quoteLoading ? "Fetching quote..." : `~${estimatedOut} EURe`}
              </div>
            </div>
            <div className="col-span-2 text-[10px] text-muted font-mono pt-1 border-t border-border flex justify-between">
              <span>Indicative Quote Rate: {quoteRate ? quoteRate.toFixed(4) : "—"}</span>
              <span>ECB Ref Rate: {refRate ? refRate.toFixed(4) : "—"}</span>
            </div>
          </div>
        </Card>

        {!accountId ? (
          <button
            type="button"
            onClick={() => connect()}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-accent-blue/40 bg-accent-blue/15 py-2.5 text-xs font-semibold text-accent-blue hover:bg-accent-blue/25 transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Connect Test Wallet to Create Order</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-accent-blue py-2.5 text-xs font-semibold text-white hover:bg-accent-blue/90 disabled:opacity-50 transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            <span>{submitting ? "Signing & Submitting to NEAR Testnet..." : "Create Order on NEAR Testnet"}</span>
          </button>
        )}
      </form>
    </div>
  );
}

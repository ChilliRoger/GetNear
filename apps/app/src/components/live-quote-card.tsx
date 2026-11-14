"use client";

import { useState, useEffect } from "react";

interface QuoteData {
  quote: {
    amountIn: string;
    amountOut: string;
    rate: number;
    source: string;
    quoteId: string;
    timeEstimate?: number;
    signature?: string;
  };
  reference: {
    pair: string;
    rate: number;
    source: string;
    timestamp: number;
  };
  deviationBps: number;
  deviationPercent: string;
  isSimulated: boolean;
  route: {
    pair: string;
    recommendedMinChunkUsd: number;
  };
}

export function LiveQuoteCard() {
  const [data, setData] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(10);

  const fetchQuote = async (val: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes?amount=${val}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote(amount);
  }, [amount]);

  return (
    <div className="border border-border bg-surface p-4 text-foreground font-mono">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-border/60 gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
            <span className="text-[#00ec97]">┌─</span>
            <span>[ LIVE FX RATE DISCOVERY ]</span>
          </div>
          <div className="text-sm font-semibold text-foreground mt-0.5 pl-3">
            USDC / EURe Market Quote vs ECB Reference
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#090a0f] p-0.5 border border-border text-xs">
            {[10, 50, 100].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setAmount(val)}
                className={`px-2 py-0.5 text-[11px] transition-colors ${
                  amount === val
                    ? "bg-[#00ec97] text-[#090a0f] font-bold"
                    : "text-muted hover:text-foreground"
                }`}
              >
                ${val}
              </button>
            ))}
          </div>
          <span className="text-[10px] uppercase px-1.5 py-0.5 border border-border bg-[#090a0f] text-muted">
            DRY QUOTE
          </span>
          <button
            onClick={() => fetchQuote(amount)}
            disabled={loading}
            className="text-[11px] px-2.5 py-0.5 border border-border bg-surface hover:border-[#00ec97] hover:text-[#00ec97] transition-colors disabled:opacity-50"
          >
            {loading ? "[...]" : "[REFRESH]"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="py-4 text-xs text-red-400">
          Failed to load live quote: {error}
        </div>
      ) : !data ? (
        <div className="py-4 text-xs text-muted">
          Fetching quote from 1Click and ECB...
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="p-2.5 bg-[#090a0f] border border-border">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                1CLICK DRY QUOTE
              </div>
              <div className="text-lg font-bold text-foreground mt-1">
                {data.quote.rate.toFixed(5)}
              </div>
              <div className="text-[10px] text-muted mt-0.5">
                EURe per USDC ({data.quote.source})
              </div>
            </div>

            <div className="p-2.5 bg-[#090a0f] border border-border">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                ECB OFFICIAL REF
              </div>
              <div className="text-lg font-bold text-foreground mt-1">
                {data.reference.rate.toFixed(5)}
              </div>
              <div className="text-[10px] text-muted mt-0.5">
                EUR per USD ({data.reference.source})
              </div>
            </div>

            <div className="p-2.5 bg-[#090a0f] border border-border">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                SPREAD DEVIATION
              </div>
              <div
                className={`text-lg font-bold mt-1 ${
                  Math.abs(data.deviationBps) <= 50
                    ? "text-[#00ec97]"
                    : Math.abs(data.deviationBps) <= 120
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {data.deviationBps > 0 ? "+" : ""}
                {data.deviationBps} bps
              </div>
              <div className="text-[10px] text-muted mt-0.5">
                {data.deviationPercent} vs ECB reference
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between text-xs text-muted pt-2 border-t border-border/40 gap-2">
            <div>
              <span>Probe Size: </span>
              <span className="font-semibold text-foreground">${amount}.00 USDC</span>
              <span className="mx-2 text-border">|</span>
              <span>Min Feasible Chunk: </span>
              <span className="font-semibold text-[#00ec97]">
                ${data.route.recommendedMinChunkUsd}.00 USDC
              </span>
            </div>
            <div className="text-[10px] text-muted/70">
              Correlation ID: {data.quote.quoteId.slice(0, 16)}...
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

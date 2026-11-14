"use client";

import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "@/components/card";

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
      setData(await res.json());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote(amount);
  }, [amount]);

  const dev = data?.deviationBps ?? 0;
  const devTone = Math.abs(dev) <= 50 ? "text-ok" : Math.abs(dev) <= 120 ? "text-warn" : "text-danger";

  return (
    <Card
      title="Live FX quote"
      subtitle="1Click dry quote vs ECB reference (indicative, simulated fill)"
      actions={
        <>
          <div className="flex rounded-md border border-border-bright bg-surface-2 p-0.5">
            {[10, 50, 100].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setAmount(val)}
                className={`num rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                  amount === val ? "bg-border-bright text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                ${val}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => fetchQuote(amount)}
            disabled={loading}
            aria-label="Refresh quote"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border-bright text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </>
      }
    >
      {error ? (
        <div className="py-2 text-xs text-danger">Failed to load live quote: {error}</div>
      ) : !data ? (
        <div className="py-2 text-xs text-muted">Fetching quote from 1Click and ECB…</div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 divide-x divide-border rounded-md border border-border bg-background/40">
            <Cell label="1Click quote" value={data.quote.rate.toFixed(5)} sub="EURe per USDC" />
            <Cell label="ECB reference" value={data.reference.rate.toFixed(5)} sub="EUR per USD" />
            <Cell label="Deviation" value={`${dev > 0 ? "+" : ""}${dev} bps`} sub={`${data.deviationPercent} vs ECB`} tone={devTone} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
            <span>
              Probe <span className="num font-medium text-foreground">${amount}.00 USDC</span>
              <span className="mx-2 text-border-bright">|</span>
              Min feasible chunk <span className="num font-medium text-brand">${data.route.recommendedMinChunkUsd}.00</span>
            </span>
            <span className="num">id {data.quote.quoteId.slice(0, 8)}…</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function Cell({ label, value, sub, tone = "text-foreground" }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="px-3 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`num mt-1 text-base font-semibold leading-none ${tone}`}>{value}</div>
      <div className="mt-1.5 text-[10px] text-muted">{sub}</div>
    </div>
  );
}

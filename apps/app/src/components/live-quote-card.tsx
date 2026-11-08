"use client"

import { useState, useEffect } from "react"

interface QuoteData {
  quote: {
    amountIn: string
    amountOut: string
    rate: number
    source: string
    quoteId: string
    timeEstimate?: number
    signature?: string
  }
  reference: {
    pair: string
    rate: number
    source: string
    timestamp: number
  }
  deviationBps: number
  deviationPercent: string
  isSimulated: boolean
  route: {
    pair: string
    recommendedMinChunkUsd: number
  }
}

export function LiveQuoteCard() {
  const [data, setData] = useState<QuoteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [amount, setAmount] = useState<number>(10)

  const fetchQuote = async (val: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/quotes?amount=${val}`)
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQuote(amount)
  }, [amount])

  return (
    <div className="rounded-xl border border-border bg-card p-5 text-card-foreground">
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Live FX Rate Discovery
          </div>
          <div className="text-base font-semibold text-foreground mt-0.5">
            USDC / EURe Market Quote vs Reference
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 text-xs">
            {[10, 50, 100].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setAmount(val)}
                className={`px-2 py-0.5 rounded font-mono text-[11px] transition-colors ${
                  amount === val
                    ? "bg-background text-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                ${val}
              </button>
            ))}
          </div>
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground">
            Dry Quotes
          </span>
          <button
            onClick={() => fetchQuote(amount)}
            disabled={loading}
            className="text-xs px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="py-4 text-xs text-destructive">
          Failed to load live quote: {error}
        </div>
      ) : !data ? (
        <div className="py-4 text-xs text-muted-foreground">
          Fetching quote from 1Click and ECB...
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                1Click Dry Quote
              </div>
              <div className="text-xl font-bold font-mono text-foreground mt-1">
                {data.quote.rate.toFixed(5)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                EURe per USDC ({data.quote.source})
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                ECB Official Reference
              </div>
              <div className="text-xl font-bold font-mono text-foreground mt-1">
                {data.reference.rate.toFixed(5)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                EUR per USD ({data.reference.source})
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Spread Deviation
              </div>
              <div
                className={`text-xl font-bold font-mono mt-1 ${
                  Math.abs(data.deviationBps) <= 50
                    ? "text-emerald-500"
                    : "text-amber-500"
                }`}
              >
                {data.deviationBps > 0 ? "+" : ""}
                {data.deviationBps} bps ({data.deviationPercent})
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {Math.abs(data.deviationBps) <= 50
                  ? "Within 50 bps budget"
                  : "Adverse spread (> 50 bps)"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/40 gap-2">
            <div>
              <span>Probe Size: </span>
              <span className="font-semibold text-foreground">${amount}.00 USDC</span>
              <span className="mx-2">|</span>
              <span>Min Feasible Chunk: </span>
              <span className="font-semibold text-foreground">
                ${data.route.recommendedMinChunkUsd}.00 USDC
              </span>
            </div>
            <div className="font-mono text-[11px]">
              Correlation ID: {data.quote.quoteId.slice(0, 16)}...
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

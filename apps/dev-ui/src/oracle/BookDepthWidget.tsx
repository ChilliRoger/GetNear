import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts'

interface BookLevel {
  size: number
  price: number
  price_impact_bps: number | null
}

interface BookResponse {
  base: string
  quote: string
  bids: BookLevel[]
  asks: BookLevel[]
}

interface ChartRow {
  price: number
  bidCumSize: number | null
  askCumSize: number | null
}

const ZOOM_LEVELS = [
  { label: '0.1%', pct: 0.001 },
  { label: '0.5%', pct: 0.005 },
  { label: '1%',   pct: 0.01 },
  { label: '5%',   pct: 0.05 },
  { label: '10%',  pct: 0.10 },
]

function buildChartData(bids: BookLevel[], asks: BookLevel[]): {
  rows: ChartRow[]
  midPrice: number | null
} {
  if (bids.length === 0 && asks.length === 0) return { rows: [], midPrice: null }

  const sortedBids = [...bids].sort((a, b) => b.price - a.price)
  const sortedAsks = [...asks].sort((a, b) => a.price - b.price)

  const bestBid = sortedBids.length > 0 ? sortedBids[0].price : null
  const bestAsk = sortedAsks.length > 0 ? sortedAsks[0].price : null
  const midPrice = bestBid != null && bestAsk != null
    ? (bestBid + bestAsk) / 2
    : bestBid ?? bestAsk ?? null

  const bidRows: ChartRow[] = []
  let cumBid = 0
  for (const b of sortedBids) {
    cumBid += b.size
    bidRows.push({ price: b.price, bidCumSize: cumBid, askCumSize: null })
  }
  bidRows.reverse()

  const askRows: ChartRow[] = []
  let cumAsk = 0
  for (const a of sortedAsks) {
    cumAsk += a.size
    askRows.push({ price: a.price, bidCumSize: null, askCumSize: cumAsk })
  }

  return { rows: [...bidRows, ...askRows], midPrice }
}

function formatPrice(v: number): string {
  if (v >= 1000) return v.toFixed(2)
  if (v >= 1) return v.toFixed(4)
  return v.toFixed(6)
}

function formatSize(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return v.toFixed(0)
}

export default function BookDepthWidget() {
  const [data, setData] = useState<BookResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoomIdx, setZoomIdx] = useState(2) // default 1%

  const fetchBook = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/oracle/depth/book?base=EURC&quote=USDC')
      if (!res.ok) {
        if (res.status === 0 || res.status >= 502) throw new Error('Oracle server offline')
        throw new Error(`${res.status} ${res.statusText}`)
      }
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
    } catch (e) {
      if (e instanceof TypeError && e.message.includes('fetch')) {
        setError('Oracle server offline')
      } else {
        setError(e instanceof Error ? e.message : 'Failed to fetch book depth')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-fetch on mount
  useEffect(() => {
    fetchBook()
  }, [fetchBook])

  const { rows, midPrice } = useMemo(() => {
    if (!data) return { rows: [], midPrice: null }
    return buildChartData(data.bids, data.asks)
  }, [data])

  const zoomPct = ZOOM_LEVELS[zoomIdx].pct
  const filteredRows = useMemo(() => {
    if (!midPrice || rows.length === 0) return rows
    const lo = midPrice * (1 - zoomPct)
    const hi = midPrice * (1 + zoomPct)
    return rows.filter((r) => r.price >= lo && r.price <= hi)
  }, [rows, midPrice, zoomPct])

  const hasChartData = rows.length > 0 && midPrice != null

  if (error && !data) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="text-xs uppercase tracking-wide text-muted mb-3 flex items-center justify-between">
          <span>Book Depth &mdash; EURC/USDC</span>
          <button
            className="text-accent text-[0.7rem] font-semibold hover:underline"
            onClick={fetchBook}
          >
            Retry
          </button>
        </div>
        <p className="text-warn text-sm">Waiting for oracle depth endpoint...</p>
        <p className="text-muted text-xs mt-1">
          Start the oracle: <code className="bg-bg px-1.5 py-0.5 rounded text-xs">cd apps/oracle && pnpm dev</code>
        </p>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="text-xs uppercase tracking-wide text-muted mb-3">Book Depth &mdash; EURC/USDC</div>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-border rounded w-1/2" />
          <div className="h-40 bg-border rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <div className="text-xs uppercase tracking-wide text-muted mb-4 flex items-center justify-between">
        <span>Book Depth &mdash; EURC/USDC</span>
        <button
          className="text-accent text-[0.7rem] font-semibold hover:underline disabled:opacity-40"
          onClick={fetchBook}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Zoom controls */}
      <div className="flex gap-1 mb-3">
        {ZOOM_LEVELS.map((z, i) => (
          <button
            key={z.label}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
              zoomIdx === i
                ? 'bg-accent border border-accent text-white'
                : 'bg-bg border border-border text-muted hover:text-text'
            } disabled:cursor-not-allowed disabled:opacity-45`}
            onClick={() => setZoomIdx(i)}
            disabled={!hasChartData}
          >
            {z.label}
          </button>
        ))}
      </div>

      {hasChartData && filteredRows.length > 0 ? (
        <div className="-mx-2">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={filteredRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} />
              <XAxis
                dataKey="price"
                type="number"
                domain={['dataMin', 'dataMax']}
                stroke="var(--color-muted)"
                fontSize={10}
                tickLine={false}
                tickFormatter={(v: number) => formatPrice(v)}
              />
              <YAxis
                stroke="var(--color-muted)"
                fontSize={10}
                tickLine={false}
                width={50}
                tickFormatter={(v: number) => formatSize(v)}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: '0.8rem',
                }}
                formatter={(value, name) => {
                  if (value == null) return [null, null]
                  const label = name === 'bidCumSize' ? 'Bid Size' : 'Ask Size'
                  return [formatSize(Number(value)), label]
                }}
                labelFormatter={(v) => `Price: ${formatPrice(Number(v))}`}
              />
              <ReferenceLine
                x={midPrice}
                stroke="var(--color-muted)"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{ value: 'Mid', position: 'top', fontSize: 10, fill: 'var(--color-muted)' }}
              />
              <Area
                type="stepAfter"
                dataKey="bidCumSize"
                stroke="var(--color-ok)"
                fill="var(--color-ok)"
                fillOpacity={0.15}
                strokeWidth={2}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Area
                type="stepAfter"
                dataKey="askCumSize"
                stroke="var(--color-danger)"
                fill="var(--color-danger)"
                fillOpacity={0.15}
                strokeWidth={2}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-bg/60 px-4 py-10 text-center text-sm text-muted">
          {hasChartData
            ? 'No levels in the current zoom window. Pick a wider zoom.'
            : 'Loading book depth data...'}
        </div>
      )}

      {midPrice && (
        <p className="text-[0.65rem] text-muted mt-2">
          Mid: {formatPrice(midPrice)} USDC/EURC
          {data && <> &middot; {data.bids.length} bids &middot; {data.asks.length} asks</>}
        </p>
      )}
    </div>
  )
}

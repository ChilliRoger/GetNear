import { useState, useEffect, useRef } from 'react'
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface PricePoint {
  timestamp: number
  chainlink: number
  fynd: number | null
  divergence_pct: number | null
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const PAIR = 'EURC/USD'
const HOURS = 24
const POLL_MS = 30_000

export default function PriceChartsWidget() {
  const [history, setHistory] = useState<PricePoint[]>([])
  const activeRef = useRef(true)

  useEffect(() => {
    activeRef.current = true

    let timeoutId: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/oracle/prices/history?pair=${encodeURIComponent(PAIR)}&hours=${HOURS}`,
        )
        if (!res.ok) return
        const data = await res.json()
        if (activeRef.current) setHistory(data.points || [])
      } catch {
        /* oracle not ready */
      } finally {
        if (activeRef.current) {
          timeoutId = setTimeout(poll, POLL_MS)
        }
      }
    }

    poll()
    return () => {
      activeRef.current = false
      clearTimeout(timeoutId)
    }
  }, [])

  if (history.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="text-xs uppercase tracking-wide text-muted mb-2">Price Charts</div>
        <p className="text-muted text-[0.8rem]">Recording price data... charts appear after first cycle.</p>
      </div>
    )
  }

  const divergenceData = history.filter((p) => p.divergence_pct != null)
  const hasDivergence = divergenceData.length > 0

  const tooltipStyle = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    fontSize: '0.75rem',
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-muted mb-3">
        {PAIR} — 24h Price History
      </div>

      <div className={`grid gap-4 ${hasDivergence ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Price history line chart */}
        <div>
          <div className="text-[0.65rem] text-muted uppercase tracking-wide mb-1.5">Price</div>
          <div className="-mx-2">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={history}>
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTime}
                  stroke="var(--color-muted)"
                  fontSize={9}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke="var(--color-muted)"
                  fontSize={9}
                  tickLine={false}
                  width={55}
                  tickFormatter={(v: number) => v.toFixed(4)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(ts) => formatDateTime(Number(ts))}
                  formatter={(value, name) =>
                    value == null
                      ? [null, null]
                      : [Number(value).toFixed(6), name === 'chainlink' ? 'Chainlink' : 'Fynd']
                  }
                />
                <Line type="monotone" dataKey="chainlink" stroke="var(--color-accent)" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="fynd" stroke="var(--color-ok)" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Divergence area chart */}
        {hasDivergence && (
          <div>
            <div className="text-[0.65rem] text-muted uppercase tracking-wide mb-1.5">Divergence</div>
            <div className="-mx-2">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={divergenceData}>
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={formatTime}
                    stroke="var(--color-muted)"
                    fontSize={9}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="var(--color-muted)"
                    fontSize={9}
                    tickLine={false}
                    width={40}
                    tickFormatter={(v: number) => `${v.toFixed(2)}%`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(ts) => formatDateTime(Number(ts))}
                    formatter={(value) =>
                      value == null
                        ? [null, null]
                        : [`${Number(value).toFixed(3)}%`, 'Divergence']
                    }
                  />
                  <ReferenceLine y={0.1} stroke="var(--color-danger)" strokeDasharray="3 3" strokeOpacity={0.6} />
                  <Area
                    type="monotone"
                    dataKey="divergence_pct"
                    stroke="var(--color-warn)"
                    fill="var(--color-warn)"
                    fillOpacity={0.15}
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[0.6rem] text-muted mt-1">Red dashed = 0.1% threshold</p>
          </div>
        )}
      </div>
    </div>
  )
}

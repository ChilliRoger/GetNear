import { useState, useEffect } from 'react'
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface PriceCurrent {
  chainlink: number
  fynd: number | null
  divergence_pct: number | null
  timestamp: number
}

interface PricePoint {
  timestamp: number
  chainlink: number
  fynd: number | null
  divergence_pct: number | null
}

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
]

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function PricesPage() {
  const [current, setCurrent] = useState<Record<string, PriceCurrent> | null>(null)
  const [history, setHistory] = useState<PricePoint[]>([])
  const [hours, setHours] = useState(24)
  const [pair, setPair] = useState('EURC/USD')
  const [error, setError] = useState<string | null>(null)

  // Fetch current prices
  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const res = await fetch('/api/oracle/prices/current')
        if (!res.ok) throw new Error('Oracle offline')
        const data = await res.json()
        if (active) {
          setCurrent(data)
          setError(null)
          // Auto-select first pair if current selection isn't in the data
          const keys = Object.keys(data)
          if (keys.length > 0) {
            setPair((prev) => keys.includes(prev) ? prev : keys[0])
          }
        }
      } catch {
        if (active) { setCurrent(null); setError('Waiting for oracle server...') }
      }
    }
    poll()
    const id = setInterval(poll, 10000)
    return () => { active = false; clearInterval(id) }
  }, [])

  // Fetch history
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await fetch(`/api/oracle/prices/history?pair=${encodeURIComponent(pair)}&hours=${hours}`)
        if (!res.ok) return
        const data = await res.json()
        if (active) setHistory(data.points || [])
      } catch { /* oracle not ready */ }
    }
    load()
    const id = setInterval(load, 30000)
    return () => { active = false; clearInterval(id) }
  }, [pair, hours])

  if (error && !current) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 mb-3">
        <div className="text-xs uppercase tracking-wide text-muted mb-3 flex items-center gap-1.5">Oracle</div>
        <p className="text-warn text-[0.9rem] mb-2">{error}</p>
        <p className="text-muted text-[0.8rem]">Start the oracle server: <code className="bg-bg px-1.5 py-0.5 rounded text-xs">cd apps/oracle && pnpm dev</code></p>
      </div>
    )
  }

  const pairs = current ? Object.keys(current) : []
  const activePair = current?.[pair]
  const formatter = hours <= 6 ? formatTime : formatDateTime

  return (
    <>
      {/* Current prices */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-3">
        <div className="text-xs uppercase tracking-wide text-muted mb-3 flex items-center gap-1.5">Current Prices</div>
        {pairs.length === 0 && <p className="text-muted text-[0.8rem]">Recording... prices will appear after first cycle.</p>}
        <div className="grid grid-cols-2 gap-2">
          {pairs.map((p) => {
            const d = current![p]
            const divColor = d.divergence_pct == null ? 'text-muted' :
              d.divergence_pct < 0.1 ? 'text-ok' :
              d.divergence_pct < 0.5 ? 'text-warn' : 'text-danger'
            return (
              <div
                key={p}
                className={`bg-bg border rounded-lg p-2.5 cursor-pointer transition-colors duration-150 ${
                  p === pair ? 'border-accent' : 'border-border hover:border-muted'
                }`}
                onClick={() => setPair(p)}
              >
                <div className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider mb-1">{p}</div>
                <div className="text-lg font-bold mb-1">{d.chainlink.toFixed(4)}</div>
                {d.fynd != null && (
                  <div className="flex justify-between text-[0.7rem]">
                    <span className="text-muted">Fynd</span>
                    <span className="text-ok font-semibold">{d.fynd.toFixed(4)}</span>
                  </div>
                )}
                {d.divergence_pct != null && (
                  <div className={`text-[0.65rem] font-semibold mt-0.5 ${divColor}`}>
                    {d.divergence_pct.toFixed(3)}% div
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Time range selector */}
      <div className="flex gap-1 mb-3">
        {TIME_RANGES.map((r) => (
          <button
            key={r.hours}
            className={`flex-1 py-1.5 rounded-md text-[0.7rem] font-semibold cursor-pointer transition-all duration-150 border ${
              hours === r.hours
                ? 'bg-accent-dim border-accent text-white'
                : 'bg-surface border-border text-muted hover:text-text'
            }`}
            onClick={() => setHours(r.hours)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Price history chart */}
      {history.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-3">
          <div className="text-xs uppercase tracking-wide text-muted mb-3 flex items-center gap-1.5">{pair} Price History</div>
          <div className="-mx-2">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history}>
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatter}
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                  width={60}
                  tickFormatter={(v: number) => v.toFixed(4)}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.8rem' }}
                  labelFormatter={(ts) => formatDateTime(Number(ts))}
                  formatter={(value, name) => value == null ? [null, null] : [Number(value).toFixed(6), name === 'chainlink' ? 'Chainlink' : 'Fynd']}
                />
                <Line type="monotone" dataKey="chainlink" stroke="var(--color-accent)" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="fynd" stroke="var(--color-ok)" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Divergence chart */}
      {history.length > 0 && activePair?.fynd != null && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-3">
          <div className="text-xs uppercase tracking-wide text-muted mb-3 flex items-center gap-1.5">Divergence ({pair})</div>
          <div className="-mx-2">
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={history.filter((p) => p.divergence_pct != null)}>
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatter}
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                />
                <YAxis
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                  width={40}
                  tickFormatter={(v: number) => `${v.toFixed(2)}%`}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.8rem' }}
                  labelFormatter={(ts) => formatDateTime(Number(ts))}
                  formatter={(value) => value == null ? [null, null] : [`${Number(value).toFixed(3)}%`, 'Divergence']}
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
          <p className="text-[0.65rem] text-muted mt-2">Red dashed line = 0.1% threshold</p>
        </div>
      )}

      {history.length === 0 && current && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-3">
          <div className="text-xs uppercase tracking-wide text-muted mb-3 flex items-center gap-1.5">History</div>
          <p className="text-muted text-[0.8rem]">No data yet for {pair}. Try a different pair or wait for recording.</p>
        </div>
      )}
    </>
  )
}

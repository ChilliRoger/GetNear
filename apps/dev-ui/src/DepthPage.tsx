import { useState, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

const TOKENS = [
  { symbol: 'USDC', label: 'USDC' },
  { symbol: 'EURC', label: 'EURC' },
  { symbol: 'WETH', label: 'WETH' },
  { symbol: 'DAI', label: 'DAI' },
  { symbol: 'cbBTC', label: 'cbBTC' },
]

interface DepthPoint {
  sell_amount: number
  buy_amount: number
  effective_price: number
  price_impact_bps: number | null
  gas_estimate: number
}

export default function DepthPage() {
  const [sellToken, setSellToken] = useState('USDC')
  const [buyToken, setBuyToken] = useState('EURC')
  const [points, setPoints] = useState<DepthPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDepth = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPoints([])
    try {
      const res = await fetch(`/api/oracle/depth?sell_token=${sellToken}&buy_token=${buyToken}`)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPoints(data.points || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch depth')
    } finally {
      setLoading(false)
    }
  }, [sellToken, buyToken])

  const availableBuy = TOKENS.filter((t) => t.symbol !== sellToken)
  const baselinePrice = points.length > 0 ? points[0].effective_price : null

  return (
    <>
      <div className="bg-surface border border-border rounded-xl p-4 mb-3">
        <div className="text-xs uppercase tracking-wide text-muted mb-3 flex items-center gap-1.5">Liquidity Depth</div>

        <div className="mb-2">
          <label className="block text-[0.7rem] uppercase tracking-wide text-muted mb-1">Sell Token</label>
          <select
            className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-text text-sm font-semibold cursor-pointer outline-none transition-colors focus:border-accent"
            value={sellToken}
            onChange={(e) => {
              setSellToken(e.target.value)
              if (e.target.value === buyToken) {
                const alt = TOKENS.find((t) => t.symbol !== e.target.value)
                if (alt) setBuyToken(alt.symbol)
              }
            }}
          >
            {TOKENS.map((t) => (
              <option key={t.symbol} value={t.symbol}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="mb-2">
          <label className="block text-[0.7rem] uppercase tracking-wide text-muted mb-1">Buy Token</label>
          <select
            className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-text text-sm font-semibold cursor-pointer outline-none transition-colors focus:border-accent"
            value={buyToken}
            onChange={(e) => setBuyToken(e.target.value)}
          >
            {availableBuy.map((t) => (
              <option key={t.symbol} value={t.symbol}>{t.label}</option>
            ))}
          </select>
        </div>

        <button
          className="w-full mt-3 py-3 bg-accent text-white rounded-xl font-semibold hover:bg-accent-dim disabled:opacity-40 disabled:cursor-not-allowed border-none text-[0.95rem] cursor-pointer transition-colors"
          onClick={fetchDepth}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Fetch Depth'}
        </button>
      </div>

      {error && (
        <div className="bg-surface border border-danger rounded-xl p-4 mb-3">
          <div className="text-xs uppercase tracking-wide text-muted mb-3 flex items-center gap-1.5">Error</div>
          <p className="text-danger text-[0.85rem] break-words">{error}</p>
        </div>
      )}

      {/* Depth chart */}
      {points.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-3">
          <div className="text-xs uppercase tracking-wide text-muted mb-3 flex items-center gap-1.5">Price vs Size ({sellToken} → {buyToken})</div>
          <div className="-mx-2">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={points}>
                <XAxis
                  dataKey="sell_amount"
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v: number) => v >= 1000000 ? `${v / 1000000}M` : v >= 1000 ? `${v / 1000}K` : String(v)}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke="var(--color-muted)"
                  fontSize={10}
                  tickLine={false}
                  width={70}
                  tickFormatter={(v: number) => v.toFixed(4)}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.8rem' }}
                  formatter={(value, name) => {
                    if (name === 'effective_price') return [Number(value).toFixed(6), 'Eff. Price']
                    return [String(value), String(name)]
                  }}
                  labelFormatter={(v) => `${Number(v).toLocaleString()} ${sellToken}`}
                />
                <Area
                  type="monotone"
                  dataKey="effective_price"
                  stroke="var(--color-accent)"
                  fill="var(--color-accent)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {baselinePrice && (
            <p className="text-[0.65rem] text-muted mt-2">
              Baseline: {baselinePrice.toFixed(6)} {buyToken}/{sellToken} at {points[0].sell_amount.toLocaleString()} {sellToken}
            </p>
          )}
        </div>
      )}

      {/* Data table */}
      {points.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-3">
          <div className="text-xs uppercase tracking-wide text-muted mb-3 flex items-center gap-1.5">Depth Data</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Sell</th>
                  <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Buy</th>
                  <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Price</th>
                  <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Impact</th>
                  <th className="text-left text-muted text-[0.65rem] uppercase tracking-wide px-2 py-1.5 border-b border-border">Gas</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p, i) => {
                  const impactBps = p.price_impact_bps ?? 0
                  const impactColor = impactBps < 50 ? 'text-ok' : impactBps < 200 ? 'text-warn' : 'text-danger'
                  const slippage = baselinePrice
                    ? ((baselinePrice - p.effective_price) / baselinePrice * 100)
                    : 0
                  return (
                    <tr key={i}>
                      <td className="px-2 py-2 border-b border-border tabular-nums">{p.sell_amount.toLocaleString()}</td>
                      <td className="px-2 py-2 border-b border-border tabular-nums">{p.buy_amount.toLocaleString()}</td>
                      <td className="px-2 py-2 border-b border-border tabular-nums">{p.effective_price.toFixed(4)}</td>
                      <td className={`px-2 py-2 border-b border-border tabular-nums ${impactColor}`}>
                        {impactBps != null ? `${(impactBps / 100).toFixed(2)}%` : '—'}
                        {slippage > 0.01 && <span className="text-[0.65rem] text-muted"> ({slippage.toFixed(2)}% slip)</span>}
                      </td>
                      <td className="px-2 py-2 border-b border-border tabular-nums">{p.gas_estimate.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

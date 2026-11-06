import { useState, useEffect, useCallback } from 'react'
import PricesPage from './PricesPage'
import DepthPage from './DepthPage'
import BookDepthPage from './BookDepthPage'
import OraclePage from './oracle/OraclePage'
import { MeridianLogo } from './MeridianLogo'

type Tab = 'quote' | 'prices' | 'depth' | 'book' | 'oracle' | 'logo'

// --- Base chain tokens ---
const BASE_TOKENS = [
  { symbol: 'WETH',  address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  { symbol: 'USDC',  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  { symbol: 'DAI',   address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
  { symbol: 'cbBTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8 },
  { symbol: 'EURC',  address: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', decimals: 6 },
] as const

type TokenAddress = (typeof BASE_TOKENS)[number]['address']
type Token = (typeof BASE_TOKENS)[number]

// --- API helpers ---
async function fyndGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api/fynd${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function fyndPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/fynd${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || err.message || res.statusText)
  }
  return res.json()
}

// --- Types ---
interface HealthStatus {
  healthy: boolean
  last_update_ms: number
  num_solver_pools: number
  derived_data_ready?: boolean
}

interface SwapStep {
  component_id: string
  protocol: string
  token_in: string
  token_out: string
  amount_in: string
  amount_out: string
  split: number
}

interface OrderQuote {
  order_id: string
  status: string
  amount_in: string
  amount_out: string
  gas_estimate: string
  price_impact_bps?: number
  block?: { number: number; timestamp: number }
  route?: { swaps: SwapStep[] }
}

interface QuoteResponse {
  orders: OrderQuote[]
  total_gas_estimate: string
  solve_time_ms: number
}

// --- Helpers ---
function toAtomic(human: string, decimals: number): string {
  const parts = human.split('.')
  const whole = parts[0] || '0'
  const frac = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals)
  return BigInt(whole + frac).toString()
}

function fromAtomic(atomic: string, decimals: number): string {
  const s = atomic.padStart(decimals + 1, '0')
  const whole = s.slice(0, s.length - decimals)
  const frac = s.slice(s.length - decimals)
  const trimmed = frac.replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : whole
}

function truncAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function tokenByAddr(addr: string): Token | undefined {
  return BASE_TOKENS.find((t) => t.address.toLowerCase() === addr.toLowerCase())
}

// --- Components ---
function HealthIndicator({ health }: { health: HealthStatus | null }) {
  if (!health) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted">
        <span className="size-2 shrink-0 rounded-full bg-muted" />
        <span className="font-medium">connecting</span>
      </div>
    )
  }
  const ready = health.healthy && health.derived_data_ready !== false
  const syncing = health.healthy && health.derived_data_ready === false
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted">
      <span className={`size-2 shrink-0 rounded-full ${ready ? 'bg-ok' : syncing ? 'bg-warn' : 'bg-danger'}`} />
      <span className="font-medium">
        {ready ? 'live' : syncing ? 'syncing' : 'unhealthy'}
      </span>
      {health.num_solver_pools > 0 && (
        <span className="text-xs opacity-60">{health.num_solver_pools} solver{health.num_solver_pools !== 1 ? 's' : ''}</span>
      )}
    </div>
  )
}

function QuoteResult({ quote, tokenOut }: { quote: QuoteResponse; tokenOut: Token }) {
  const order = quote.orders[0]
  if (!order) return null

  const isSuccess = order.status === 'success'
  const impactBps = order.price_impact_bps ?? 0
  const impactColor = impactBps < 50 ? 'text-ok' : impactBps < 200 ? 'text-warn' : 'text-danger'

  return (
    <div className="bg-surface border border-accent rounded-xl p-4 mb-3">
      <div className="text-xs uppercase tracking-wide text-muted mb-3">
        <span className={`inline-block text-[0.65rem] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${isSuccess ? 'bg-ok/15 text-ok' : 'bg-danger/15 text-danger'}`}>
          {order.status}
        </span>
      </div>

      {isSuccess && (
        <>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-2xl font-bold">{fromAtomic(order.amount_out, tokenOut.decimals)}</span>
            <span className="text-sm font-semibold text-muted">{tokenOut.symbol}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[0.65rem] uppercase tracking-wide text-muted">Gas estimate</span>
              <span className="text-sm font-semibold">{Number(order.gas_estimate).toLocaleString()}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[0.65rem] uppercase tracking-wide text-muted">Price impact</span>
              <span className={`text-sm font-semibold ${impactColor}`}>{(impactBps / 100).toFixed(2)}%</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[0.65rem] uppercase tracking-wide text-muted">Solve time</span>
              <span className="text-sm font-semibold">{quote.solve_time_ms}ms</span>
            </div>
            {order.block && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[0.65rem] uppercase tracking-wide text-muted">Block</span>
                <span className="text-sm font-semibold">#{order.block.number}</span>
              </div>
            )}
          </div>

          {order.route && order.route.swaps.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="text-[0.7rem] uppercase tracking-wide text-muted mb-2">
                Route ({order.route.swaps.length} hop{order.route.swaps.length !== 1 ? 's' : ''})
              </div>
              {order.route.swaps.map((swap, i) => {
                const tIn = tokenByAddr(swap.token_in)
                const tOut = tokenByAddr(swap.token_out)
                return (
                  <div className={`flex items-center gap-2 py-1.5 text-sm ${i > 0 ? 'border-t border-border' : ''}`} key={i}>
                    <span className="text-xs font-semibold text-accent min-w-20">{swap.protocol}</span>
                    <span className="flex-1 text-text">
                      {tIn?.symbol || truncAddr(swap.token_in)} → {tOut?.symbol || truncAddr(swap.token_out)}
                    </span>
                    {swap.split < 1 && (
                      <span className="text-xs text-muted">{(swap.split * 100).toFixed(0)}%</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function App() {
  const [tab, setTab] = useState<Tab>('oracle')
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [tokenIn, setTokenIn] = useState<TokenAddress>(BASE_TOKENS[1].address) // USDC
  const [tokenOut, setTokenOut] = useState<TokenAddress>(BASE_TOKENS[4].address) // EURC
  const [amount, setAmount] = useState('100')
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Poll health
  useEffect(() => {
    let active = true
    const poll = () => {
      fyndGet<HealthStatus>('/v1/health')
        .then((h) => active && setHealth(h))
        .catch(() => active && setHealth(null))
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => { active = false; clearInterval(id) }
  }, [])

  const selectedIn = BASE_TOKENS.find((t) => t.address === tokenIn)!
  const selectedOut = BASE_TOKENS.find((t) => t.address === tokenOut)!
  const availableOut = BASE_TOKENS.filter((t) => t.address !== tokenIn)

  const handleSwap = useCallback(() => {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
  }, [tokenIn, tokenOut])

  const handleQuote = useCallback(async () => {
    setLoading(true)
    setError(null)
    setQuote(null)
    try {
      const atomic = toAtomic(amount, selectedIn.decimals)
      const result = await fyndPost<QuoteResponse>('/v1/quote', {
        orders: [{
          token_in: tokenIn,
          token_out: tokenOut,
          amount: atomic,
          side: 'sell',
          sender: '0x0000000000000000000000000000000000000001',
        }],
        options: {
          timeout_ms: 5000,
          min_responses: 1,
        },
      })
      setQuote(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quote failed')
    } finally {
      setLoading(false)
    }
  }, [amount, tokenIn, tokenOut, selectedIn.decimals])

  return (
    <div className={`mx-auto px-4 min-h-dvh flex flex-col ${tab === 'oracle' ? 'max-w-5xl' : 'max-w-[480px]'}`}>
      <header className="flex items-center justify-between py-3 border-b border-border mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <MeridianLogo size={32} cropped color="#4a9eff" />
          <span className="text-[#4a9eff]">MFX</span> Dev
        </h1>
        <HealthIndicator health={health} />
      </header>

      <div className="flex gap-1 mb-4 overflow-x-auto">
        {(['quote', 'prices', 'depth', 'book', 'oracle', 'logo'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
              tab === t
                ? 'bg-accent border border-accent text-white'
                : 'bg-surface border border-border text-muted hover:text-text'
            }`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'quote' && (
        <>
          <div className="bg-surface border border-border rounded-xl p-4 mb-3">
            <div className="text-xs uppercase tracking-wide text-muted mb-3">Quote</div>

            <div className="mb-2">
              <label className="block text-[0.7rem] uppercase tracking-wide text-muted mb-1">Sell</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-bg border border-border rounded-lg px-3 py-2.5 text-text text-lg font-semibold outline-none focus:border-accent transition-colors"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.0"
                />
                <select
                  className="w-[100px] bg-bg border border-border rounded-lg px-2 py-2.5 text-text text-sm font-semibold outline-none focus:border-accent cursor-pointer transition-colors"
                  value={tokenIn}
                  onChange={(e) => {
                    const addr = e.target.value as TokenAddress
                    setTokenIn(addr)
                    if (addr === tokenOut) {
                      const alt = BASE_TOKENS.find((t) => t.address !== addr)
                      if (alt) setTokenOut(alt.address)
                    }
                  }}
                >
                  {BASE_TOKENS.map((t) => (
                    <option key={t.address} value={t.address}>{t.symbol}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              className="block mx-auto my-1 px-3 py-1 bg-transparent border border-border rounded-lg text-muted text-base cursor-pointer hover:text-accent hover:border-accent transition-colors"
              onClick={handleSwap}
              type="button"
              aria-label="Swap tokens"
            >
              ↕
            </button>

            <div className="mb-2">
              <label className="block text-[0.7rem] uppercase tracking-wide text-muted mb-1">Buy</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-bg border border-border rounded-lg px-3 py-2.5 text-text text-lg font-semibold opacity-70">
                  {quote?.orders[0]?.status === 'success'
                    ? fromAtomic(quote.orders[0].amount_out, selectedOut.decimals)
                    : '—'}
                </div>
                <select
                  className="w-[100px] bg-bg border border-border rounded-lg px-2 py-2.5 text-text text-sm font-semibold outline-none focus:border-accent cursor-pointer transition-colors"
                  value={tokenOut}
                  onChange={(e) => setTokenOut(e.target.value as TokenAddress)}
                >
                  {availableOut.map((t) => (
                    <option key={t.address} value={t.address}>{t.symbol}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              className="w-full mt-3 py-3 bg-accent text-white rounded-xl text-[0.95rem] font-semibold cursor-pointer hover:bg-accent-dim disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              onClick={handleQuote}
              disabled={loading || !amount || !health?.healthy}
            >
              {loading ? 'Quoting...' : 'Get Quote'}
            </button>
          </div>

          {error && (
            <div className="bg-surface border border-danger rounded-xl p-4 mb-3">
              <div className="text-xs uppercase tracking-wide text-muted mb-3">Error</div>
              <p className="text-sm text-danger break-words">{error}</p>
            </div>
          )}

          {quote && <QuoteResult quote={quote} tokenOut={selectedOut} />}
        </>
      )}

      {tab === 'prices' && <PricesPage />}
      {tab === 'depth' && <DepthPage />}
      {tab === 'book' && <BookDepthPage />}
      {tab === 'oracle' && <OraclePage />}

      {tab === 'logo' && (
        <div className="flex flex-col gap-6">
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-muted mb-3">Full (default 320px)</div>
            <div className="flex justify-center">
              <MeridianLogo />
            </div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-muted mb-3">Large Text (40px — landing nav)</div>
            <div className="flex items-center gap-3 bg-[#0d1116] rounded-lg p-3">
              <MeridianLogo size={40} largeText />
              <span className="text-sm font-semibold">Meridian <span className="text-[#00d4aa]/60 text-[10px] uppercase tracking-[0.2em]">FX</span></span>
            </div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-muted mb-3">Cropped (36px — app header)</div>
            <div className="flex items-center gap-2.5 bg-[#0d1116] rounded-lg p-3">
              <MeridianLogo size={36} cropped />
              <div>
                <div className="text-base font-semibold tracking-tight">Meridian FX</div>
                <div className="text-[10px] uppercase tracking-widest text-muted">AI Treasury Agent</div>
              </div>
            </div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-muted mb-3">Cropped sizes: 24 / 36 / 48 / 64</div>
            <div className="flex items-center gap-4 bg-[#0d1116] rounded-lg p-4">
              <MeridianLogo size={24} cropped />
              <MeridianLogo size={36} cropped />
              <MeridianLogo size={48} cropped />
              <MeridianLogo size={64} cropped />
            </div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-muted mb-3">With Background (app icon)</div>
            <div className="flex justify-center">
              <MeridianLogo size={160} withBackground />
            </div>
          </div>
        </div>
      )}

      <div className="mt-auto pt-4 pb-2 text-center text-[0.7rem] text-muted tracking-wide">
        Base · Fynd DEX Aggregator · ETHGlobal Cannes 2026 Hackathon
      </div>
    </div>
  )
}

export default App

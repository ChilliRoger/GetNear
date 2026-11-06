import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  TimingStrategy,
  PriceComparison,
  TradeOrder,
  CRERun,
  DemoStatus,
  StrategyDecision,
} from './types'

// The Vite proxy rewrites /api/oracle → http://localhost:38174 stripping the
// prefix, so a call to oracleGet('/api/strategy/next') produces the fetch URL
// /api/oracle/api/strategy/next which the proxy rewrites to /api/strategy/next
// — matching the Oracle server's actual route. The double /api/ is intentional.
const ORACLE = '/api/oracle'

async function oracleGet<T>(path: string): Promise<T> {
  const res = await fetch(`${ORACLE}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

async function oraclePost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${ORACLE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string; message?: string }
    throw new Error(err.error || err.message || res.statusText)
  }
  return res.json() as Promise<T>
}

/** setTimeout-based polling: schedules the next poll only after the current
 *  fetch completes, preventing request pile-up when responses are slow. */
function usePoll<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  deps: unknown[] = [],
): { data: T | null; error: string | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const activeRef = useRef(true)

  useEffect(() => {
    activeRef.current = true
    setLoading(true)

    let timeoutId: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const result = await fetcher()
        if (activeRef.current) {
          setData(result)
          setError(null)
        }
      } catch (e) {
        if (activeRef.current) {
          setError(e instanceof Error ? e.message : 'Fetch failed')
        }
      } finally {
        if (activeRef.current) setLoading(false)
        if (activeRef.current) {
          timeoutId = setTimeout(poll, intervalMs)
        }
      }
    }

    poll()
    return () => {
      activeRef.current = false
      clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps])

  return { data, error, loading }
}

/** Raw shape returned by GET /api/prices/comparison (flat object, not array). */
interface RawPriceComparison {
  chainlink: { price: number; updatedAt: number }
  fynd: { price: number; updatedAt: number }
  uniswap: { price: number; updatedAt: number }
  divergenceBps: number
  avg24h: number
  currentVsAvgPct: number
}

/** Transform the flat server response into the PriceComparison[] the UI expects. */
function transformPrices(raw: RawPriceComparison): PriceComparison[] {
  const sources = (
    ['chainlink', 'fynd', 'uniswap'] as const
  )
    .filter((k) => raw[k] && raw[k].price > 0)
    .map((k) => ({
      source: k.charAt(0).toUpperCase() + k.slice(1),
      price: raw[k].price,
      timestamp: raw[k].updatedAt,
    }))

  const prices = sources.map((s) => s.price)
  const currentAvg =
    prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0

  return [
    {
      pair: 'EURC/USD',
      sources,
      divergence_bps: raw.divergenceBps,
      average_24h: raw.avg24h || null,
      current_avg: currentAvg,
    },
  ]
}

/** Raw shape returned by GET /api/trades (DB row, not the UI's TradeOrder). */
interface RawTradeOrder {
  id: string
  from_token: string
  to_token: string
  input_amount: string
  filled_amount: string
  output_received?: string
  deadline: number
  status: string
  created_at: number
  updated_at?: number
  timing_score?: number | null
  strategy_reason?: string | null
  mode?: string
  desired_output?: string | null
}

/** Raw shape returned by GET /api/cre/runs (DB row uses started_at, not timestamp). */
interface RawCRERun {
  id: number
  started_at: number
  action: string
  order_id: string
  chunk_amount: string | null
  result: string
  tx_hash: string | null
  error?: string | null
  duration_ms: number
}

/** Map a raw DB CRE run into the shape CRERunHistory expects. */
function transformCRERun(raw: RawCRERun): CRERun {
  return {
    id: String(raw.id),
    timestamp: raw.started_at,
    action: raw.action,
    order_id: raw.order_id,
    chunk_amount: raw.chunk_amount != null ? Number(raw.chunk_amount) : 0,
    result: raw.result,
    tx_hash: raw.tx_hash,
    duration_ms: raw.duration_ms,
  }
}

/** Map a raw DB trade into the shape TradeOrdersTable expects. */
function transformTrade(raw: RawTradeOrder): TradeOrder {
  const inputAmt = Number(raw.input_amount) / 1e6
  const filledAmt = Number(raw.filled_amount || '0') / 1e6
  const filledPct = inputAmt > 0 ? (filledAmt / inputAmt) * 100 : 0

  // Infer direction from token pair: selling stablecoin → BUY foreign, buying stablecoin → SELL
  const direction: 'BUY' | 'SELL' =
    raw.from_token === 'USDC' || raw.from_token === '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
      ? 'BUY'
      : 'SELL'

  return {
    id: raw.id,
    direction,
    amount: inputAmt,
    filled_pct: filledPct,
    status: raw.status as TradeOrder['status'],
    deadline: raw.deadline,
    token_in: raw.from_token,
    token_out: raw.to_token,
    created_at: raw.created_at,
    mode: raw.mode as TradeOrder['mode'],
    desired_output: raw.desired_output ?? null,
    input_amount: raw.input_amount,
    filled_amount: raw.filled_amount || '0',
    from_token: raw.from_token,
    to_token: raw.to_token,
  }
}

export function useOracleData() {
  const strategy = usePoll<TimingStrategy>(
    () => oracleGet('/api/strategy/next'),
    5_000,
  )

  const prices = usePoll<PriceComparison[]>(
    () => oracleGet<RawPriceComparison>('/api/prices/comparison').then(transformPrices),
    10_000,
  )

  const trades = usePoll<TradeOrder[]>(
    () => oracleGet<RawTradeOrder[]>('/api/trades').then((rows) => rows.map(transformTrade)),
    5_000,
  )

  const creRuns = usePoll<CRERun[]>(
    () => oracleGet<RawCRERun[]>('/api/cre/runs').then((rows) => rows.map(transformCRERun)),
    10_000,
  )

  const decisions = usePoll<StrategyDecision[]>(
    () => oracleGet('/api/strategy/decisions?limit=100'),
    5_000,
  )

  const demoStatus = usePoll<DemoStatus>(
    () => oracleGet('/api/demo/status'),
    2_000,
  )

  const toggleSpeed = useCallback(async () => {
    await oraclePost('/api/demo/speed')
  }, [])

  const seedDemo = useCallback(async () => {
    await oraclePost('/api/demo/seed')
  }, [])

  return {
    strategy,
    prices,
    trades,
    creRuns,
    decisions,
    demoStatus,
    toggleSpeed,
    seedDemo,
  }
}

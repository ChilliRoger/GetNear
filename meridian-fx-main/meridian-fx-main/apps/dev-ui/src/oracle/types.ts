// Oracle API response types (snake_case from server)

export interface TimingBreakdownComponent {
  name: string
  raw_score: number
  weight: number
  weighted_score: number
}

export interface TimingStrategy {
  score: number
  action: 'SWAP' | 'WAIT'
  reason: string
  breakdown?: TimingBreakdownComponent[]
}

export interface PriceSourceEntry {
  source: string
  price: number
  timestamp: number
}

export interface PriceComparison {
  pair: string
  sources: PriceSourceEntry[]
  divergence_bps: number
  average_24h: number | null
  current_avg: number
}

export interface TradeOrder {
  id: string
  direction: 'BUY' | 'SELL'
  amount: number
  filled_pct: number
  status: 'PENDING' | 'APPROVED' | 'FILLING' | 'COMPLETE' | 'CANCELLED'
  deadline: number // unix timestamp
  token_in?: string
  token_out?: string
  created_at?: number
  mode?: 'INPUT' | 'OUTPUT'
  desired_output?: string | null
  // Raw fields from oracle API (used for adaptive TWAP display)
  input_amount?: string
  filled_amount?: string
  from_token?: string
  to_token?: string
}

export interface CRERun {
  id: string
  timestamp: number
  action: string
  order_id: string
  chunk_amount: number
  result: string
  tx_hash: string | null
  duration_ms: number
}

export interface DemoStatus {
  speed: number
  sleep: number
  lastTickAt: number
  nextTickAt: number
  serverTime: number
}

export interface StrategyConfig {
  weightPrice: number
  weightDivergence: number
  weightUrgency: number
  swapThreshold: number
  aggressiveThreshold: number
  urgencyOverride: number
  autoExecute: boolean
}

/** Raw shape returned by GET /api/prices/comparison */
export interface PriceComparisonRaw {
  chainlink: { price: number; updatedAt: number }
  fynd: { price: number; updatedAt: number }
  uniswap: { price: number; updatedAt: number }
  divergenceBps: number
  avg24h: number
  currentVsAvgPct: number
}

export interface StrategyDecision {
  id: number
  timestamp: number
  order_id: string | null
  score: number
  action: 'SWAP' | 'WAIT'
  reason: string
  price_score: number | null
  divergence_score: number | null
  urgency_score: number | null
  chunk_amount: string | null
  chunk_multiplier: number | null
  min_output: string | null
}

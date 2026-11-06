export const OPERATIONAL_MODE = 'hackathon_demo' as const

export type TradeStatus = 'PENDING' | 'APPROVED' | 'EXECUTED' | 'REJECTED'

export interface QuoteSnapshot {
  quoteId: string
  fromToken: 'USDC' | 'EURC'
  toToken: 'USDC' | 'EURC'
  fromAmount: string          // BigNumber string (6 decimals)
  toAmount: string            // BigNumber string (6 decimals)
  exchangeRateX18: string     // Rate as 18-decimal string
  executionChain: number      // Base mainnet: 8453
  quoteMetadataJson: string   // Raw JSON from Uniswap API
  quotedAt: number            // Unix timestamp
  expiresAt: number           // Quote validity window
}

export interface TradeDecision {
  action: 'EXECUTE' | 'QUEUE_APPROVAL' | 'WAIT'
  reason: string
  quote: QuoteSnapshot | null
  requiresApproval: boolean
  policySnapshot: {
    threshold: string         // BigNumber string (6 decimals)
    targetRateMinX18: string  // 18-decimal string
    targetRateMaxX18: string  // 18-decimal string
  }
}

export interface PendingTrade {
  tradeId: string
  quote: QuoteSnapshot
  createdAt: number
  expiresAt: number
  status: TradeStatus
  approverAddress?: string
  approvedAt?: number
}

export interface ExecutionReceipt {
  tradeId: string
  executionType: 'AUTO' | 'APPROVED'
  fromToken: string
  toToken: string
  fromAmount: string
  toAmount: string
  executionRateX18: string    // 18-decimal string
  txHashBase: string          // Swap tx on Base
  txHashArc: string           // Audit tx on Arc
  executedAt: number
  savingsVsBankBps: number    // Savings in basis points
}

export interface ExecutionContext {
  baseUsdcBalance: string
  baseEurcBalance: string
  arcPolicyVersion: number
  quoteFreshUntil: number
}

// ── Phase 2: Trade Orders ────────────────────────────────────────────

export type TradeOrderStatus = 'PENDING' | 'PENDING_APPROVAL' | 'APPROVED' | 'FILLING' | 'COMPLETE' | 'CANCELLED'

export interface TradeOrder {
  id: string
  fromToken: 'USDC' | 'EURC'
  toToken: 'USDC' | 'EURC'
  inputAmount: string          // Raw 6-decimal string
  filledAmount: string         // Raw 6-decimal string
  outputReceived: string       // Raw 6-decimal string
  deadline: number             // Unix timestamp
  status: TradeOrderStatus
  mode: 'INPUT' | 'OUTPUT'     // defaults to 'INPUT'
  desiredOutput: string | null  // only set when mode='OUTPUT'
  createdAt: number
  updatedAt: number
}

export interface StrategyResponse {
  action: 'SWAP' | 'WAIT' | 'COMPLETE_OUTPUT'
  orderId?: string
  chunkAmount?: string         // Raw 6-decimal string
  minOutput?: string           // Raw 6-decimal string
  score?: number               // 0-100
  reason: string
  excessInput?: string         // amount to return to treasury (output mode)
}

export interface PriceComparison {
  chainlink: { price: number; updatedAt: number }
  fynd: { price: number; updatedAt: number }
  uniswap: { price: number; updatedAt: number }
  divergenceBps: number
  avg24h: number
  currentVsAvgPct: number
}

export interface CRERun {
  id: number
  startedAt: number
  action: string
  orderId?: string
  chunkAmount?: string
  result: string
  txHash?: string
  error?: string
  durationMs: number
}

export interface DemoSpeed {
  speed: 1 | 10
  sleep: number
}

// ── Phase 1: Approval ────────────────────────────────────────────────

export interface ApprovalSession {
  tradeId: string
  nonce: string
  walletAddress: string
  walletAuthSignature: string
  worldIdProof: string[]
  worldIdNullifier: string
  timestamp: number
}

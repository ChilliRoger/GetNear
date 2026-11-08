/**
 * GetNear Domain Types (P3)
 *
 * Core data structures for the NEAR-based FX treasury agent.
 * All amounts are u128-compatible strings (atomic units, 6 decimals for stablecoins).
 * All timestamps are Unix milliseconds (JS) or nanoseconds (NEAR contract).
 */

// ── Order ────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'Pending'      // above auto-cap, waiting for DAO approval
  | 'Active'       // ready for agent to fill
  | 'Completed'    // fully executed
  | 'Expired'      // deadline passed before completion
  | 'Cancelled'    // cancelled by requester or owner

export interface Order {
  /** Unique order ID (from contract, monotonically increasing) */
  id: string
  /** NEAR account ID of the requester */
  requester: string
  /** Human-readable pair label, e.g. "USDC/EURC" */
  pairLabel: string
  /** Total input amount (atomic units, 6 decimals) */
  totalIn: string
  /** Amount already executed (atomic units, 6 decimals) */
  executedIn: string
  /** Max amount per chunk (atomic units, 6 decimals) */
  maxChunk: string
  /** Order deadline (nanoseconds, NEAR block timestamp format) */
  deadlineNs: string
  /** Max allowed deviation from reference rate (basis points) */
  maxDeviationBps: number
  /** Current order state */
  status: OrderStatus
  /** Timestamp of last chunk execution (ns), 0 if none */
  lastChunkNs: string
  /** Number of chunks executed */
  chunksCount: number
}

// ── Chunk ────────────────────────────────────────────────────────────

export interface Chunk {
  /** Order this chunk belongs to */
  orderId: string
  /** Chunk sequence number */
  chunkIndex: number
  /** Amount converted in this chunk (atomic units) */
  amountIn: string
  /** Simulated output amount (atomic units) */
  simulatedOut: string
  /** Short hash identifying the quote used */
  quoteRef: string
  /** Deviation from reference rate at execution time (bps) */
  deviationBps: number
  /** NEAR testnet transaction hash */
  txHash: string
  /** Whether this fill is simulated (always true in this prototype) */
  isSimulated: true
  /** Execution timestamp (Unix ms) */
  executedAt: number
}

// ── Decision ─────────────────────────────────────────────────────────

export type DecisionAction = 'WAIT' | 'EXECUTE'

export interface ScoreBreakdown {
  /** Price vs 24h rolling average score (0–100) */
  priceScore: number
  /** Source divergence score: quote vs reference (0–100) */
  divergenceScore: number
  /** Urgency score based on time remaining vs deadline (0–100) */
  urgencyScore: number
  /** Weights applied to each component */
  weights: { price: number; divergence: number; urgency: number }
  /** Composite timing score (0–100) */
  total: number
}

export interface Decision {
  /** Associated order ID */
  orderId: string
  /** WAIT or EXECUTE */
  action: DecisionAction
  /** Human-readable reason for the decision */
  reason: string
  /** Full score breakdown for transparency */
  scoreBreakdown: ScoreBreakdown
  /** Chunk size proposed if action=EXECUTE (atomic units) */
  chunkSize: string | null
  /** Quote snapshot used to compute this decision */
  quoteSnapshot: QuoteSnapshot | null
  /** Deviation from reference rate (bps) */
  deviationBps: number | null
  /** Decision timestamp (Unix ms) */
  decidedAt: number
}

// ── QuoteSnapshot ────────────────────────────────────────────────────

export interface QuoteSnapshot {
  /** Unique quote identifier from the quote provider */
  quoteId: string
  /** Input token symbol or asset ID */
  fromToken: string
  /** Output token symbol or asset ID */
  toToken: string
  /** Input amount (atomic units) */
  amountIn: string
  /** Quoted output amount (atomic units) */
  amountOut: string
  /** Effective rate (amountOut / amountIn, human units) */
  rate: number
  /** Data source label (e.g. "1Click dry-quote" or "MOCK") */
  source: string
  /** Timestamp when the quote was fetched (Unix ms) */
  quotedAt: number
  /** Quote validity expiry (Unix ms) */
  expiresAt: number
  /** Decimals of the input token (e.g. 6 for USDC) */
  decimalsIn?: number
  /** Decimals of the output token (e.g. 18 for EURe) */
  decimalsOut?: number
  /** Estimated USD value of the input amount if returned by provider */
  amountInUsd?: string
  /** Estimated USD value of the output amount if returned by provider */
  amountOutUsd?: string
  /** Minimum output amount considering slippage tolerance (atomic units) */
  minAmountOut?: string
  /** Estimated execution time in seconds */
  timeEstimate?: number
  /** Correlation or request identifier from the quote provider */
  requestId?: string
  /** Cryptographic quote signature from the quote provider */
  signature?: string
}

// ── Fill ─────────────────────────────────────────────────────────────

/**
 * A Fill always has isSimulated = true for this prototype.
 * NEAR Intents has no testnet; all settlement is accounting-only.
 */
export interface Fill {
  /** Order this fill belongs to */
  orderId: string
  /** Chunk details */
  chunk: Chunk
  /** Quote used to compute the simulated output */
  quote: QuoteSnapshot
  /** NEAR testnet explorer link */
  explorerUrl: string
  /** Explicit simulated flag — must always be true */
  isSimulated: true
}

// ── ProposalRef ──────────────────────────────────────────────────────

export interface ProposalRef {
  /** Sputnik DAO proposal ID */
  proposalId: number
  /** DAO account ID on testnet */
  daoAccountId: string
  /** Associated order ID */
  orderId: string
  /** Current vote counts */
  votesFor: number
  votesAgainst: number
  /** Number of votes required for passage */
  requiredVotes: number
  /** Proposal status from the DAO */
  status: 'InProgress' | 'Approved' | 'Rejected' | 'Expired'
  /** Explorer link for the proposal submission tx */
  explorerUrl: string
}


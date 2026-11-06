/**
 * Timing Score Calculator for Meridian FX Oracle
 *
 * Computes a 0-100 score indicating how favorable the current moment is
 * for executing a swap chunk.  Three weighted factors:
 *
 *   1. Price vs 24h average  (40%)  — is the rate favorable right now?
 *   2. Source divergence      (20%)  — do Chainlink / Fynd / Uniswap agree?
 *   3. Urgency               (40%)  — deadline approaching + unfilled amount
 *
 * Decision thresholds:
 *   score > 85  → SWAP aggressively (2x chunk)
 *   score > 70  → SWAP normal chunk
 *   score < 70  → WAIT  (unless urgency alone > 80, then force swap)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PriceSnapshot {
  /** Latest Chainlink EURC/USD price (e.g. 0.87) */
  chainlinkPrice: number | null
  /** Latest Fynd DEX implied EURC/USD price */
  fyndPrice: number | null
  /** Latest Uniswap implied EURC/USD price */
  uniswapPrice: number | null
  /** 24-hour average Chainlink price for EURC/USD */
  avg24hPrice: number | null
}

export interface OrderContext {
  /** Total input amount in atomic units (string for bigint compat) */
  inputAmount: string
  /** Amount already filled in atomic units */
  filledAmount: string
  /** Unix timestamp when the order was created */
  createdAt: number
  /** Unix timestamp deadline for the order */
  deadline: number
  /** Direction: which token we're buying */
  fromToken: string
  toToken: string
}

export interface ScoreBreakdown {
  priceScore: number
  divergenceScore: number
  urgencyScore: number
}

export interface TimingResult {
  score: number
  breakdown: ScoreBreakdown
  action: 'SWAP' | 'WAIT'
  /** Multiplier on the default chunk size (1 = normal, 2 = aggressive) */
  chunkMultiplier: number
  reason: string
}

// ---------------------------------------------------------------------------
// Runtime-configurable strategy parameters
// ---------------------------------------------------------------------------

export interface StrategyConfig {
  weightPrice: number
  weightDivergence: number
  weightUrgency: number
  swapThreshold: number
  aggressiveThreshold: number
  urgencyOverride: number
  autoExecute: boolean
}

export let strategyConfig: StrategyConfig = {
  weightPrice: 0.4,
  weightDivergence: 0.2,
  weightUrgency: 0.4,
  swapThreshold: 30,
  aggressiveThreshold: 60,
  urgencyOverride: 80,
  autoExecute: true,
}

export function updateStrategyConfig(partial: Partial<StrategyConfig>) {
  strategyConfig = { ...strategyConfig, ...partial }
}

// ---------------------------------------------------------------------------
// Weights (now read from mutable config)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Individual score components (each returns 0-100)
// ---------------------------------------------------------------------------

/**
 * Price vs 24h average score.
 *
 * For USDC → EURC (buying EURC): a *lower* current EURC/USD price means we
 * get more EURC per dollar — that's favorable, so score goes up.
 *
 * For EURC → USDC (selling EURC): a *higher* current EURC/USD price means
 * each EURC is worth more dollars — favorable, score goes up.
 *
 * The score is linearly mapped: 0 bps deviation = 50, ±50 bps = 0 or 100,
 * clamped to [0, 100].
 */
export function computePriceScore(
  currentPrice: number,
  avg24h: number,
  direction: 'buy_eurc' | 'sell_eurc',
): number {
  if (avg24h <= 0 || currentPrice <= 0) return 50 // neutral when data missing

  // Positive deviationPct means current price is ABOVE the 24h average
  const deviationPct = ((currentPrice - avg24h) / avg24h) * 100

  // For buying EURC: lower price = better → invert deviation
  // For selling EURC: higher price = better → use deviation directly
  const favorableDeviation = direction === 'buy_eurc' ? -deviationPct : deviationPct

  // Map: -0.5% → 0, 0% → 50, +0.5% → 100  (clamped)
  // That means 50 bps of favorable movement = perfect score
  const score = 50 + (favorableDeviation / 0.5) * 50

  return clamp(score, 0, 100)
}

/**
 * Source divergence score.
 *
 * Low divergence among available price sources = high confidence = high score.
 * We measure the max spread in basis points among all available prices.
 *
 *   0 bps spread  → 100
 *  50 bps spread  →   0
 *
 * If fewer than 2 sources are available, return 50 (neutral/unknown).
 */
export function computeDivergenceScore(prices: (number | null)[]): number {
  const valid = prices.filter((p): p is number => p != null && p > 0)
  if (valid.length < 2) return 50 // not enough data to judge

  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length
  const spreadBps = avg > 0 ? ((max - min) / avg) * 10_000 : 0

  // Linear: 0 bps → 100, 50 bps → 0
  const score = 100 - (spreadBps / 50) * 100
  return clamp(score, 0, 100)
}

/**
 * Urgency score.
 *
 * `(time_elapsed / total_time) * (amount_remaining / total_amount)`
 *
 * When the deadline is close AND a large portion is still unfilled,
 * urgency is high.  The raw product is 0-1; we scale to 0-100.
 *
 * Edge cases:
 *   - If the order is already past deadline → 100 (maximum urgency)
 *   - If total_time is 0 or negative → 100
 */
export function computeUrgencyScore(
  now: number,
  createdAt: number,
  deadline: number,
  inputAmount: bigint,
  filledAmount: bigint,
): number {
  const totalTime = deadline - createdAt
  if (totalTime <= 0 || now >= deadline) return 100

  const elapsed = now - createdAt
  const timeRatio = clamp(elapsed / totalTime, 0, 1)

  const totalAmt = safeNumber(inputAmount)
  const filledAmt = safeNumber(filledAmount)
  if (totalAmt <= 0) return 0
  const remainingRatio = clamp((totalAmt - filledAmt) / totalAmt, 0, 1)

  const urgency = timeRatio * remainingRatio * 100
  return clamp(urgency, 0, 100)
}

// ---------------------------------------------------------------------------
// Main scoring function
// ---------------------------------------------------------------------------

/**
 * Compute the composite timing score for an order given current market data.
 */
export function computeTimingScore(
  prices: PriceSnapshot,
  order: OrderContext,
  now?: number,
): TimingResult {
  const currentTime = now ?? Math.floor(Date.now() / 1000)

  // Determine swap direction
  const direction: 'buy_eurc' | 'sell_eurc' =
    order.toToken === 'EURC' ? 'buy_eurc' : 'sell_eurc'

  // --- Pick a representative "current price" (prefer Chainlink, fallback to available) ---
  const availablePrices = [prices.chainlinkPrice, prices.fyndPrice, prices.uniswapPrice]
  const validPrices = availablePrices.filter((p): p is number => p != null && p > 0)
  const currentPrice = validPrices.length > 0
    ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length
    : 0

  // --- Compute individual scores ---
  const priceScore = currentPrice > 0 && prices.avg24hPrice != null && prices.avg24hPrice > 0
    ? computePriceScore(currentPrice, prices.avg24hPrice, direction)
    : 50 // neutral fallback

  const divergenceScore = computeDivergenceScore(availablePrices)

  const urgencyScore = computeUrgencyScore(
    currentTime,
    order.createdAt,
    order.deadline,
    BigInt(order.inputAmount),
    BigInt(order.filledAmount),
  )

  // --- Weighted composite (uses runtime-configurable weights) ---
  const score = Math.round(
    priceScore * strategyConfig.weightPrice +
    divergenceScore * strategyConfig.weightDivergence +
    urgencyScore * strategyConfig.weightUrgency,
  )

  const breakdown: ScoreBreakdown = {
    priceScore: Math.round(priceScore),
    divergenceScore: Math.round(divergenceScore),
    urgencyScore: Math.round(urgencyScore),
  }

  // --- Decision logic (uses runtime-configurable thresholds) ---
  let action: 'SWAP' | 'WAIT'
  let chunkMultiplier = 1
  let reason: string

  if (score > strategyConfig.aggressiveThreshold) {
    action = 'SWAP'
    chunkMultiplier = 2
    reason = `Strong signal (score ${score}): aggressive 2x chunk`
  } else if (score > strategyConfig.swapThreshold) {
    action = 'SWAP'
    chunkMultiplier = 1
    reason = `Good timing (score ${score}): normal chunk`
  } else if (urgencyScore > strategyConfig.urgencyOverride) {
    // Urgency override — deadline pressure forces execution even with low overall score
    action = 'SWAP'
    chunkMultiplier = 1
    reason = `Low score (${score}) but high urgency (${Math.round(urgencyScore)}): forced swap`
  } else {
    action = 'WAIT'
    chunkMultiplier = 0
    reason = `Score ${score} below threshold, waiting for better conditions`
  }

  // Add detail about dominant factor
  const dominant = priceScore * strategyConfig.weightPrice >= divergenceScore * strategyConfig.weightDivergence &&
    priceScore * strategyConfig.weightPrice >= urgencyScore * strategyConfig.weightUrgency
    ? 'price'
    : urgencyScore * strategyConfig.weightUrgency >= divergenceScore * strategyConfig.weightDivergence
      ? 'urgency'
      : 'divergence'
  reason += ` (dominant factor: ${dominant})`

  return { score, breakdown, action, chunkMultiplier, reason }
}

// ---------------------------------------------------------------------------
// Adaptive TWAP Chunk Sizing
// ---------------------------------------------------------------------------

/**
 * Default tick interval in seconds between CRE ticks.
 */
export const TICK_INTERVAL = 30

export interface AdaptiveChunkParams {
  /** Total order input in atomic units */
  inputAmount: bigint
  /** Amount already filled in atomic units */
  filledAmount: bigint
  /** Unix timestamp deadline for the order */
  deadline: number
  /** Unix timestamp when the order was created */
  createdAt: number
  /** Current timing score (0-100) */
  timingScore: number
  /** Current unix timestamp */
  now: number
}

/**
 * Compute an adaptive TWAP chunk size based on urgency and timing score.
 *
 * Instead of fixed chunks, the system adapts:
 * - **Urgency**: As deadline approaches, chunks get larger (quadratic ramp)
 * - **Score**: Higher timing scores = larger chunks (favorable conditions)
 * - **Remaining amount**: Proportional to what's left to fill
 *
 * Returns the chunk size as a bigint in atomic units.
 */
export function adaptiveChunkSize(params: AdaptiveChunkParams): bigint {
  const { inputAmount, filledAmount, deadline, createdAt, timingScore, now } = params

  const remainingAmount = inputAmount - filledAmount
  if (remainingAmount <= 0n) return 0n

  const totalDuration = deadline - createdAt
  const elapsed = now - createdAt

  // Edge case: already past deadline or zero-duration order — return everything
  if (totalDuration <= 0 || now >= deadline) return remainingAmount

  const timeProgress = clamp(elapsed / totalDuration, 0, 1) // 0.0 to 1.0

  // Base chunk: remaining / estimated ticks left
  const estimatedTicksLeft = Math.max(1, Math.floor((totalDuration - elapsed) / TICK_INTERVAL))
  // Use Number for arithmetic then convert back — amounts are within safe integer range for chunk math
  const remainingNum = safeNumber(remainingAmount)
  const inputNum = safeNumber(inputAmount)
  const baseChunk = remainingNum / estimatedTicksLeft

  // Urgency multiplier: quadratic ramp as deadline approaches
  const urgencyMultiplier = 1.0 + (timeProgress * timeProgress)

  // Score multiplier: favorable conditions = bigger chunks
  const scoreMultiplier = timingScore > 85 ? 2.0 : timingScore > 70 ? 1.0 : 0.5

  // Adaptive chunk
  const adaptiveChunk = baseChunk * urgencyMultiplier * scoreMultiplier

  // Clamp: never more than remaining, never less than 1% of total input
  const minChunk = inputNum * 0.01
  const maxChunk = remainingNum
  const finalChunk = clamp(adaptiveChunk, minChunk, maxChunk)

  return BigInt(Math.floor(finalChunk))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Convert BigInt to Number with a safety warning if the value exceeds
 * Number.MAX_SAFE_INTEGER (~9×10^15). For hackathon demo amounts
 * (< $10M USDC = < 10^13 at 6 decimals) this is safe, but the guard
 * protects against unexpected large values.
 *
 * For production: throw instead of warn for amounts > MAX_SAFE_INTEGER
 */
export function safeNumber(n: bigint): number {
  if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(-Number.MAX_SAFE_INTEGER)) {
    console.warn(`BigInt ${n.toString()} exceeds safe integer range, precision may be lost`)
  }
  return Number(n)
}

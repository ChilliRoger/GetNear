/**
 * GetNear Strategy Engine & Adaptive TWAP (P6)
 *
 * Computes a 0–100 composite timing score and adaptive TWAP chunk size
 * for corporate treasury FX execution on NEAR.
 *
 * Scoring Factors (Configurable 40 / 20 / 40):
 *   1. Price vs Rolling Average (40%): Is the current quote favorable compared to the 24h trend?
 *   2. Divergence (20%): How closely does the quote match the ECB reference rate and recent market spread?
 *   3. Urgency (40%): Time elapsed toward deadline with unfilled order balance (quadratic ramp).
 *
 * Decision Thresholds:
 *   score > 85  → EXECUTE aggressively (2x chunk)
 *   score >= 70 → EXECUTE normal (1x chunk)
 *   score < 70  → WAIT (hold capital for better conditions, unless urgencyOverride triggered)
 *
 * Hard Guards:
 *   - Order must be Active
 *   - Reference rate must be available and positive
 *   - Quote must not be expired
 *   - Deviation must not exceed order.maxDeviationBps
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarketInputs {
  /** Effective rate from QuoteSource (e.g. EURe per USDC: 0.88756) */
  quoteRate: number
  /** Official ECB reference rate from ReferenceRateSource (e.g. 0.89566) */
  referenceRate: number | null
  /** 24-hour rolling average rate (from historical recordings) */
  avg24hRate: number | null
  /** Recent solver quote rates (for local volatility / spread estimation) */
  recentQuoteRates?: number[]
  /** Expiration timestamp of the quote (Unix ms) */
  quoteExpiresAt?: number
  /** Quote identifier / correlation ID */
  quoteId?: string
}

export interface OrderContext {
  id: string
  /** Total input amount in atomic units */
  inputAmount: bigint
  /** Amount already filled in atomic units */
  filledAmount: bigint
  /** Creation timestamp (Unix seconds) */
  createdAt: number
  /** Deadline timestamp (Unix seconds) */
  deadline: number
  /** Max allowable adverse deviation from reference in basis points (e.g. 120 bps) */
  maxDeviationBps: number
  /** Current order status: 'Active' | 'Pending' | 'Completed' | 'Expired' | 'Cancelled' */
  status: string
  /** From token symbol (e.g. 'USDC') */
  fromToken: string
  /** To token symbol (e.g. 'EURe') */
  toToken: string
  /** Explicit maximum chunk size in atomic units (optional, defaults to 20% of order) */
  maxChunkIn?: bigint
}

export interface ScoreBreakdown {
  priceScore: number
  divergenceScore: number
  urgencyScore: number
  total: number
}

export interface StrategyDecision {
  action: 'EXECUTE' | 'WAIT'
  score: number
  breakdown: ScoreBreakdown
  chunkMultiplier: number
  reason: string
  deviationBps: number | null
  guardFailed?: boolean
}

export interface StrategyConfig {
  weightPrice: number
  weightDivergence: number
  weightUrgency: number
  executeThreshold: number
  aggressiveThreshold: number
  urgencyOverride: number
  defaultMaxDeviationBps: number
  defaultMaxChunkPercent: number
  routeMinimumAtomic: bigint
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export let strategyConfig: StrategyConfig = {
  weightPrice: 0.4,
  weightDivergence: 0.2,
  weightUrgency: 0.4,
  executeThreshold: 70,
  aggressiveThreshold: 85,
  urgencyOverride: 85,
  defaultMaxDeviationBps: 120, // 120 bps tolerance for cross-chain intents
  defaultMaxChunkPercent: 0.2, // 20% max per chunk
  routeMinimumAtomic: 5_000_000n, // $5.00 USDC minimum from P5 route probe
}

export function updateStrategyConfig(partial: Partial<StrategyConfig>) {
  strategyConfig = { ...strategyConfig, ...partial }
}

// ---------------------------------------------------------------------------
// Component Scoring Functions (0–100)
// ---------------------------------------------------------------------------

/**
 * 1. Price vs Rolling Average Score (40% weight)
 *
 * Measures whether current rate is favorable compared to recent historical average.
 * Higher rate = getting more output per unit input = favorable.
 * 0% deviation = 50 (neutral).
 * +0.50% favorable = 100.
 * -0.50% adverse = 0.
 */
export function computePriceScore(quoteRate: number, avg24hRate: number | null): number {
  if (!avg24hRate || avg24hRate <= 0 || quoteRate <= 0) return 50

  const deviationPct = ((quoteRate - avg24hRate) / avg24hRate) * 100
  // Map: -0.5% -> 0, 0% -> 50, +0.5% -> 100
  const score = 50 + (deviationPct / 0.5) * 50
  return clamp(score, 0, 100)
}

/**
 * 2. Divergence Score (20% weight)
 *
 * Measures quote alignment with ECB reference rate.
 * Deviation bps: (quoteRate - refRate) / refRate * 10,000.
 * If quote is at or above reference rate -> 100 score.
 * If adverse, scales down linearly against maxDeviationBps budget:
 *   0 bps adverse  -> 100
 *   maxDev adverse ->   0
 */
export function computeDivergenceScore(
  quoteRate: number,
  referenceRate: number | null,
  maxDeviationBps: number = strategyConfig.defaultMaxDeviationBps,
): { score: number; deviationBps: number | null } {
  if (referenceRate == null || referenceRate <= 0 || quoteRate <= 0) {
    return { score: 0, deviationBps: null }
  }

  const deviationBps = Math.round(((quoteRate - referenceRate) / referenceRate) * 10_000)

  if (deviationBps >= 0) {
    // Quote matches or beats reference rate
    return { score: 100, deviationBps }
  }

  // Negative deviation (spread / fee paid)
  const adverseBps = Math.abs(deviationBps)
  const budget = Math.max(1, maxDeviationBps)
  const score = Math.max(0, 100 - (adverseBps / budget) * 100)

  return { score: clamp(score, 0, 100), deviationBps }
}

/**
 * 3. Urgency Score (40% weight)
 *
 * Quadratic urgency ramp:
 * `(time_elapsed / total_time)^2 * (remaining_amount / total_amount)`
 *
 * As deadline nears, score ramps up quadratically to guarantee completion.
 */
export function computeUrgencyScore(
  nowSec: number,
  createdAtSec: number,
  deadlineSec: number,
  inputAmount: bigint,
  filledAmount: bigint,
): number {
  const totalDuration = deadlineSec - createdAtSec
  if (totalDuration <= 0 || nowSec >= deadlineSec) return 100

  const elapsed = Math.max(0, nowSec - createdAtSec)
  const timeProgress = clamp(elapsed / totalDuration, 0, 1)

  const remaining = inputAmount - filledAmount
  if (remaining <= 0n) return 0
  const remainingRatio = clamp(Number(remaining) / Math.max(1, Number(inputAmount)), 0, 1)

  // Quadratic time acceleration
  const urgency = timeProgress * timeProgress * remainingRatio * 100
  return clamp(urgency, 0, 100)
}

// ---------------------------------------------------------------------------
// Composite Timing Score & Guard Evaluation
// ---------------------------------------------------------------------------

export function evaluateStrategy(
  market: MarketInputs,
  order: OrderContext,
  nowSec: number = Math.floor(Date.now() / 1000),
): StrategyDecision {
  // -------------------------------------------------------------------------
  // 1. HARD GUARDS (Pre-Conditions)
  // -------------------------------------------------------------------------

  // Guard A: Order Status must be Active
  const normalizedStatus = order.status.toUpperCase()
  if (normalizedStatus !== 'ACTIVE' && normalizedStatus !== 'APPROVED' && normalizedStatus !== 'FILLING') {
    return {
      action: 'WAIT',
      score: 0,
      breakdown: { priceScore: 0, divergenceScore: 0, urgencyScore: 0, total: 0 },
      chunkMultiplier: 0,
      reason: `Order is not Active (status: ${order.status})`,
      deviationBps: null,
      guardFailed: true,
    }
  }

  // Guard B: Reference rate must be available and positive
  if (market.referenceRate == null || market.referenceRate <= 0) {
    return {
      action: 'WAIT',
      score: 0,
      breakdown: { priceScore: 0, divergenceScore: 0, urgencyScore: 0, total: 0 },
      chunkMultiplier: 0,
      reason: 'Reference rate unavailable: strategy must WAIT',
      deviationBps: null,
      guardFailed: true,
    }
  }

  // Guard C: Quote must not be expired
  if (market.quoteExpiresAt && market.quoteExpiresAt < nowSec * 1000) {
    return {
      action: 'WAIT',
      score: 0,
      breakdown: { priceScore: 0, divergenceScore: 0, urgencyScore: 0, total: 0 },
      chunkMultiplier: 0,
      reason: 'Quote is expired: waiting for fresh market quote',
      deviationBps: null,
      guardFailed: true,
    }
  }

  // -------------------------------------------------------------------------
  // 2. COMPONENT SCORING
  // -------------------------------------------------------------------------

  const maxDev = order.maxDeviationBps || strategyConfig.defaultMaxDeviationBps
  const priceScore = computePriceScore(market.quoteRate, market.avg24hRate)
  const { score: divergenceScore, deviationBps } = computeDivergenceScore(
    market.quoteRate,
    market.referenceRate,
    maxDev,
  )
  const urgencyScore = computeUrgencyScore(
    nowSec,
    order.createdAt,
    order.deadline,
    order.inputAmount,
    order.filledAmount,
  )

  // Guard D: Max adverse deviation check
  if (deviationBps !== null && deviationBps < -maxDev) {
    return {
      action: 'WAIT',
      score: 0,
      breakdown: {
        priceScore: Math.round(priceScore),
        divergenceScore: Math.round(divergenceScore),
        urgencyScore: Math.round(urgencyScore),
        total: 0,
      },
      chunkMultiplier: 0,
      reason: `Adverse deviation ${deviationBps} bps exceeds order limit of -${maxDev} bps`,
      deviationBps,
      guardFailed: true,
    }
  }

  // -------------------------------------------------------------------------
  // 3. WEIGHTED COMPOSITE SCORE
  // -------------------------------------------------------------------------

  const totalScore = Math.round(
    priceScore * strategyConfig.weightPrice +
      divergenceScore * strategyConfig.weightDivergence +
      urgencyScore * strategyConfig.weightUrgency,
  )

  const breakdown: ScoreBreakdown = {
    priceScore: Math.round(priceScore),
    divergenceScore: Math.round(divergenceScore),
    urgencyScore: Math.round(urgencyScore),
    total: totalScore,
  }

  // -------------------------------------------------------------------------
  // 4. DECISION THRESHOLDS
  // -------------------------------------------------------------------------

  let action: 'EXECUTE' | 'WAIT'
  let chunkMultiplier = 1
  let reason: string

  if (totalScore >= strategyConfig.aggressiveThreshold) {
    action = 'EXECUTE'
    chunkMultiplier = 2
    reason = `Exceptional timing (score ${totalScore} >= ${strategyConfig.aggressiveThreshold}): aggressive 2x chunk`
  } else if (totalScore >= strategyConfig.executeThreshold) {
    action = 'EXECUTE'
    chunkMultiplier = 1
    reason = `Favorable timing (score ${totalScore} >= ${strategyConfig.executeThreshold}): normal 1x chunk`
  } else if (urgencyScore >= strategyConfig.urgencyOverride) {
    // Deadline pressure overrides score to prevent unexecuted expired orders
    action = 'EXECUTE'
    chunkMultiplier = 1
    reason = `Low timing score (${totalScore}) overridden by high urgency (${Math.round(
      urgencyScore,
    )} >= ${strategyConfig.urgencyOverride}): forced execution`
  } else {
    action = 'WAIT'
    chunkMultiplier = 0
    reason = `Timing score (${totalScore}) below threshold ${strategyConfig.executeThreshold}: holding capital`
  }

  return {
    action,
    score: totalScore,
    breakdown,
    chunkMultiplier,
    reason,
    deviationBps,
    guardFailed: false,
  }
}

// ---------------------------------------------------------------------------
// Adaptive TWAP Chunk Sizing
// ---------------------------------------------------------------------------

export const TICK_INTERVAL_SEC = 30

export interface SizingParams {
  inputAmount: bigint
  filledAmount: bigint
  deadlineSec: number
  createdAtSec: number
  nowSec: number
  timingScore: number
  maxChunkIn?: bigint
  routeMinimumAtomic?: bigint
}

/**
 * Computes adaptive chunk size clamped by route minimum, remaining balance,
 * and maximum chunk constraints.
 */
export function computeAdaptiveChunkSize(params: SizingParams): bigint {
  const {
    inputAmount,
    filledAmount,
    deadlineSec,
    createdAtSec,
    nowSec,
    timingScore,
    maxChunkIn,
    routeMinimumAtomic = strategyConfig.routeMinimumAtomic,
  } = params

  const remaining = inputAmount - filledAmount
  if (remaining <= 0n) return 0n

  const totalDuration = deadlineSec - createdAtSec
  const elapsed = Math.max(0, nowSec - createdAtSec)

  // Past deadline: sweep whatever is left
  if (totalDuration <= 0 || nowSec >= deadlineSec) {
    return remaining
  }

  // Base chunk: distribute remaining amount across estimated remaining ticks
  const remainingTicks = Math.max(1, Math.floor((totalDuration - elapsed) / TICK_INTERVAL_SEC))
  const baseChunk = Number(remaining) / remainingTicks

  // Urgency multiplier: quadratic ramp [1.0 -> 2.0]
  const timeProgress = clamp(elapsed / totalDuration, 0, 1)
  const urgencyMultiplier = 1.0 + timeProgress * timeProgress

  // Score multiplier: higher timing score = allocate more
  const scoreMultiplier =
    timingScore >= strategyConfig.aggressiveThreshold
      ? 2.0
      : timingScore >= strategyConfig.executeThreshold
        ? 1.0
        : 0.5

  const rawChunk = BigInt(Math.floor(baseChunk * urgencyMultiplier * scoreMultiplier))

  // Upper bound: default 20% of order total (or explicit order maxChunkIn)
  const defaultMaxChunk = (inputAmount * BigInt(Math.round(strategyConfig.defaultMaxChunkPercent * 100))) / 100n
  const upperLimit = maxChunkIn && maxChunkIn > 0n ? maxChunkIn : defaultMaxChunk

  let clamped = rawChunk
  if (clamped > upperLimit) clamped = upperLimit
  if (clamped > remaining) clamped = remaining

  // Route minimum clamping: ensure at least routeMinimum unless remaining is dust
  if (clamped < routeMinimumAtomic) {
    if (remaining <= routeMinimumAtomic) {
      // Dust sweep: fill remaining balance
      clamped = remaining
    } else {
      clamped = routeMinimumAtomic
    }
  }

  return clamped
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

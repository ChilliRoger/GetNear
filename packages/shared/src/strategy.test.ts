import {
  evaluateStrategy,
  computePriceScore,
  computeDivergenceScore,
  computeUrgencyScore,
  computeAdaptiveChunkSize,
  strategyConfig,
  type MarketInputs,
  type OrderContext,
} from './strategy'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAILED: ${message}`)
    process.exit(1)
  }
}

console.log('Running GetNear Strategy Engine & Adaptive TWAP Unit Tests (P6)...')

// ---------------------------------------------------------------------------
// 1. Component Tests
// ---------------------------------------------------------------------------

// 1.1 Price Score
const favorablePrice = computePriceScore(0.92, 0.90) // +2.2% favorable
assert(favorablePrice === 100, `Favorable price movement should cap at 100 (got ${favorablePrice})`)

const neutralPrice = computePriceScore(0.90, 0.90)
assert(neutralPrice === 50, `Equal price should score 50 (got ${neutralPrice})`)

const adversePrice = computePriceScore(0.88, 0.90) // -2.2% adverse
assert(adversePrice === 0, `Adverse price movement should floor at 0 (got ${adversePrice})`)

// 1.2 Divergence Score
const tightSpread = computeDivergenceScore(0.8950, 0.8956, 120) // -6 bps
assert(tightSpread.score > 90, `Tight spread should score > 90 (got ${tightSpread.score})`)

const matchingRef = computeDivergenceScore(0.8956, 0.8956, 120)
assert(matchingRef.score === 100, `Exact match with ref should score 100 (got ${matchingRef.score})`)

// 1.3 Urgency Score
const lowUrgency = computeUrgencyScore(100, 0, 1000, 1000n, 100n)
assert(lowUrgency < 10, `Early in order lifetime with low time progress should have low urgency (got ${lowUrgency})`)

const highUrgency = computeUrgencyScore(950, 0, 1000, 1000n, 100n)
assert(highUrgency > 70, `Near deadline with unfilled amount should have high urgency (got ${highUrgency})`)

// ---------------------------------------------------------------------------
// 2. Hard Guards Verification
// ---------------------------------------------------------------------------

const baseOrder: OrderContext = {
  id: 'order-1',
  inputAmount: 100_000_000n, // $100 USDC
  filledAmount: 0n,
  createdAt: 1000,
  deadline: 2000,
  maxDeviationBps: 120,
  status: 'Active',
  fromToken: 'USDC',
  toToken: 'EURe',
}

const baseMarket: MarketInputs = {
  quoteRate: 0.88756,
  referenceRate: 0.89566, // -90 bps (within 120 bps limit)
  avg24hRate: 0.88700,
  quoteExpiresAt: 2_500_000,
}

// Guard A: Inactive order
const pendingOrder: OrderContext = { ...baseOrder, status: 'Pending' }
const pendingDecision = evaluateStrategy(baseMarket, pendingOrder, 1500)
assert(pendingDecision.action === 'WAIT', 'Inactive (Pending) order must WAIT')
assert(pendingDecision.guardFailed === true, 'Guard must flag failure for Pending order')

// Guard B: Missing reference rate
const noRefMarket: MarketInputs = { ...baseMarket, referenceRate: null }
const noRefDecision = evaluateStrategy(noRefMarket, baseOrder, 1500)
assert(noRefDecision.action === 'WAIT', 'Missing reference rate must WAIT')
assert(noRefDecision.reason.includes('Reference rate unavailable'), 'Reason must explain missing reference')

// Guard C: Expired quote
const expiredMarket: MarketInputs = { ...baseMarket, quoteExpiresAt: 1_400_000 } // past at now=1500
const expiredDecision = evaluateStrategy(expiredMarket, baseOrder, 1500)
assert(expiredDecision.action === 'WAIT', 'Expired quote must WAIT')
assert(expiredDecision.reason.includes('Quote is expired'), 'Reason must explain expired quote')

// Guard D: Adverse deviation exceeds maxDeviationBps
const badSpreadMarket: MarketInputs = {
  quoteRate: 0.87000, // -286 bps adverse from 0.89566
  referenceRate: 0.89566,
  avg24hRate: 0.87000,
}
const badDevDecision = evaluateStrategy(badSpreadMarket, baseOrder, 1500)
assert(badDevDecision.action === 'WAIT', 'Excessive adverse deviation must WAIT')
assert(badDevDecision.guardFailed === true, 'Excessive deviation must trip guard')

// ---------------------------------------------------------------------------
// 3. Decision Thresholds & Multipliers
// ---------------------------------------------------------------------------

// 3.1 Aggressive Timing (> 85 score -> 2x chunk)
const greatMarket: MarketInputs = {
  quoteRate: 0.91000, // +160 bps favorable
  referenceRate: 0.89566,
  avg24hRate: 0.89000,
  quoteExpiresAt: 3_000_000,
}
const aggressiveDecision = evaluateStrategy(greatMarket, baseOrder, 1800)
assert(aggressiveDecision.action === 'EXECUTE', 'Great conditions must EXECUTE')
assert(aggressiveDecision.chunkMultiplier === 2, `Score ${aggressiveDecision.score} should trigger 2x chunk`)

// 3.2 Moderate Timing (70–84 score -> 1x chunk)
const goodMarket: MarketInputs = {
  quoteRate: 0.89200, // favorable rate vs 24h avg
  referenceRate: 0.89566,
  avg24hRate: 0.88700,
  quoteExpiresAt: 3_000_000,
}
const normalDecision = evaluateStrategy(goodMarket, baseOrder, 1850)
assert(normalDecision.action === 'EXECUTE', `Good conditions should EXECUTE (got score ${normalDecision.score})`)
assert(normalDecision.chunkMultiplier === 1, 'Normal timing should use 1x chunk')

// 3.3 Urgency Override (Low score + High urgency -> forced EXECUTE)
const stagnantMarket: MarketInputs = {
  quoteRate: 0.88500, // below 24h avg
  referenceRate: 0.89566,
  avg24hRate: 0.89000,
  quoteExpiresAt: 3_000_000,
}
// Late in order: 990 / 1000 with 0 filled -> urgency > 85
const forcedDecision = evaluateStrategy(stagnantMarket, baseOrder, 1990)
assert(forcedDecision.action === 'EXECUTE', 'High urgency near deadline must override low score')
assert(forcedDecision.reason.includes('overridden by high urgency'), 'Reason must indicate urgency override')

// ---------------------------------------------------------------------------
// 4. Adaptive Chunk Sizing & Route Clamps
// ---------------------------------------------------------------------------

// 4.1 Clamp by Route Minimum ($5.00 USDC = 5,000,000 atomic)
const smallChunk = computeAdaptiveChunkSize({
  inputAmount: 100_000_000n, // $100
  filledAmount: 0n,
  createdAtSec: 1000,
  deadlineSec: 2000,
  nowSec: 1010,
  timingScore: 50,
})
assert(
  smallChunk >= strategyConfig.routeMinimumAtomic,
  `Chunk ${smallChunk} must be clamped to route minimum of ${strategyConfig.routeMinimumAtomic}`,
)

// 4.2 Clamp by Max Chunk (20% of $100 = $20 USDC = 20,000,000 atomic)
const maxChunk = computeAdaptiveChunkSize({
  inputAmount: 100_000_000n, // $100
  filledAmount: 0n,
  createdAtSec: 1000,
  deadlineSec: 2000,
  nowSec: 1990, // high urgency
  timingScore: 90, // aggressive multiplier
})
assert(
  maxChunk <= 20_000_000n,
  `Chunk ${maxChunk} must not exceed 20% max chunk (20,000,000 atomic)`,
)

// 4.3 Final sweep of remaining dust
const dustChunk = computeAdaptiveChunkSize({
  inputAmount: 100_000_000n,
  filledAmount: 98_000_000n, // $2.00 left (< $5 route minimum)
  createdAtSec: 1000,
  deadlineSec: 2000,
  nowSec: 1990,
  timingScore: 80,
})
assert(dustChunk === 2_000_000n, `Remaining dust ($2.00) must be swept completely (got ${dustChunk})`)

console.log('✓ All 15 strategy engine and adaptive TWAP tests passed successfully!')

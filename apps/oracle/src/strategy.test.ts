import { computeTimingScore, computePriceScore, computeDivergenceScore, computeUrgencyScore, adaptiveChunkSize, type PriceSnapshot, type OrderContext } from './strategy.js'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAILED: ${message}`)
    process.exit(1)
  }
}

console.log('Running strategy engine smoke tests...')

// 1. Price score test
const buyScore = computePriceScore(1.05, 1.10, 'buy_eurc')
assert(buyScore > 50, `Buy EURC when price is below average should score > 50 (got ${buyScore})`)

const sellScore = computePriceScore(1.15, 1.10, 'sell_eurc')
assert(sellScore > 50, `Sell EURC when price is above average should score > 50 (got ${sellScore})`)

// 2. Divergence score test
const tightSpread = computeDivergenceScore([1.0800, 1.0801, 1.0799])
assert(tightSpread > 80, `Tight spread (1.85 bps) should yield high score > 80 (got ${tightSpread})`)

const wideSpread = computeDivergenceScore([1.000, 1.100])
assert(wideSpread < 50, `Wide spread should yield low score (got ${wideSpread})`)

// 3. Urgency score test
const lowUrgency = computeUrgencyScore(100, 0, 1000, 1000n, 100n)
assert(lowUrgency < 50, `Early in order with small fill should have low urgency (got ${lowUrgency})`)

const highUrgency = computeUrgencyScore(900, 0, 1000, 1000n, 100n)
assert(highUrgency > 50, `Late in order with small fill should have high urgency (got ${highUrgency})`)

// 4. Composite Timing Score test
const mockPrices: PriceSnapshot = {
  chainlinkPrice: 1.08,
  fyndPrice: 1.08,
  uniswapPrice: 1.08,
  avg24hPrice: 1.08,
}
const mockOrder: OrderContext = {
  inputAmount: '10000000',
  filledAmount: '0',
  createdAt: 1000,
  deadline: 2000,
  fromToken: 'USDC',
  toToken: 'EURC',
}
const result = computeTimingScore(mockPrices, mockOrder, 1500)
assert(result.score >= 0 && result.score <= 100, `Timing score should be in 0-100 range (got ${result.score})`)
assert(['SWAP', 'WAIT'].includes(result.action), `Action must be SWAP or WAIT (got ${result.action})`)

// 5. Adaptive chunk sizing test
const chunk = adaptiveChunkSize({
  inputAmount: 1000000n,
  filledAmount: 0n,
  deadline: 2000,
  createdAt: 1000,
  timingScore: 80,
  now: 1500,
})
assert(chunk > 0n && chunk <= 1000000n, `Chunk size must be valid (got ${chunk})`)

console.log('✓ All strategy engine smoke tests passed!')

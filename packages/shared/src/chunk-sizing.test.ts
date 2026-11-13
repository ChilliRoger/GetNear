/**
 * Final-chunk accounting regression tests (pure integer math).
 * Run with: tsx src/chunk-sizing.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ceilDiv, planChunkAmounts, type ChunkPlanInput } from './chunk-sizing.js'

const USDC = 1_000_000n

/** Order #12 (previous contract version): 10 USDC quoted for ~8.9645 EURe, 8 EURe still due. */
const order12: ChunkPlanInput = {
  candidateIn: 10n * USDC,
  quoteIn: 10n * USDC,
  quoteOut: 8_964_500_000_000_000_000n, // 8.9645 EURe at 18 decimals
  decimalsOut: 18,
  rate: 0.89645,
  hasCeiling: true,
  remainingDueOut: 8_000_000n, // €8.00 (6 decimals)
  remainingIn: 15n * USDC,
  orderMaxChunk: 10n * USDC,
  globalMaxChunk: 20n * USDC,
}

test('ceilDiv rounds up and rejects a zero denominator', () => {
  assert.equal(ceilDiv(10n, 3n), 4n)
  assert.equal(ceilDiv(9n, 3n), 3n)
  assert.equal(ceilDiv(0n, 7n), 0n)
  assert.throws(() => ceilDiv(1n, 0n))
})

test('Order #12 figures: final chunk charges ceil(remainingOut x quotedIn / quotedOut), not the full 10 USDC', () => {
  const res = planChunkAmounts(order12)
  assert.ok(res.ok)
  if (!res.ok) return
  const rem = 8_000_000n * 10n ** 12n
  const floor = (rem * order12.quoteIn) / order12.quoteOut
  // The task brief quotes 8,924,089 atomic USDC: that is the FLOOR of 80 / 8.9645 at six decimals.
  assert.equal(floor, 8_924_089n)
  // The mandated rule is "round the required input UP" so the payout is fully covered: 8,924,090.
  assert.equal(res.plan.amountIn, 8_924_090n)
  assert.equal(res.plan.amountIn - floor, 1n, 'ceil is exactly one atomic unit above the floor figure')
  assert.equal(res.plan.settlementOut, 8_000_000n, 'payout equals the remaining invoice due')
  assert.equal(res.plan.adjusted, true)
  assert.ok(res.plan.amountIn < order12.candidateIn, 'must charge less than the planned 10 USDC')
  // Quoted output at the adjusted input must still cover the payout.
  assert.ok(res.plan.simulatedOut >= rem)
})

test('Order #12 exact on-chain quote (8.964478509727814708 EURe) needs 8,924,111 atomic USDC', () => {
  const res = planChunkAmounts({ ...order12, quoteOut: 8_964_478_509_727_814_708n })
  assert.ok(res.ok)
  if (res.ok) {
    assert.equal(res.plan.amountIn, 8_924_111n)
    // Historical over-charge on the previous version: 10,000,000 - 8,924,111.
    assert.equal(order12.candidateIn - res.plan.amountIn, 1_075_889n)
  }
})

test('non-final chunks are unchanged (payout below remaining due)', () => {
  const res = planChunkAmounts({ ...order12, remainingDueOut: 100_000_000n })
  assert.ok(res.ok)
  if (res.ok) {
    assert.equal(res.plan.adjusted, false)
    assert.equal(res.plan.amountIn, 10n * USDC)
    assert.equal(res.plan.settlementOut, 8_964_500n)
  }
})

test('stops (no chunk) when a valid adjusted chunk cannot be produced', () => {
  const noDue = planChunkAmounts({ ...order12, remainingDueOut: 0n })
  assert.deepEqual(noDue, { ok: false, reason: 'NO_REMAINING_DUE' })

  const overBudget = planChunkAmounts({ ...order12, remainingIn: 5n * USDC })
  assert.deepEqual(overBudget, { ok: false, reason: 'ADJUSTED_INPUT_EXCEEDS_REMAINING_BUDGET' })

  const overCap = planChunkAmounts({ ...order12, orderMaxChunk: 8n * USDC })
  assert.deepEqual(overCap, { ok: false, reason: 'ADJUSTED_INPUT_EXCEEDS_CHUNK_CAP' })

  const noQuote = planChunkAmounts({ ...order12, quoteIn: 0n, quoteOut: 0n, rate: 0 })
  assert.deepEqual(noQuote, { ok: false, reason: 'NO_USABLE_QUOTE' })
})

test('6-decimal quote outputs and rate-only fallback use the same integer rule', () => {
  const six = planChunkAmounts({ ...order12, decimalsOut: 6, quoteOut: 8_964_500n })
  assert.ok(six.ok)
  if (six.ok) assert.equal(six.plan.amountIn, 8_924_090n)

  const rateOnly = planChunkAmounts({ ...order12, quoteIn: 0n, quoteOut: 0n, rate: 0.9 })
  assert.ok(rateOnly.ok)
  if (rateOnly.ok) {
    assert.equal(rateOnly.plan.amountIn, 8_888_889n) // ceil(8e6 / 0.9)
    assert.equal(rateOnly.plan.settlementOut, 8_000_000n)
  }
})

test('without an on-chain ceiling the planned chunk is never reduced', () => {
  const res = planChunkAmounts({ ...order12, hasCeiling: false, remainingDueOut: 0n })
  assert.ok(res.ok)
  if (res.ok) assert.equal(res.plan.adjusted, false)
})

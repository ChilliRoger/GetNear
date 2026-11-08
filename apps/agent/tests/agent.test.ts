/**
 * GetNear Agent Runner — Comprehensive Unit Test Suite (P9)
 * Tests math helpers, quote ref hashing, simulated fills persistence, and locking.
 */

import { test, describe } from 'node:test'
import * as assert from 'node:assert/strict'
import { computeQuoteRef, computeSimulatedOutput } from '../src/runner.js'
import { recordFill, recordDecision, getRecentFills, getRecentDecisions } from '../src/db.js'

describe('Agent Helper Functions', () => {
  test('computeQuoteRef generates deterministic sha256 formatted references', () => {
    const ref1 = computeQuoteRef('quote-123', '20000000', '18400000', 1700000000)
    const ref2 = computeQuoteRef('quote-123', '20000000', '18400000', 1700000000)
    const ref3 = computeQuoteRef('quote-456', '20000000', '18400000', 1700000000)

    assert.ok(ref1.startsWith('sha256:'), 'Must start with sha256:')
    assert.equal(ref1, ref2, 'Identical inputs must yield identical hash')
    assert.notEqual(ref1, ref3, 'Different inputs must yield different hash')
  })

  test('computeSimulatedOutput accurately scales amountOut proportional to amountIn', () => {
    // 20 USDC in, quote is 100 USDC -> 92 EURe
    const amountIn = 20_000_000n
    const quoteIn = 100_000_000n
    const quoteOut = 92_000_000n
    const simOut = computeSimulatedOutput(amountIn, quoteIn, quoteOut)

    assert.equal(simOut, 18_400_000n, 'Expected 18.4 EURe output for 20 USDC input')

    // Zero edge case
    assert.equal(computeSimulatedOutput(0n, quoteIn, quoteOut), 0n)
    assert.equal(computeSimulatedOutput(amountIn, 0n, quoteOut), 0n)
  })
})

describe('Agent SQLite Persistence & Provenance', () => {
  test('persists simulated fills with is_simulated = true', () => {
    const testFill = {
      order_id: 9999,
      chunk_index: 1,
      amount_in: '20000000',
      simulated_out: '18400000',
      quote_ref: 'sha256:test-test-ref',
      deviation_bps: -20,
      tx_hash: 'TestTxHash123456789',
      explorer_url: 'https://testnet.nearblocks.io/txns/TestTxHash123456789',
      is_simulated: true,
      timestamp: Date.now(),
    }

    recordFill(testFill)
    const fills = getRecentFills(10)
    const saved = fills.find((f) => f.order_id === 9999)

    assert.ok(saved, 'Saved fill should be retrievable')
    assert.equal(saved.is_simulated, true, 'is_simulated must be true')
    assert.equal(saved.tx_hash, 'TestTxHash123456789')
    assert.equal(saved.amount_in, '20000000')
  })

  test('persists strategy decisions with reason', () => {
    const testDec = {
      order_id: 9999,
      timestamp: Date.now(),
      score: 85,
      decision: 'EXECUTE' as const,
      reason: 'CHUNK_EXECUTED: 20 USDC (-20 bps)',
      chunk_size: '20000000',
      quote_ref: 'sha256:test-test-ref',
      deviation_bps: -20,
    }

    recordDecision(testDec)
    const decisions = getRecentDecisions(10)
    const saved = decisions.find((d) => d.order_id === 9999)

    assert.ok(saved, 'Saved decision should be retrievable')
    assert.equal(saved.decision, 'EXECUTE')
    assert.equal(saved.score, 85)
  })
})

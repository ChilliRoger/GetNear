/**
 * GetNear Agent Runner — Unit Test Suite
 * Tests math helpers, quote ref hashing, SQLite persistence, failure provenance, and idempotency.
 */

import { test, describe, after } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// Isolate test persistence in a disposable temp SQLite DB so production data/agent.db is never polluted
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'getnear-agent-test-'))
const tempDbPath = path.join(tempDir, 'agent-test.db')
process.env.GETNEAR_AGENT_DB_PATH = tempDbPath

const { computeQuoteRef, computeSimulatedOutput, computeEuReAtomicOut } = await import('../src/runner.js')
const { db, recordFill, recordDecision, getRecentFills, getRecentDecisions, getOrderFillsCount } =
  await import('../src/db.js')

after(() => {
  try {
    db.close()
  } catch {}
  try {
    fs.rmSync(tempDir, { recursive: true, force: true })
  } catch {}
})

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
    const amountIn = 20_000_000n
    const quoteIn = 100_000_000n
    const quoteOut = 92_000_000n
    const simOut = computeSimulatedOutput(amountIn, quoteIn, quoteOut)

    assert.equal(simOut, 18_400_000n, 'Expected 18.4 EURe output for 20 USDC input')
    assert.equal(computeSimulatedOutput(0n, quoteIn, quoteOut), 0n)
    assert.equal(computeSimulatedOutput(amountIn, 0n, quoteOut), 0n)
  })

  test('computeEuReAtomicOut converts 18-decimal quote outputs into 6-decimal NEAR EURe units', () => {
    const chunkIn = 500_000_000n // 500 USDC
    const sim18 = 435_000_000_000_000_000_000n // 435.0 EURe at 18 decimals
    const eure6 = computeEuReAtomicOut(chunkIn, sim18, 18, 0.87)
    assert.equal(eure6, 435_000_000n, 'Must scale 18-dec simulation down to 6-dec atomic EURe')
  })
})

describe('Agent SQLite Persistence & Settlement Truth', () => {
  test('persists simulated fills with is_simulated = true', () => {
    recordFill({
      order_id: 9999,
      chunk_index: 1,
      idempotency_key: 'order-9999-seq-1',
      amount_in: '20000000',
      settlement_out: '18400000',
      simulated_out: '18400000',
      recipient: 'supplier.testnet',
      quote_ref: 'sha256:test-test-ref',
      deviation_bps: -20,
      tx_hash: 'TestTxHash123456789',
      explorer_url: 'https://testnet.nearblocks.io/txns/TestTxHash123456789',
      settlement_status: 'SIMULATED',
      is_simulated: true,
      timestamp: Date.now(),
    })

    const saved = getRecentFills(10).find((f) => f.order_id === 9999)
    assert.ok(saved, 'Saved fill should be retrievable')
    assert.equal(saved.is_simulated, true)
    assert.equal(saved.settlement_status, 'SIMULATED')
  })

  test('persists CONFIRMED NEP-141 token settlements with on-chain proof', () => {
    recordFill({
      order_id: 8888,
      chunk_index: 1,
      idempotency_key: 'order-8888-seq-1',
      amount_in: '500000000',
      settlement_out: '435000000',
      simulated_out: '435000000000000000000',
      recipient: 'supplier-eu.testnet',
      quote_ref: 'sha256:real-nep141-ref',
      deviation_bps: 10,
      tx_hash: 'ExecuteChunkTxHash111',
      explorer_url: 'https://testnet.nearblocks.io/txns/ExecuteChunkTxHash111',
      ft_transfer_tx_hash: 'ExecuteChunkTxHash111',
      ft_transfer_url: 'https://testnet.nearblocks.io/txns/ExecuteChunkTxHash111',
      settlement_status: 'CONFIRMED',
      is_simulated: false,
      timestamp: Date.now(),
    })

    const saved = getRecentFills(10).find((f) => f.order_id === 8888)
    assert.ok(saved)
    assert.equal(saved.is_simulated, false)
    assert.equal(saved.settlement_status, 'CONFIRMED')
    assert.equal(saved.settlement_out, '435000000')
    assert.equal(saved.ft_transfer_tx_hash, 'ExecuteChunkTxHash111')
  })

  test('forces is_simulated = true when settlement FAILED even if caller attempts is_simulated: false', () => {
    recordFill({
      order_id: 8888,
      chunk_index: 2,
      idempotency_key: 'order-8888-seq-2',
      amount_in: '500000000',
      settlement_out: '435000000',
      simulated_out: '435000000000000000000',
      recipient: 'supplier-eu.testnet',
      quote_ref: 'sha256:failed-transfer-ref',
      deviation_bps: -5,
      tx_hash: 'OuterTxHashButFtFailed',
      explorer_url: 'https://testnet.nearblocks.io/txns/OuterTxHashButFtFailed',
      settlement_status: 'FAILED',
      failure_reason: 'ft_transfer PromiseResult failed: insufficient vault balance',
      is_simulated: false, // Must be rejected by persistence invariant
      timestamp: Date.now() + 10,
    })

    const saved = getRecentFills(10).find((f) => f.idempotency_key === 'order-8888-seq-2')
    assert.ok(saved)
    assert.equal(saved.settlement_status, 'FAILED')
    assert.equal(saved.is_simulated, true, 'FAILED settlement must NEVER be marked is_simulated=false')
    assert.match(saved.failure_reason || '', /PromiseResult failed/)
    // Failed chunks must not inflate order fill count
    assert.equal(getOrderFillsCount(8888), 1)
  })

  test('upserts by idempotency_key when retrying a failed chunk without duplicating rows', () => {
    recordFill({
      order_id: 8888,
      chunk_index: 2,
      idempotency_key: 'order-8888-seq-2',
      amount_in: '500000000',
      settlement_out: '435000000',
      simulated_out: '435000000000000000000',
      recipient: 'supplier-eu.testnet',
      quote_ref: 'sha256:retry-success-ref',
      deviation_bps: 0,
      tx_hash: 'RetryTxHashSuccess',
      explorer_url: 'https://testnet.nearblocks.io/txns/RetryTxHashSuccess',
      ft_transfer_tx_hash: 'RetryTxHashSuccess',
      ft_transfer_url: 'https://testnet.nearblocks.io/txns/RetryTxHashSuccess',
      settlement_status: 'CONFIRMED',
      is_simulated: false,
      timestamp: Date.now() + 20,
    })

    const matches = getRecentFills(20).filter((f) => f.idempotency_key === 'order-8888-seq-2')
    assert.equal(matches.length, 1, 'Retry must update existing idempotency row without duplication')
    assert.equal(matches[0].settlement_status, 'CONFIRMED')
    assert.equal(matches[0].is_simulated, false)
    assert.equal(getOrderFillsCount(8888), 2)
  })

  test('persists strategy and settlement failure decisions with reason', () => {
    recordDecision({
      order_id: 9999,
      timestamp: Date.now(),
      score: 85,
      decision: 'SETTLEMENT_FAILED_BALANCE_UNCHANGED',
      reason: 'Cross-contract ft_transfer failed; supplier remaining due unchanged',
      chunk_size: '500000000',
      quote_ref: 'sha256:test-test-ref',
      deviation_bps: -20,
    })

    const saved = getRecentDecisions(10).find((d) => d.order_id === 9999)
    assert.ok(saved)
    assert.equal(saved.decision, 'SETTLEMENT_FAILED_BALANCE_UNCHANGED')
    assert.equal(saved.score, 85)
  })
})


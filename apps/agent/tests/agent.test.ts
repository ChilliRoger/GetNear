/**
 * GetNear Agent Runner — Unit Test Suite
 * Tests math helpers, quote ref hashing, SQLite persistence, failure provenance, and idempotency.
 */

import { test, describe, after } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'

// Isolate test persistence in a disposable temp SQLite DB so production data/agent.db is never polluted
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'getnear-agent-test-'))
const tempDbPath = path.join(tempDir, 'agent-test.db')
process.env.GETNEAR_AGENT_DB_PATH = tempDbPath

const { AgentRunner, computeQuoteRef, computeSimulatedOutput, computeEuReAtomicOut } = await import(
  '../src/runner.js'
)
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

describe('AgentRunner Dynamic HTTP JSON-RPC Reconciliation', () => {
  interface RpcState {
    orders: any[]
    chunks: Map<string, any>
    onGetChunk?: (key: string, current: any, callCount: number) => any
    getChunkCalls: Map<string, number>
  }

  async function startRpcServer(state: RpcState): Promise<{ url: string; close: () => Promise<void> }> {
    const server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))

      if (body.method === 'query' && body.params?.request_type === 'call_function') {
        const methodName = body.params.method_name as string
        const args = body.params.args_base64
          ? JSON.parse(Buffer.from(body.params.args_base64, 'base64').toString('utf8'))
          : {}

        let value: unknown = null
        if (methodName === 'is_paused') {
          value = false
        } else if (methodName === 'get_limits') {
          value = {
            auto_cap_in: '100000000',
            max_chunk_in: '20000000',
            min_interval_ns: 60_000_000_000,
            max_horizon_ns: 86_400_000_000_000,
          }
        } else if (methodName === 'list_orders') {
          value = state.orders
        } else if (methodName === 'get_chunk_record') {
          const count = (state.getChunkCalls.get(args.key) ?? 0) + 1
          state.getChunkCalls.set(args.key, count)
          const cur = state.chunks.get(args.key) ?? null
          value = state.onGetChunk ? state.onGetChunk(args.key, cur, count) : cur
        } else if (methodName === 'list_order_chunks') {
          value = Array.from(state.chunks.values()).filter((c) => c.order_id === args.order_id)
        }

        const encoded = Array.from(Buffer.from(JSON.stringify(value), 'utf8'))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { result: encoded, logs: [] } }))
        return
      }

      res.writeHead(404)
      res.end()
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address() as { port: number }
    return {
      url: `http://127.0.0.1:${addr.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
    }
  }

  const fixedQuoteSource = {
    getQuote: async () => ({
      quoteId: 'live-dry-reconcile',
      fromToken: 'USDC',
      toToken: 'EURE',
      amountIn: '10000000',
      amountOut: '8700000000000000000',
      decimalsOut: 18,
      rate: 0.87,
      timestamp: Date.now(),
      isDry: true as const,
      isMock: false,
      raw: {},
    }),
  }

  const fixedRefRateSource = {
    getReferenceRate: async () => ({
      pair: 'USD/EUR',
      rate: 0.87,
      date: '2026-11-12',
      source: 'frankfurter' as const,
    }),
  }

  test('score strategy: a fresh order far from its deadline WAITs (no broadcast) with the score logged', async () => {
    const farNs = (Date.now() + 4 * 3600 * 1000) * 1_000_000
    const state: RpcState = {
      orders: [
        {
          id: 702,
          requester: 'operator.testnet',
          recipient: 'supplier-eu.testnet',
          invoice_ref: 'INV-702',
          pair_label: 'USD/EUR',
          total_in: '10000000',
          executed_in: '0',
          pending_in: '0',
          target_out: '8700000',
          settled_out: '0',
          pending_out: '0',
          max_chunk_in: '10000000',
          deadline_ns: farNs,
          max_dev_bps: 100,
          status: 'Active',
          last_chunk_ns: 0,
          chunks_count: 0,
        },
      ],
      chunks: new Map(),
      getChunkCalls: new Map(),
    }
    const rpc = await startRpcServer(state)
    let broadcastCount = 0
    try {
      const runner = new AgentRunner({
        strategyMode: 'score',
        rpcUrls: [rpc.url],
        quoteSource: fixedQuoteSource,
        refRateSource: fixedRefRateSource,
        resolveCredentialPath: async () => '/tmp/fake-agent-key.json',
        executeChunkCall: () => {
          broadcastCount++
          return { txHash: 'x' }
        },
      })
      await runner.tick()
      assert.equal(broadcastCount, 0, 'Low timing score + low urgency must not execute yet')
      const waits = getRecentDecisions(50).filter((d) => d.order_id === 702)
      assert.ok(waits.some((d) => d.decision === 'WAIT' && d.reason.startsWith('STRATEGY_WAIT')))
    } finally {
      await rpc.close()
    }
  })

  test('Case A: uncertain RPC timeout after on-chain Settled reconciles without re-broadcast', async () => {
    const nowNs = (Date.now() + 300_000) * 1_000_000
    const state: RpcState = {
      orders: [
        {
          id: 701,
          requester: 'operator.testnet',
          recipient: 'supplier-eu.testnet',
          invoice_ref: 'INV-701',
          pair_label: 'USD/EUR',
          total_in: '10000000',
          executed_in: '0',
          pending_in: '0',
          target_out: '8700000',
          settled_out: '0',
          pending_out: '0',
          max_chunk_in: '10000000',
          deadline_ns: nowNs,
          max_dev_bps: 100,
          status: 'Active',
          last_chunk_ns: 0,
          chunks_count: 0,
        },
      ],
      chunks: new Map(),
      getChunkCalls: new Map(),
    }

    const rpc = await startRpcServer(state)
    let broadcastCount = 0
    try {
      const runner = new AgentRunner({
        strategyMode: 'immediate',
        rpcUrls: [rpc.url],
        quoteSource: fixedQuoteSource,
        refRateSource: fixedRefRateSource,
        resolveCredentialPath: async () => '/tmp/fake-agent-key.json',
        executeChunkCall: (opts) => {
          broadcastCount++
          const args = opts.args as Record<string, any>
          state.chunks.set(args.idempotency_key, {
            key: args.idempotency_key,
            order_id: args.id,
            amount_in: args.amount_in,
            settlement_out: args.settlement_out,
            simulated_out: args.simulated_out,
            recipient: 'supplier-eu.testnet',
            quote_ref: args.quote_ref,
            deviation_bps: args.deviation_bps,
            status: 'Settled',
            attempts: 1,
            initiated_ns: Date.now() * 1_000_000,
            settled_ns: Date.now() * 1_000_000,
            failure_reason: null,
          })
          throw new Error('ETIMEDOUT: RPC gateway closed socket before returning txHash')
        },
      })

      await runner.tick()

      assert.equal(broadcastCount, 1, 'Must NOT retry broadcast once on-chain record is Settled')
      const saved = getRecentFills(20).find((f) => f.idempotency_key === 'order-701-seq-1')
      assert.ok(saved, 'Reconciled fill must be persisted')
      assert.equal(saved.settlement_status, 'CONFIRMED')
      assert.equal(saved.is_simulated, false)
      assert.equal(saved.settlement_out, '8700000')
    } finally {
      await rpc.close()
    }
  })

  test('Case B: uncertain RPC drop while chunk is InFlight polls to Settled with single broadcast', async () => {
    const nowNs = (Date.now() + 300_000) * 1_000_000
    const state: RpcState = {
      orders: [
        {
          id: 702,
          requester: 'operator.testnet',
          recipient: 'supplier-eu.testnet',
          invoice_ref: 'INV-702',
          pair_label: 'USD/EUR',
          total_in: '10000000',
          executed_in: '0',
          pending_in: '0',
          target_out: '8700000',
          settled_out: '0',
          pending_out: '0',
          max_chunk_in: '10000000',
          deadline_ns: nowNs,
          max_dev_bps: 100,
          status: 'Active',
          last_chunk_ns: 0,
          chunks_count: 0,
        },
      ],
      chunks: new Map(),
      getChunkCalls: new Map(),
      onGetChunk: (key, current, callCount) => {
        if (!current) return null
        // Call 1 (pre-check) never reached if missing; Call 1 (catch) & Call 2 (poll 1) -> InFlight; Call 3+ -> Settled
        if (callCount >= 3 && current.status === 'InFlight') {
          const settled = { ...current, status: 'Settled', settled_ns: Date.now() * 1_000_000 }
          state.chunks.set(key, settled)
          return settled
        }
        return current
      },
    }

    const rpc = await startRpcServer(state)
    let broadcastCount = 0
    try {
      const runner = new AgentRunner({
        strategyMode: 'immediate',
        rpcUrls: [rpc.url],
        quoteSource: fixedQuoteSource,
        refRateSource: fixedRefRateSource,
        resolveCredentialPath: async () => '/tmp/fake-agent-key.json',
        executeChunkCall: (opts) => {
          broadcastCount++
          const args = opts.args as Record<string, any>
          state.chunks.set(args.idempotency_key, {
            key: args.idempotency_key,
            order_id: args.id,
            amount_in: args.amount_in,
            settlement_out: args.settlement_out,
            simulated_out: args.simulated_out,
            recipient: 'supplier-eu.testnet',
            quote_ref: args.quote_ref,
            deviation_bps: args.deviation_bps,
            status: 'InFlight',
            attempts: 1,
            initiated_ns: Date.now() * 1_000_000,
            settled_ns: 0,
            failure_reason: null,
          })
          throw new Error('ECONNRESET: uncertain transport failure')
        },
      })

      await runner.tick()

      assert.equal(broadcastCount, 1, 'Must poll InFlight callback instead of re-sending execute_chunk')
      const saved = getRecentFills(20).find((f) => f.idempotency_key === 'order-702-seq-1')
      assert.ok(saved)
      assert.equal(saved.settlement_status, 'CONFIRMED')
      assert.equal(saved.is_simulated, false)
    } finally {
      await rpc.close()
    }
  })

  test('Case C: order locked with pending_in reconciles InFlight->Settled via list_order_chunks without broadcast', async () => {
    const nowNs = (Date.now() + 300_000) * 1_000_000
    const state: RpcState = {
      orders: [
        {
          id: 703,
          requester: 'operator.testnet',
          recipient: 'supplier-eu.testnet',
          invoice_ref: 'INV-703',
          pair_label: 'USD/EUR',
          total_in: '20000000',
          executed_in: '0',
          pending_in: '10000000',
          target_out: '17400000',
          settled_out: '0',
          pending_out: '8700000',
          max_chunk_in: '10000000',
          deadline_ns: nowNs,
          max_dev_bps: 100,
          status: 'Active',
          last_chunk_ns: 0,
          chunks_count: 0,
        },
      ],
      chunks: new Map([
        [
          'order-703-seq-1',
          {
            key: 'order-703-seq-1',
            order_id: 703,
            amount_in: '10000000',
            settlement_out: '8700000',
            simulated_out: '8700000000000000000',
            recipient: 'supplier-eu.testnet',
            quote_ref: 'sha256:pending-reconcile',
            deviation_bps: 0,
            status: 'InFlight',
            attempts: 1,
            initiated_ns: Date.now() * 1_000_000,
            settled_ns: 0,
            failure_reason: null,
          },
        ],
      ]),
      getChunkCalls: new Map(),
      onGetChunk: (key, current, callCount) => {
        if (current && callCount >= 2) {
          const settled = { ...current, status: 'Settled', settled_ns: Date.now() * 1_000_000 }
          state.chunks.set(key, settled)
          return settled
        }
        return current
      },
    }

    const rpc = await startRpcServer(state)
    let broadcastCount = 0
    try {
      const runner = new AgentRunner({
        strategyMode: 'immediate',
        rpcUrls: [rpc.url],
        quoteSource: fixedQuoteSource,
        refRateSource: fixedRefRateSource,
        resolveCredentialPath: async () => '/tmp/fake-agent-key.json',
        executeChunkCall: () => {
          broadcastCount++
          throw new Error('Should not broadcast while pending_in > 0')
        },
      })

      await runner.tick()

      assert.equal(broadcastCount, 0)
      const saved = getRecentFills(20).find((f) => f.idempotency_key === 'order-703-seq-1')
      assert.ok(saved)
      assert.equal(saved.settlement_status, 'CONFIRMED')
      assert.equal(saved.is_simulated, false)
    } finally {
      await rpc.close()
    }
  })
})


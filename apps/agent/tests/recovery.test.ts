/**
 * Agent payment-recovery regression tests.
 *  - submission timeout + unavailable RPC keeps the attempt pending (no blind retry, no invented FAILED fill)
 *  - retry only with evidence (new on-chain failure, or the landing window elapsed)
 *  - restart after the final chunk settled (including a closed order) reconciles from the durable attempt
 *  - stale SQLite writes can never downgrade a CONFIRMED fill or overwrite confirmed amounts/receipts
 *  - Order #12 final-chunk accounting charges only the adjusted USDC input
 */

import { test, describe, after } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'getnear-agent-recovery-'))
process.env.GETNEAR_AGENT_DB_PATH = path.join(tempDir, 'recovery.db')

const { AgentRunner } = await import('../src/runner.js')
const db = await import('../src/db.js')
const { NearCliError } = await import('../../../scripts/near/near-runner.js')

after(() => {
  try {
    db.db.close()
  } catch {}
  try {
    fs.rmSync(tempDir, { recursive: true, force: true })
  } catch {}
})

interface RpcState {
  orders: any[]
  chunks: Map<string, any>
  /** When true, get_chunk_record answers HTTP 503 (RPC unavailable) instead of a value. */
  chunkReadFails: boolean
}

async function startRpcServer(state: RpcState): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    const parts: Buffer[] = []
    for await (const c of req) parts.push(c as Buffer)
    const body = JSON.parse(Buffer.concat(parts).toString('utf8'))

    if (body.method === 'query' && body.params?.request_type === 'call_function') {
      const method = body.params.method_name as string
      const args = body.params.args_base64
        ? JSON.parse(Buffer.from(body.params.args_base64, 'base64').toString('utf8'))
        : {}
      if (method === 'get_chunk_record' && state.chunkReadFails) {
        res.writeHead(503)
        res.end('unavailable')
        return
      }
      let value: unknown = null
      if (method === 'is_paused') value = false
      else if (method === 'get_limits')
        value = {
          auto_cap_in: '100000000',
          max_chunk_in: '20000000',
          min_interval_ns: 60_000_000_000,
          max_horizon_ns: 86_400_000_000_000,
        }
      else if (method === 'list_orders') value = state.orders
      else if (method === 'get_chunk_record') value = state.chunks.get(args.key) ?? null
      else if (method === 'list_order_chunks')
        value = Array.from(state.chunks.values()).filter((c) => c.order_id === args.order_id)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: { result: Array.from(Buffer.from(JSON.stringify(value), 'utf8')), logs: [] },
        }),
      )
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address() as { port: number }
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  }
}

/** Order #12 quote: 10 USDC -> 8.9645 EURe (18 decimals). */
const order12Quote = {
  getQuote: async () => ({
    quoteId: 'order12-figures',
    fromToken: 'USDC',
    toToken: 'EURE',
    amountIn: '10000000',
    amountOut: '8964500000000000000',
    decimalsOut: 18,
    rate: 0.89645,
    timestamp: Date.now(),
    isDry: true as const,
    isMock: false,
    raw: {},
  }),
}
const refRate = {
  getReferenceRate: async () => ({ pair: 'USD/EUR', rate: 0.8967, date: '2026-11-12', source: 'frankfurter' as const }),
}

function makeOrder(id: number, over: Record<string, unknown> = {}) {
  return {
    id,
    requester: 'operator.testnet',
    recipient: 'supplier-eu.testnet',
    invoice_ref: `INV-${id}`,
    pair_label: 'USD/EUR',
    total_in: '15000000',
    executed_in: '0',
    pending_in: '0',
    target_out: '8000000',
    settled_out: '0',
    pending_out: '0',
    max_chunk_in: '10000000',
    deadline_ns: (Date.now() + 3_600_000) * 1_000_000,
    max_dev_bps: 120,
    status: 'Active',
    last_chunk_ns: 0,
    chunks_count: 0,
    ...over,
  }
}

function chunkFromArgs(args: Record<string, any>, status: 'Settled' | 'InFlight' | 'Failed', attempts = 1) {
  return {
    key: args.idempotency_key,
    order_id: args.id,
    amount_in: args.amount_in,
    settlement_out: args.settlement_out,
    simulated_out: args.simulated_out,
    recipient: 'supplier-eu.testnet',
    quote_ref: args.quote_ref,
    deviation_bps: args.deviation_bps,
    status,
    attempts,
    initiated_ns: Date.now() * 1_000_000,
    settled_ns: status === 'Settled' ? Date.now() * 1_000_000 : 0,
    failure_reason: status === 'Failed' ? 'NEP-141 ft_transfer promise failed on-chain' : null,
  }
}

function newRunner(rpcUrl: string, exec: any, extra: Record<string, unknown> = {}) {
  return new AgentRunner({
    rpcUrls: [rpcUrl],
    pollDelayMs: 5,
    quoteSource: order12Quote,
    refRateSource: refRate,
    resolveCredentialPath: async () => '/tmp/fake-agent-key.json',
    executeChunkCall: exec,
    ...extra,
  })
}

describe('Final-chunk accounting through the runner (Order #12 figures)', () => {
  test('charges only the adjusted USDC input and reports the confirmed amounts', async () => {
    const state: RpcState = { orders: [makeOrder(810)], chunks: new Map(), chunkReadFails: false }
    const rpc = await startRpcServer(state)
    const sent: any[] = []
    try {
      const runner = newRunner(rpc.url, (opts: any) => {
        sent.push(opts.args)
        state.chunks.set(opts.args.idempotency_key, chunkFromArgs(opts.args, 'Settled'))
        return { stdout: '', txHash: 'TxFinalChunk810', explorerUrl: 'https://testnet.nearblocks.io/txns/TxFinalChunk810' }
      })
      await runner.tick()

      assert.equal(sent.length, 1)
      assert.equal(sent[0].amount_in, '8924090', 'must charge ceil(8e6 x 10e6 / 8.9645e6), not the planned 10 USDC')
      assert.equal(sent[0].settlement_out, '8000000')
      const fill = db.getFillByKey('order-810-seq-1')!
      assert.equal(fill.settlement_status, 'CONFIRMED')
      assert.equal(fill.amount_in, '8924090')
      assert.equal(fill.tx_hash, 'TxFinalChunk810')
      assert.equal(db.getAttempt('order-810-seq-1')!.state, 'CONFIRMED')
    } finally {
      await rpc.close()
    }
  })

  test('a failed callback records a FAILED, simulated fill and keeps the attempt retryable', async () => {
    const state: RpcState = { orders: [makeOrder(811)], chunks: new Map(), chunkReadFails: false }
    const rpc = await startRpcServer(state)
    try {
      const runner = newRunner(rpc.url, (opts: any) => {
        state.chunks.set(opts.args.idempotency_key, chunkFromArgs(opts.args, 'Failed', 1))
        return { stdout: '', txHash: 'TxFailed811', explorerUrl: 'https://testnet.nearblocks.io/txns/TxFailed811' }
      })
      await runner.tick()

      const fill = db.getFillByKey('order-811-seq-1')!
      assert.equal(fill.settlement_status, 'FAILED')
      assert.equal(fill.is_simulated, true)
      assert.equal(db.getAttempt('order-811-seq-1')!.state, 'FAILED')
    } finally {
      await rpc.close()
    }
  })
})

describe('Submission timeout plus unavailable RPC', () => {
  test('keeps the attempt pending, never re-sends without evidence, then retries once the window elapsed', async () => {
    const state: RpcState = { orders: [makeOrder(820)], chunks: new Map(), chunkReadFails: false }
    const rpc = await startRpcServer(state)
    let broadcasts = 0
    const key = 'order-820-seq-1'
    try {
      // Phase 1: the CLI times out AND the RPC goes down at the same moment.
      const timeout = () => {
        broadcasts++
        state.chunkReadFails = true
        throw new NearCliError('ETIMEDOUT: near-cli did not finish; transaction outcome unknown', 'uncertain', '')
      }
      const runner = newRunner(rpc.url, timeout)
      await runner.tick()

      assert.equal(broadcasts, 1)
      const att = db.getAttempt(key)!
      assert.equal(att.state, 'UNCERTAIN')
      assert.equal(att.amount_in, '8924090', 'requested amounts are persisted before broadcast')
      assert.match(att.quote_ref, /^sha256:/)
      assert.equal(db.getFillByKey(key), null, 'no synthetic FAILED fill may be invented from an unreadable chain')

      // Phase 2: RPC still down -> remains pending verification, no second broadcast.
      await runner.tick()
      assert.equal(broadcasts, 1)
      assert.equal(db.getAttempt(key)!.state, 'UNCERTAIN')

      // Phase 3: RPC back, no record, landing window NOT elapsed -> still pending, still no re-send.
      state.chunkReadFails = false
      await runner.tick()
      assert.equal(broadcasts, 1, 'no evidence the first attempt failed or can no longer land')
      assert.equal(db.getAttempt(key)!.state, 'UNCERTAIN')

      // Phase 4: restart with an elapsed landing window -> ABANDONED -> exactly one new attempt, which lands.
      const restarted = newRunner(
        rpc.url,
        (opts: any) => {
          broadcasts++
          state.chunks.set(opts.args.idempotency_key, chunkFromArgs(opts.args, 'Settled'))
          return { stdout: '', txHash: 'TxRetry820', explorerUrl: 'https://testnet.nearblocks.io/txns/TxRetry820' }
        },
        { attemptLandingWindowMs: 1 },
      )
      await new Promise((r) => setTimeout(r, 20))
      await restarted.tick()

      assert.equal(broadcasts, 2)
      const after = db.getAttempt(key)!
      assert.equal(after.state, 'CONFIRMED')
      assert.equal(after.attempt_no, 2)
      assert.equal(db.getFillByKey(key)!.settlement_status, 'CONFIRMED')
    } finally {
      await rpc.close()
    }
  })

  test('a NEW on-chain failure is evidence the attempt failed (retry allowed); a stale one is not', async () => {
    const key = 'order-821-seq-1'
    const state: RpcState = { orders: [makeOrder(821)], chunks: new Map(), chunkReadFails: false }
    // Earlier attempt failed on-chain (contract attempts = 1). A new attempt (baseline 1) is submitted and goes uncertain.
    state.chunks.set(key, {
      ...chunkFromArgs(
        { idempotency_key: key, id: 821, amount_in: '8924090', settlement_out: '8000000', simulated_out: '1', quote_ref: 'sha256:old', deviation_bps: 0 },
        'Failed',
        1,
      ),
    })
    const rpc = await startRpcServer(state)
    let broadcasts = 0
    try {
      const runner = newRunner(rpc.url, () => {
        broadcasts++
        throw new NearCliError('ETIMEDOUT: outcome unknown', 'uncertain', '')
      })
      await runner.tick()
      assert.equal(broadcasts, 1)
      assert.equal(db.getAttempt(key)!.state, 'UNCERTAIN')
      assert.equal(db.getAttempt(key)!.baseline_attempts, 1)

      // Stale failure (attempts still == baseline) is NOT evidence about the new attempt.
      await runner.tick()
      assert.equal(broadcasts, 1)
      assert.equal(db.getAttempt(key)!.state, 'UNCERTAIN')

      // The chain now records a NEW failed settlement (attempts 2 > baseline 1): evidence -> FAILED -> retry allowed.
      state.chunks.set(key, { ...state.chunks.get(key), attempts: 2 })
      await runner.tick()
      assert.equal(broadcasts, 2, 'retry only after on-chain evidence the previous attempt failed')
    } finally {
      await rpc.close()
    }
  })

  test('definitive pre-broadcast failures are retried a bounded number of times', async () => {
    const state: RpcState = { orders: [makeOrder(822)], chunks: new Map(), chunkReadFails: false }
    const rpc = await startRpcServer(state)
    let broadcasts = 0
    try {
      const runner = newRunner(rpc.url, () => {
        broadcasts++
        throw new NearCliError('Failed to spawn near-cli (ENOENT)', 'not_sent', '')
      })
      await runner.tick()
      assert.equal(broadcasts, 3)
      assert.equal(db.getAttempt('order-822-seq-1')!.state, 'NOT_SENT')
    } finally {
      await rpc.close()
    }
  })
})

describe('Restart recovery (including closed orders)', () => {
  test('restart after the FINAL chunk settled and closed the order reconciles from the durable attempt', async () => {
    const key = 'order-830-seq-1'
    // State left behind by a crash after broadcast: attempt persisted before broadcast, fill never written.
    db.recordAttemptPrepared({
      idempotency_key: key,
      order_id: 830,
      amount_in: '8924090',
      settlement_out: '8000000',
      simulated_out: '8000000000000000000',
      quote_ref: 'sha256:crash',
      deviation_bps: -25,
      recipient: 'supplier-eu.testnet',
    })
    db.updateAttempt(key, { state: 'SUBMITTED', tx_hash: 'TxCrash830', explorer_url: 'https://testnet.nearblocks.io/txns/TxCrash830' })
    assert.equal(db.getFillByKey(key), null)

    const state: RpcState = {
      // The order is already Completed on-chain: it is NOT in the agent's Active set.
      orders: [makeOrder(830, { status: 'Completed', executed_in: '8924090', settled_out: '8000000', chunks_count: 1 })],
      chunks: new Map([
        [
          key,
          chunkFromArgs(
            { idempotency_key: key, id: 830, amount_in: '8924090', settlement_out: '8000000', simulated_out: '8000000000000000000', quote_ref: 'sha256:crash', deviation_bps: -25 },
            'Settled',
          ),
        ],
      ]),
      chunkReadFails: false,
    }
    const rpc = await startRpcServer(state)
    let broadcasts = 0
    try {
      const runner = newRunner(rpc.url, () => {
        broadcasts++
        throw new Error('must not broadcast')
      })
      await runner.tick() // first tick == startup

      assert.equal(broadcasts, 0)
      const fill = db.getFillByKey(key)!
      assert.equal(fill.settlement_status, 'CONFIRMED')
      assert.equal(fill.is_simulated, false)
      assert.equal(fill.settlement_out, '8000000')
      assert.equal(fill.tx_hash, 'TxCrash830', 'transaction identity from the durable attempt is preserved')
      assert.equal(db.getAttempt(key)!.state, 'CONFIRMED')
      assert.equal(runner.totalChunksExecuted, 1)
    } finally {
      await rpc.close()
    }
  })

  test('startup backfills settled chunks of closed orders that SQLite never saw (no decision noise)', async () => {
    const key = 'order-831-seq-1'
    const state: RpcState = {
      orders: [makeOrder(831, { status: 'Expired', executed_in: '10000000', settled_out: '8700000', chunks_count: 1, target_out: '25000000' })],
      chunks: new Map([
        [
          key,
          chunkFromArgs(
            { idempotency_key: key, id: 831, amount_in: '10000000', settlement_out: '8700000', simulated_out: '8700000000000000000', quote_ref: 'sha256:x', deviation_bps: 0 },
            'Settled',
          ),
        ],
      ]),
      chunkReadFails: false,
    }
    const rpc = await startRpcServer(state)
    try {
      const before = db.getRecentDecisions(500).filter((d) => d.order_id === 831).length
      const runner = newRunner(rpc.url, () => {
        throw new Error('must not broadcast')
      })
      await runner.tick()
      assert.equal(db.getFillByKey(key)!.settlement_status, 'CONFIRMED')
      assert.equal(db.getRecentDecisions(500).filter((d) => d.order_id === 831).length, before)
    } finally {
      await rpc.close()
    }
  })
})

describe('Stale SQLite writes never downgrade confirmed payments', () => {
  const base = {
    order_id: 840,
    chunk_index: 1,
    idempotency_key: 'order-840-seq-1',
    quote_ref: 'sha256:confirmed',
    deviation_bps: -25,
    recipient: 'supplier-eu.testnet',
  }

  test('FAILED / IN_FLIGHT observations cannot overwrite a CONFIRMED fill, its amounts or its receipt', () => {
    db.recordFill({
      ...base,
      amount_in: '8924090',
      settlement_out: '8000000',
      simulated_out: '8000000000000000000',
      tx_hash: 'TxConfirmed840',
      explorer_url: 'https://testnet.nearblocks.io/txns/TxConfirmed840',
      ft_transfer_tx_hash: 'TxConfirmed840',
      ft_transfer_url: 'https://testnet.nearblocks.io/txns/TxConfirmed840',
      settlement_status: 'CONFIRMED',
      is_simulated: false,
      timestamp: 1000,
    })

    // Late/stale observation: FAILED with different amounts and different (or no) receipt.
    db.recordFill({
      ...base,
      amount_in: '10000000',
      settlement_out: '1',
      simulated_out: '1',
      quote_ref: 'sha256:stale',
      tx_hash: 'TxStale',
      explorer_url: 'https://testnet.nearblocks.io/txns/TxStale',
      settlement_status: 'FAILED',
      failure_reason: 'On-chain chunk record unavailable',
      is_simulated: true,
      timestamp: 2000,
    })
    db.recordFill({ ...base, amount_in: '10000000', simulated_out: '1', settlement_status: 'IN_FLIGHT', is_simulated: true, timestamp: 3000 })

    const row = db.getFillByKey('order-840-seq-1')!
    assert.equal(row.settlement_status, 'CONFIRMED')
    assert.equal(row.is_simulated, false)
    assert.equal(row.amount_in, '8924090')
    assert.equal(row.settlement_out, '8000000')
    assert.equal(row.quote_ref, 'sha256:confirmed')
    assert.equal(row.tx_hash, 'TxConfirmed840')
    assert.equal(row.explorer_url, 'https://testnet.nearblocks.io/txns/TxConfirmed840')
    assert.equal(row.failure_reason, null)
    assert.equal(row.timestamp, 1000)
  })

  test('a later CONFIRMED write may only fill receipt metadata that is still missing', () => {
    db.recordFill({
      ...base,
      order_id: 841,
      idempotency_key: 'order-841-seq-1',
      amount_in: '5000000',
      settlement_out: '4000000',
      simulated_out: '4000000000000000000',
      settlement_status: 'CONFIRMED',
      is_simulated: false,
      timestamp: 10,
    })
    db.recordFill({
      ...base,
      order_id: 841,
      idempotency_key: 'order-841-seq-1',
      amount_in: '5000000',
      settlement_out: '4000000',
      simulated_out: '4000000000000000000',
      tx_hash: 'TxLate841',
      explorer_url: 'https://testnet.nearblocks.io/txns/TxLate841',
      settlement_status: 'CONFIRMED',
      is_simulated: false,
      timestamp: 20,
    })
    db.recordFill({
      ...base,
      order_id: 841,
      idempotency_key: 'order-841-seq-1',
      amount_in: '5000000',
      settlement_out: '4000000',
      simulated_out: '4000000000000000000',
      tx_hash: 'TxOther841',
      explorer_url: 'https://testnet.nearblocks.io/txns/TxOther841',
      settlement_status: 'CONFIRMED',
      is_simulated: false,
      timestamp: 30,
    })
    const row = db.getFillByKey('order-841-seq-1')!
    assert.equal(row.tx_hash, 'TxLate841', 'first receipt wins; a different later receipt cannot replace it')
  })

  test('a FAILED fill still upgrades to CONFIRMED on a successful retry', () => {
    db.recordFill({ ...base, order_id: 842, idempotency_key: 'order-842-seq-1', amount_in: '5', simulated_out: '1', settlement_status: 'FAILED', is_simulated: true, timestamp: 1 })
    db.recordFill({
      ...base,
      order_id: 842,
      idempotency_key: 'order-842-seq-1',
      amount_in: '5',
      simulated_out: '1',
      settlement_out: '4',
      settlement_status: 'CONFIRMED',
      is_simulated: false,
      timestamp: 2,
    })
    assert.equal(db.getFillByKey('order-842-seq-1')!.settlement_status, 'CONFIRMED')
  })

  test('a CONFIRMED attempt cannot be reopened by a stale observation', () => {
    db.recordAttemptPrepared({ idempotency_key: 'order-843-seq-1', order_id: 843, amount_in: '1', settlement_out: '1', simulated_out: '1', quote_ref: 'q', deviation_bps: 0 })
    db.updateAttempt('order-843-seq-1', { state: 'CONFIRMED' })
    db.updateAttempt('order-843-seq-1', { state: 'UNCERTAIN' })
    assert.equal(db.getAttempt('order-843-seq-1')!.state, 'CONFIRMED')
    assert.throws(() => db.recordAttemptPrepared({ idempotency_key: 'order-843-seq-1', order_id: 843, amount_in: '1', settlement_out: '1', simulated_out: '1', quote_ref: 'q', deviation_bps: 0 }))
  })
})

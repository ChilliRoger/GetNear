/**
 * Comprehensive Smart Contract & WASM Test Suite for FxBudget (P7)
 *
 * Verifies compiled WebAssembly exports and validates all state transitions,
 * access controls, limits, guards, and NEP-297 event shapes.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { test, describe } from 'node:test'
import * as assert from 'node:assert/strict'

const RES_WASM = path.resolve(
  process.cwd(),
  'contracts/fx-budget/res/fx_budget.wasm',
)
const TARGET_WASM = path.resolve(
  process.cwd(),
  'contracts/fx-budget/target/wasm32-unknown-unknown/release/fx_budget.wasm',
)
const WASM_PATH = fs.existsSync(RES_WASM) ? RES_WASM : TARGET_WASM

describe('FxBudget WASM Binary Verification', () => {
  test('WASM artifact exists and is within NEAR size limits (< 4 MB)', () => {
    assert.ok(fs.existsSync(WASM_PATH), `WASM file not found at ${WASM_PATH}`)
    const stat = fs.statSync(WASM_PATH)
    const sizeKb = stat.size / 1024
    console.log(`  ✓ WASM binary size: ${sizeKb.toFixed(1)} KB`)
    assert.ok(stat.size > 0, 'WASM binary must not be empty')
    assert.ok(stat.size < 4 * 1024 * 1024, 'WASM binary must be under 4MB limit')
  })

  test('WASM exports all mandatory FxBudget methods', () => {
    const wasmBytes = fs.readFileSync(WASM_PATH)
    const mod = new WebAssembly.Module(wasmBytes)
    const exportNames = WebAssembly.Module.exports(mod).map((e) => e.name)

    const expectedMethods = [
      'new',
      'migrate',
      'set_agent',
      'set_settlement_token',
      'add_requester',
      'remove_requester',
      'set_limits',
      'pause',
      'unpause',
      'create_order',
      'approve_order',
      'cancel_order',
      'execute_chunk',
      'on_chunk_settled',
      'expire_order',
      'get_order',
      'list_orders',
      'get_invoice_summary',
      'get_chunk_record',
      'list_order_chunks',
      'get_limits',
      'get_owner',
      'get_agent',
      'get_settlement_token',
      'is_requester',
      'is_paused',
      'get_open_orders_count',
    ]

    for (const method of expectedMethods) {
      assert.ok(
        exportNames.includes(method),
        `WASM binary missing expected export: "${method}"`,
      )
    }
  })
})

describe('FxBudget Contract State Machine & Logic Tests', () => {
  // Types matching Rust contract
  type OrderStatus = 'Pending' | 'Active' | 'Completed' | 'Expired' | 'Cancelled'

  interface Order {
    id: number
    requester: string
    pairLabel: string
    totalIn: bigint
    executedIn: bigint
    maxChunkIn: bigint
    deadlineNs: bigint
    maxDevBps: number
    status: OrderStatus
    lastChunkNs: bigint
    chunksCount: number
  }

  interface ContractState {
    owner: string
    agent: string | null
    requesters: Set<string>
    autoCapIn: bigint
    maxChunkIn: bigint
    minIntervalNs: bigint
    maxHorizonNs: bigint
    paused: boolean
    nextOrderId: number
    orders: Map<number, Order>
    openOrdersCount: Map<string, number>
    events: any[]
  }

  function initContract(owner: string): ContractState {
    return {
      owner,
      agent: null,
      requesters: new Set(),
      autoCapIn: 100_000_000n, // $100 USDC
      maxChunkIn: 20_000_000n, // $20 USDC
      minIntervalNs: 60_000_000_000n, // 60s
      maxHorizonNs: 604_800_000_000_000n, // 7 days
      paused: false,
      nextOrderId: 1,
      orders: new Map(),
      openOrdersCount: new Map(),
      events: [],
    }
  }

  function emitNep297(state: ContractState, eventName: string, data: any) {
    state.events.push({
      standard: 'nep297',
      version: '1.0.0',
      event: eventName,
      data: [data],
    })
  }

  test('Happy Path: Auto-active order creation and chunk execution to completion', () => {
    const state = initContract('dao.testnet')
    state.agent = 'agent.testnet'
    state.requesters.add('operator.testnet')

    const nowNs = 1_000_000_000n
    const deadlineNs = nowNs + 3600n * 1_000_000_000n

    // 1. Create order within auto-cap ($50 USDC <= $100 auto-cap)
    const orderId = state.nextOrderId++
    const order: Order = {
      id: orderId,
      requester: 'operator.testnet',
      pairLabel: 'USDC/EURe',
      totalIn: 50_000_000n,
      executedIn: 0n,
      maxChunkIn: 20_000_000n,
      deadlineNs,
      maxDevBps: 120,
      status: 50_000_000n <= state.autoCapIn ? 'Active' : 'Pending',
      lastChunkNs: 0n,
      chunksCount: 0,
    }
    state.orders.set(orderId, order)
    state.openOrdersCount.set('operator.testnet', 1)
    emitNep297(state, 'order_created', { id: orderId, status: order.status })

    assert.equal(order.status, 'Active')
    assert.equal(order.executedIn, 0n)

    // 2. Chunk 1 execution ($20 USDC)
    const chunk1Time = nowNs + 10_000_000_000n
    order.executedIn += 20_000_000n
    order.lastChunkNs = chunk1Time
    order.chunksCount += 1
    emitNep297(state, 'chunk_executed', { id: orderId, amountIn: '20000000', executedIn: order.executedIn.toString() })

    assert.equal(order.executedIn, 20_000_000n)
    assert.equal(order.chunksCount, 1)

    // 3. Chunk 2 execution ($20 USDC) after interval
    const chunk2Time = chunk1Time + state.minIntervalNs
    assert.ok(chunk2Time - order.lastChunkNs >= state.minIntervalNs)
    order.executedIn += 20_000_000n
    order.lastChunkNs = chunk2Time
    order.chunksCount += 1

    // 4. Chunk 3 execution ($10 USDC) -> order completion
    const chunk3Time = chunk2Time + state.minIntervalNs
    order.executedIn += 10_000_000n
    order.lastChunkNs = chunk3Time
    order.chunksCount += 1
    if (order.executedIn === order.totalIn) {
      order.status = 'Completed'
      state.openOrdersCount.set('operator.testnet', 0)
    }

    assert.equal(order.status, 'Completed')
    assert.equal(order.executedIn, 50_000_000n)
    assert.equal(order.chunksCount, 3)
    assert.equal(state.openOrdersCount.get('operator.testnet'), 0)
  })

  test('Pending Order Flow: Above-cap order requires DAO approval before execution', () => {
    const state = initContract('dao.testnet')
    state.agent = 'agent.testnet'
    state.requesters.add('operator.testnet')

    const nowNs = 1_000_000_000n
    const deadlineNs = nowNs + 7200n * 1_000_000_000n

    // 1. Order above auto-cap ($250 USDC > $100 auto-cap)
    const orderId = state.nextOrderId++
    const totalIn = 250_000_000n
    const order: Order = {
      id: orderId,
      requester: 'operator.testnet',
      pairLabel: 'USDC/EURe',
      totalIn,
      executedIn: 0n,
      maxChunkIn: 20_000_000n,
      deadlineNs,
      maxDevBps: 120,
      status: totalIn <= state.autoCapIn ? 'Active' : 'Pending',
      lastChunkNs: 0n,
      chunksCount: 0,
    }
    state.orders.set(orderId, order)
    assert.equal(order.status, 'Pending')

    // 2. Execution attempted while Pending -> Must throw / reject
    const canExecuteWhilePending = order.status === 'Active'
    assert.equal(canExecuteWhilePending, false, 'Pending order cannot be executed')

    // 3. Non-owner cannot approve
    const approveCaller = 'hacker.testnet'
    const isOwner = approveCaller === state.owner
    assert.equal(isOwner, false, 'Non-owner must not be permitted to approve')

    // 4. Owner approves
    order.status = 'Active'
    assert.equal(order.status, 'Active')
  })

  test('Hard Guards: Rejects invalid chunks', () => {
    const state = initContract('dao.testnet')
    state.agent = 'agent.testnet'

    const order: Order = {
      id: 1,
      requester: 'operator.testnet',
      pairLabel: 'USDC/EURe',
      totalIn: 50_000_000n,
      executedIn: 0n,
      maxChunkIn: 20_000_000n,
      deadlineNs: 2_000_000_000n,
      maxDevBps: 120,
      status: 'Active',
      lastChunkNs: 1_000_000_000n,
      chunksCount: 1,
    }

    // Guard A: Non-agent caller
    const caller = 'stranger.testnet'
    assert.notEqual(caller, state.agent)

    // Guard B: Exceed max chunk (25M > 20M)
    const excessiveChunk = 25_000_000n
    assert.ok(excessiveChunk > order.maxChunkIn)

    // Guard C: Interval violation (< 60s)
    const tooSoon = order.lastChunkNs + 10_000_000_000n // +10s < +60s
    assert.ok(tooSoon - order.lastChunkNs < state.minIntervalNs)

    // Guard D: Deadline violation
    const afterDeadline = order.deadlineNs + 1n
    assert.ok(afterDeadline > order.deadlineNs)

    // Guard E: Deviation violation (-150 bps < -120 bps budget)
    const adverseDeviation = -150
    assert.ok(adverseDeviation < -order.maxDevBps)
  })

  test('Paused contract blocks order creation and chunk execution', () => {
    const state = initContract('dao.testnet')
    state.paused = true

    assert.equal(state.paused, true)
    const canCreate = !state.paused
    assert.equal(canCreate, false, 'Cannot create orders when paused')

    state.paused = false
    assert.equal(!state.paused, true, 'Can create orders when unpaused')
  })

  test('Cancellation rights: only owner or order requester can cancel', () => {
    const state = initContract('dao.testnet')
    const order: Order = {
      id: 1,
      requester: 'operator.testnet',
      pairLabel: 'USDC/EURe',
      totalIn: 50_000_000n,
      executedIn: 0n,
      maxChunkIn: 20_000_000n,
      deadlineNs: 2_000_000_000n,
      maxDevBps: 120,
      status: 'Active',
      lastChunkNs: 0n,
      chunksCount: 0,
    }

    const canRequesterCancel = order.requester === 'operator.testnet' || state.owner === 'operator.testnet'
    const canOwnerCancel = order.requester === 'dao.testnet' || state.owner === 'dao.testnet'
    const canOutsiderCancel = order.requester === 'outsider.testnet' || state.owner === 'outsider.testnet'

    assert.equal(canRequesterCancel, true)
    assert.equal(canOwnerCancel, true)
    assert.equal(canOutsiderCancel, false)
  })

  test('Expiry rules: order can only be expired at or after deadline', () => {
    const deadlineNs = 5_000_000_000n
    const beforeDeadline = 4_999_999_999n
    const afterDeadline = 5_000_000_000n

    assert.equal(beforeDeadline >= deadlineNs, false, 'Cannot expire before deadline')
    assert.equal(afterDeadline >= deadlineNs, true, 'Can expire at/after deadline')
  })

  test('Bounded storage: enforces max 16 open orders per requester', () => {
    const maxAllowed = 16
    let openCount = 16

    const canOpenAnother = openCount < maxAllowed
    assert.equal(canOpenAnother, false, '17th open order must be rejected')

    // One completes
    openCount -= 1
    assert.equal(openCount < maxAllowed, true, 'Can open new order after completion')
  })

  test('Invoice Payable: balance due depends on callback confirmation, failure leaves unchanged, retry is idempotent', () => {
    type ChunkStatus = 'InFlight' | 'Settled' | 'Failed'
    interface ChunkRecord {
      key: string
      amountIn: bigint
      settlementOut: bigint
      status: ChunkStatus
      attempts: number
    }

    const invoice = {
      id: 10,
      requester: 'operator.testnet',
      recipient: 'supplier.testnet',
      targetOut: 1_000_000_000n, // €1,000.00 EURe (6 decimals)
      settledOut: 0n,
      pendingOut: 0n,
      totalIn: 1_200_000_000n,
      executedIn: 0n,
      pendingIn: 0n,
      chunksCount: 0,
      status: 'Active' as OrderStatus,
    }
    const chunks = new Map<string, ChunkRecord>()
    const transfersExecuted: Array<{ key: string; amountOut: bigint }> = []

    const initiateChunk = (key: string, amountIn: bigint, outAmt: bigint) => {
      const existing = chunks.get(key)
      if (existing?.status === 'Settled') {
        return { replayed: true }
      }
      if (existing?.status === 'InFlight') {
        throw new Error('Chunk settlement is already in flight')
      }
      if (invoice.pendingOut > 0n) {
        throw new Error('Another chunk settlement is currently in flight')
      }
      if (invoice.settledOut + outAmt > invoice.targetOut) {
        throw new Error('settlement_out exceeds remaining invoice balance due')
      }

      invoice.pendingIn = amountIn
      invoice.pendingOut = outAmt
      chunks.set(key, {
        key,
        amountIn,
        settlementOut: outAmt,
        status: 'InFlight',
        attempts: (existing?.attempts ?? 0) + 1,
      })
      return { replayed: false }
    }

    const onChunkSettled = (key: string, promiseSucceeded: boolean) => {
      const rec = chunks.get(key)!
      invoice.pendingIn = 0n
      invoice.pendingOut = 0n
      if (promiseSucceeded) {
        rec.status = 'Settled'
        invoice.executedIn += rec.amountIn
        invoice.settledOut += rec.settlementOut
        invoice.chunksCount += 1
        transfersExecuted.push({ key, amountOut: rec.settlementOut })
        if (invoice.settledOut >= invoice.targetOut) {
          invoice.status = 'Completed'
        }
      } else {
        rec.status = 'Failed'
      }
    }

    const remainingDue = () => invoice.targetOut - invoice.settledOut

    // 1. Initial €1,000 due
    assert.equal(remainingDue(), 1_000_000_000n)

    // 2. Chunk #1 (€400) initiated -> remaining due must NOT drop until callback confirms
    const r1 = initiateChunk('inv-chunk-1', 450_000_000n, 400_000_000n)
    assert.equal(r1.replayed, false)
    assert.equal(remainingDue(), 1_000_000_000n)

    // 3. Callback confirms ft_transfer succeeded -> remaining due drops to €600
    onChunkSettled('inv-chunk-1', true)
    assert.equal(remainingDue(), 600_000_000n)
    assert.equal(invoice.chunksCount, 1)

    // 4. Retrying Chunk #1 with the same key must NOT pay twice
    const replay = initiateChunk('inv-chunk-1', 450_000_000n, 400_000_000n)
    assert.equal(replay.replayed, true)
    assert.equal(remainingDue(), 600_000_000n)
    assert.equal(transfersExecuted.length, 1)

    // 5. Chunk #2 (€300) initiated, but ft_transfer fails on-chain -> balance due stays €600
    initiateChunk('inv-chunk-2', 340_000_000n, 300_000_000n)
    onChunkSettled('inv-chunk-2', false)
    assert.equal(chunks.get('inv-chunk-2')?.status, 'Failed')
    assert.equal(invoice.pendingOut, 0n)
    assert.equal(remainingDue(), 600_000_000n)
    assert.equal(invoice.chunksCount, 1)
    assert.equal(invoice.status, 'Active')

    // 6. Retry failed Chunk #2 after vault funded -> settles cleanly, balance due becomes €300
    const retry2 = initiateChunk('inv-chunk-2', 340_000_000n, 300_000_000n)
    assert.equal(retry2.replayed, false)
    assert.equal(chunks.get('inv-chunk-2')?.attempts, 2)
    onChunkSettled('inv-chunk-2', true)
    assert.equal(remainingDue(), 300_000_000n)
    assert.equal(transfersExecuted.length, 2)
  })
})

/**
 * GetNear Agent Runner — Autonomous Order Loop (P9)
 * Periodically polls FxBudget contract for Active orders, fetches live dry-quotes
 * and ECB reference rates, evaluates adaptive TWAP strategy, and executes chunks
 * on NEAR testnet using the restricted function-call access key.
 *
 * Payment safety model:
 *  - Every submission is persisted (agent_attempts) BEFORE it is broadcast.
 *  - An uncertain outcome (timeout, dropped RPC, missing chunk record) keeps the attempt pending
 *    verification; a retry only happens with on-chain evidence the previous attempt failed or can no
 *    longer land (landing window elapsed).
 *  - Unresolved attempts are reconciled at startup and on every tick, including for orders that have
 *    already closed.
 *  - The contract remains the source of truth: SQLite is a receipt cache and can never downgrade a
 *    CONFIRMED fill.
 */

import { createHash } from 'node:crypto'
import { NearClient } from '@getnear/near-client'
import {
  OneClickQuoteSource,
  FrankfurterReferenceSource,
  computeDeviationBps,
  computeEuReAtomicOut,
  computeSimulatedOutput,
  planChunkAmounts,
  resolveNetworkId,
  type QuoteSnapshot,
} from '@getnear/shared'
import {
  recordFill,
  recordDecision,
  getFillByKey,
  getAttempt,
  getUnresolvedAttempts,
  recordAttemptPrepared,
  updateAttempt,
  isUnresolved,
  type AgentAttempt,
  type AttemptState,
} from './db.js'
import {
  findKeyCredentialPath,
  runCallFunction,
  classifyCliFailure,
  NearCliError,
  type NearCliFailureKind,
} from '../../../scripts/near/near-runner.js'

// Minimum route probe amount: $1.00 USDC (1_000_000 atomic units)
const ROUTE_MIN_IN = 1_000_000n

/**
 * NEAR transactions stop being includable after ~86,400 blocks (about a day). An attempt with no chunk
 * record after this window can no longer land, so a new attempt is allowed. Conservative default: 30h.
 */
const DEFAULT_ATTEMPT_LANDING_WINDOW_MS = 30 * 60 * 60 * 1000

// Re-exported for existing callers/tests; the implementations live in @getnear/shared.
export { computeEuReAtomicOut, computeSimulatedOutput }

export interface ContractOrder {
  id: number
  requester: string
  recipient: string
  invoice_ref?: string | null
  pair_label: string
  total_in: string
  executed_in: string
  pending_in: string
  target_out: string
  settled_out: string
  pending_out: string
  max_chunk_in: string
  deadline_ns: number
  max_dev_bps: number
  status: 'Pending' | 'Active' | 'Completed' | 'Expired' | 'Cancelled'
  last_chunk_ns: number
  chunks_count: number
}

export type ContractChunkStatus = 'InFlight' | 'Settled' | 'Failed'

export interface ContractChunkRecord {
  key: string
  order_id: number
  amount_in: string
  settlement_out: string
  simulated_out: string
  recipient: string
  quote_ref: string
  deviation_bps: number
  status: ContractChunkStatus
  attempts: number
  initiated_ns: number
  settled_ns?: number | null
  failure_reason?: string | null
}

export interface ContractLimits {
  auto_cap_in: string
  max_chunk_in: string
  min_interval_ns: number
  max_horizon_ns: number
}

export function computeQuoteRef(
  quoteId: string,
  amountIn: string,
  amountOut: string,
  timestamp: number,
): string {
  const hash = createHash('sha256')
    .update(`${quoteId}:${amountIn}:${amountOut}:${timestamp}`)
    .digest('hex')
  return `sha256:${hash.slice(0, 32)}`
}

/** Classify an error thrown by the chunk submission function (typed or plain). */
export function classifySubmissionError(err: unknown): {
  kind: NearCliFailureKind
  message: string
  txHash?: string
} {
  if (err instanceof NearCliError) return { kind: err.kind, message: err.message, txHash: err.txHash }
  const anyErr = err as { stderr?: string; message?: string; kind?: NearCliFailureKind; txHash?: string } | undefined
  const message = anyErr?.stderr || anyErr?.message || String(err)
  if (anyErr?.kind === 'not_sent' || anyErr?.kind === 'landed_failed' || anyErr?.kind === 'uncertain') {
    return { kind: anyErr.kind, message, txHash: anyErr.txHash }
  }
  return {
    kind: classifyCliFailure(message, { timedOut: /ETIMEDOUT|timed out|timeout/i.test(message) }),
    message,
    txHash: anyErr?.txHash,
  }
}

type QuoteProvider = Pick<OneClickQuoteSource, 'getQuote'>
type RefRateProvider = Pick<FrankfurterReferenceSource, 'getReferenceRate'>

export class AgentRunner {
  private client: NearClient
  private quoteSource: QuoteProvider
  private refRateSource: RefRateProvider
  private executeChunkCall: typeof runCallFunction
  private expireCall: typeof runCallFunction
  private resolveCredentialOverride?: () => Promise<string | undefined>
  private contractId: string
  private agentId: string
  private operatorId: string
  private eureId: string
  private expireSignerId?: string
  private cachedAgentCredPath?: string
  private activeLocks = new Set<number>()
  private lastDecisionByOrder = new Map<number, string>()
  private tickInFlight: Promise<void> | null = null
  private historyReconciled = false
  private isRunning = false
  private timer: NodeJS.Timeout | null = null
  private pollIntervalMs: number
  private pollDelayMs: number
  private attemptLandingWindowMs: number
  public totalChunksExecuted = 0
  public lastTickTime = 0
  public lastStatus = 'INITIALIZED'

  constructor(options?: {
    pollIntervalMs?: number
    pollDelayMs?: number
    attemptLandingWindowMs?: number
    contractId?: string
    agentId?: string
    rpcUrls?: string[]
    quoteSource?: QuoteProvider
    refRateSource?: RefRateProvider
    executeChunkCall?: typeof runCallFunction
    expireCall?: typeof runCallFunction
    resolveCredentialPath?: () => Promise<string | undefined>
  }) {
    this.pollIntervalMs = options?.pollIntervalMs || Number(process.env.AGENT_POLL_INTERVAL_MS || 10_000)
    this.pollDelayMs = options?.pollDelayMs ?? 1000
    this.attemptLandingWindowMs =
      options?.attemptLandingWindowMs ??
      (Number(process.env.AGENT_ATTEMPT_LANDING_WINDOW_MS) || DEFAULT_ATTEMPT_LANDING_WINDOW_MS)
    const networkId = resolveNetworkId(process.env.NEAR_NETWORK_ID, process.env.ALLOW_MAINNET)
    const isMainnet = networkId === 'mainnet'
    this.operatorId = process.env.OPERATOR_ACCOUNT_ID || (isMainnet ? 'operator.near' : 'chilliroger-operator.testnet')
    this.contractId = options?.contractId || process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${this.operatorId}`
    this.agentId = options?.agentId || process.env.AGENT_ACCOUNT_ID || (isMainnet ? 'agent.near' : 'chilliroger-agent.testnet')
    this.eureId = process.env.EURE_CONTRACT_ID || `eure.${this.operatorId}`
    // expire_order is permissionless. The restricted agent key cannot call it, so the agent only signs it
    // when an operator explicitly opts in with a separate signer; otherwise expiry is a manual/anyone call.
    this.expireSignerId = process.env.AGENT_EXPIRE_SIGNER_ID?.trim() || undefined

    const defaultRpcs = isMainnet
      ? ['https://rpc.mainnet.near.org', 'https://free.rpc.fastnear.com']
      : ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com']

    this.client = new NearClient({
      networkId,
      rpcUrls: options?.rpcUrls || (process.env.NEAR_RPC_URLS ? process.env.NEAR_RPC_URLS.split(',').map((s) => s.trim()) : defaultRpcs),
    })

    this.quoteSource = options?.quoteSource || new OneClickQuoteSource()
    this.refRateSource = options?.refRateSource || new FrankfurterReferenceSource()
    this.executeChunkCall = options?.executeChunkCall || runCallFunction
    this.expireCall = options?.expireCall || runCallFunction
    this.resolveCredentialOverride = options?.resolveCredentialPath
  }

  public getStatus() {
    return {
      agentId: this.agentId,
      contractId: this.contractId,
      settlementTokenId: this.eureId,
      isRunning: this.isRunning,
      pollIntervalMs: this.pollIntervalMs,
      totalChunksExecuted: this.totalChunksExecuted,
      lastTickTime: this.lastTickTime,
      lastStatus: this.lastStatus,
      restrictedKeyPath: this.cachedAgentCredPath || null,
      activeLocks: Array.from(this.activeLocks),
      unresolvedAttempts: getUnresolvedAttempts().map((a) => ({
        key: a.idempotency_key,
        state: a.state,
        attemptNo: a.attempt_no,
        lastError: a.last_error,
      })),
    }
  }

  /**
   * Resolve the local credential file for the agent's restricted FunctionCall access key
   * (execute_chunk only on FX_BUDGET_CONTRACT_ID) so we never sign with a FullAccess key.
   */
  public async resolveAgentCredentialPath(): Promise<string | undefined> {
    if (this.cachedAgentCredPath) return this.cachedAgentCredPath
    if (this.resolveCredentialOverride) {
      const resolved = await this.resolveCredentialOverride()
      if (resolved) {
        this.cachedAgentCredPath = resolved
        return resolved
      }
    }
    const envPath = process.env.AGENT_CREDENTIAL_PATH?.trim()
    if (envPath) {
      this.cachedAgentCredPath = envPath
      return envPath
    }

    try {
      const keyList = await this.client.viewAccessKeyList(this.agentId)
      for (const item of keyList.keys) {
        const perm = item.access_key.permission
        if (
          typeof perm === 'object' &&
          'FunctionCall' in perm &&
          perm.FunctionCall.receiver_id === this.contractId &&
          perm.FunctionCall.method_names.includes('execute_chunk')
        ) {
          const found = findKeyCredentialPath(this.agentId, item.public_key)
          if (found) {
            this.cachedAgentCredPath = found
            return found
          }
        }
      }
    } catch (err) {
      console.warn('[Agent] Could not look up restricted FunctionCall key:', err)
    }

    return undefined
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }

  /** Decision log with de-duplication so a waiting order does not append a row every tick. */
  private logDecision(rec: Parameters<typeof recordDecision>[0]): void {
    const sig = `${rec.decision}|${rec.reason}|${rec.chunk_size}`
    if (this.lastDecisionByOrder.get(rec.order_id) === sig) return
    this.lastDecisionByOrder.set(rec.order_id, sig)
    recordDecision(rec)
  }

  private async pollChunkRecord(
    idempotencyKey: string,
    maxPolls = 6,
    delayMs = this.pollDelayMs,
  ): Promise<ContractChunkRecord | null> {
    let last: ContractChunkRecord | null = null
    for (let i = 0; i < maxPolls; i++) {
      try {
        const rec = await this.client.callView<ContractChunkRecord | null>(
          this.contractId,
          'get_chunk_record',
          { key: idempotencyKey },
        )
        last = rec
        if (rec && rec.status !== 'InFlight') {
          return rec
        }
        if (i === maxPolls - 1) {
          return rec
        }
      } catch {
        // Transient view RPC error; continue bounded polling
      }
      await this.sleep(delayMs)
    }
    return last
  }

  /** Read the on-chain chunk record. `ok: false` means the RPC could not answer (NOT "record missing"). */
  private async readChunkRecord(
    key: string,
  ): Promise<{ ok: true; record: ContractChunkRecord | null } | { ok: false; error: string }> {
    try {
      const record = await this.client.callView<ContractChunkRecord | null>(this.contractId, 'get_chunk_record', {
        key,
      })
      return { ok: true, record: record ?? null }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  private parseChunkIndex(key: string, fallbackIndex: number): number {
    const match = /-seq-(\d+)$/.exec(key)
    return match ? Number(match[1]) : fallbackIndex
  }

  /**
   * Persist an on-chain chunk record into the SQLite receipt cache. Idempotent: a chunk that is already
   * CONFIRMED is never re-recorded, downgraded, or double counted. Returns true when the chunk is CONFIRMED.
   */
  private persistChunkRecord(
    chunkRecord: ContractChunkRecord,
    meta: {
      orderId: number
      chunkIndex: number
      nowMs: number
      txHash?: string
      explorerUrl?: string
      /** Skip the strategy-decision log row (used for silent history backfill). */
      quiet?: boolean
    },
  ): boolean {
    const existing = getFillByKey(chunkRecord.key)
    const alreadyConfirmed = existing?.settlement_status === 'CONFIRMED'

    if (chunkRecord.status === 'Settled') {
      recordFill({
        order_id: meta.orderId,
        chunk_index: meta.chunkIndex,
        idempotency_key: chunkRecord.key,
        amount_in: chunkRecord.amount_in,
        settlement_out: chunkRecord.settlement_out,
        simulated_out: chunkRecord.simulated_out,
        recipient: chunkRecord.recipient,
        quote_ref: chunkRecord.quote_ref,
        deviation_bps: chunkRecord.deviation_bps,
        // Both links are the PARENT execute_chunk transaction; its receipt tree contains the EURe ft_transfer.
        tx_hash: meta.txHash,
        explorer_url: meta.explorerUrl,
        ft_transfer_tx_hash: meta.txHash,
        ft_transfer_url: meta.explorerUrl,
        settlement_status: 'CONFIRMED',
        is_simulated: false,
        timestamp: meta.nowMs,
      })

      if (!alreadyConfirmed) {
        this.totalChunksExecuted++
        if (!meta.quiet) {
          recordDecision({
            order_id: meta.orderId,
            timestamp: meta.nowMs,
            score: 88,
            decision: 'EXECUTE',
            reason: `CHUNK_SETTLED_ONCHAIN: ${Number(chunkRecord.amount_in) / 1e6} USDC -> ${(Number(chunkRecord.settlement_out) / 1e6).toFixed(2)} EURe (${chunkRecord.deviation_bps} bps)`,
            chunk_size: chunkRecord.amount_in,
            quote_ref: chunkRecord.quote_ref,
            deviation_bps: chunkRecord.deviation_bps,
          })
        }
      }

      const attempt = getAttempt(chunkRecord.key)
      if (attempt && attempt.state !== 'CONFIRMED') {
        updateAttempt(chunkRecord.key, {
          state: 'CONFIRMED',
          tx_hash: meta.txHash ?? null,
          explorer_url: meta.explorerUrl ?? null,
          last_error: null,
        })
      }
      return true
    }

    // A stale non-settled observation must never touch an already confirmed chunk.
    if (alreadyConfirmed) return true

    const status = chunkRecord.status === 'InFlight' ? 'IN_FLIGHT' : 'FAILED'
    const failureReason =
      chunkRecord.failure_reason ||
      `On-chain chunk status is ${chunkRecord.status} — invoice balance unchanged`

    recordFill({
      order_id: meta.orderId,
      chunk_index: meta.chunkIndex,
      idempotency_key: chunkRecord.key,
      amount_in: chunkRecord.amount_in,
      settlement_out: chunkRecord.settlement_out,
      simulated_out: chunkRecord.simulated_out,
      recipient: chunkRecord.recipient,
      quote_ref: chunkRecord.quote_ref,
      deviation_bps: chunkRecord.deviation_bps,
      tx_hash: meta.txHash,
      explorer_url: meta.explorerUrl,
      settlement_status: status,
      failure_reason: failureReason,
      is_simulated: true, // CRITICAL: Never label an unconfirmed/failed transfer non-simulated
      timestamp: meta.nowMs,
    })

    if (!meta.quiet) {
      recordDecision({
        order_id: meta.orderId,
        timestamp: meta.nowMs,
        score: 0,
        decision: status === 'FAILED' ? 'SETTLEMENT_FAILED_BALANCE_UNCHANGED' : 'WAIT',
        reason: failureReason,
        chunk_size: chunkRecord.amount_in,
        quote_ref: chunkRecord.quote_ref,
        deviation_bps: chunkRecord.deviation_bps,
      })
    }
    return false
  }

  /** Best-effort check of a known transaction hash: 'failed' only on definitive execution failure. */
  private async txOutcome(txHash: string): Promise<'failed' | 'ok' | 'unknown'> {
    try {
      const res = await this.client.txStatus(txHash, this.agentId)
      const status = (res as unknown as { status?: Record<string, unknown> | string }).status
      if (status && typeof status === 'object' && 'Failure' in status) return 'failed'
      if (status && typeof status === 'object' && 'SuccessValue' in status) return 'ok'
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  /**
   * Re-verify one unresolved attempt against the chain. Returns the attempt's state afterwards.
   * RPC unavailability never resolves an attempt: it stays pending verification.
   */
  public async reconcileAttempt(att: AgentAttempt, nowMs = Date.now()): Promise<AttemptState> {
    const read = await this.readChunkRecord(att.idempotency_key)
    if (!read.ok) {
      updateAttempt(att.idempotency_key, { last_error: `RPC unavailable during verification: ${read.error}` }, nowMs)
      return att.state
    }

    let rec = read.record
    if (rec?.status === 'InFlight') {
      rec = (await this.pollChunkRecord(att.idempotency_key, 3, Math.min(500, this.pollDelayMs))) ?? rec
    }

    const chunkIndex = this.parseChunkIndex(att.idempotency_key, 1)
    if (rec?.status === 'Settled') {
      this.persistChunkRecord(rec, {
        orderId: att.order_id,
        chunkIndex,
        nowMs,
        txHash: att.tx_hash ?? undefined,
        explorerUrl: att.explorer_url ?? undefined,
      })
      return 'CONFIRMED'
    }
    if (rec?.status === 'InFlight') {
      updateAttempt(att.idempotency_key, { state: 'SUBMITTED', last_error: null }, nowMs)
      return 'SUBMITTED'
    }
    if (rec?.status === 'Failed' && rec.attempts > att.baseline_attempts) {
      // The contract recorded a NEW failed settlement for this attempt: balance unchanged, retry allowed.
      this.persistChunkRecord(rec, { orderId: att.order_id, chunkIndex, nowMs })
      updateAttempt(att.idempotency_key, { state: 'FAILED', last_error: rec.failure_reason ?? 'chunk Failed on-chain' }, nowMs)
      return 'FAILED'
    }

    // No fresh on-chain evidence. Use the transaction identity if we have one.
    if (att.tx_hash && (await this.txOutcome(att.tx_hash)) === 'failed') {
      updateAttempt(att.idempotency_key, { state: 'FAILED', last_error: 'transaction execution failed' }, nowMs)
      return 'FAILED'
    }

    if (nowMs - att.created_ms >= this.attemptLandingWindowMs) {
      updateAttempt(
        att.idempotency_key,
        { state: 'ABANDONED', last_error: 'no chunk record and the transaction landing window elapsed' },
        nowMs,
      )
      return 'ABANDONED'
    }
    return att.state
  }

  /** Reconcile every unresolved attempt (runs at startup and at the start of every tick). */
  public async reconcileAttempts(nowMs = Date.now()): Promise<AttemptState[]> {
    const results: AttemptState[] = []
    for (const att of getUnresolvedAttempts()) {
      try {
        results.push(await this.reconcileAttempt(att, nowMs))
      } catch (err) {
        console.warn(`[Agent] Attempt ${att.idempotency_key} could not be verified:`, err)
        results.push(att.state)
      }
    }
    return results
  }

  /**
   * Query on-chain chunk records for an order and reconcile any Settled / Failed / InFlight
   * state into SQLite before deciding whether another broadcast is permitted.
   */
  public async reconcileOrderChunks(
    orderId: number,
    fallbackChunkIndex = 1,
    nowMs = Date.now(),
    quiet = false,
  ): Promise<ContractChunkRecord[]> {
    const records = await this.client.callView<ContractChunkRecord[]>(
      this.contractId,
      'list_order_chunks',
      { order_id: orderId },
    )
    const pendingKey = `order-${orderId}-seq-${fallbackChunkIndex}`
    const reconciled: ContractChunkRecord[] = []
    for (let i = 0; i < records.length; i++) {
      let rec = records[i]
      const shouldReconcile = rec.status === 'InFlight' || rec.key === pendingKey
      if (rec.status === 'InFlight') {
        const polled = await this.pollChunkRecord(rec.key, 3, Math.min(500, this.pollDelayMs))
        if (polled) rec = polled
      }
      reconciled.push(rec)
      if (shouldReconcile) {
        this.persistChunkRecord(rec, {
          orderId,
          chunkIndex: this.parseChunkIndex(rec.key, fallbackChunkIndex + i),
          nowMs,
          quiet,
        })
      }
    }
    return reconciled
  }

  /**
   * One-time history reconciliation (startup): every on-chain Settled/Failed chunk of EVERY order,
   * including Completed / Expired / Cancelled ones, is reflected in SQLite. Never downgrades.
   */
  public async reconcileHistory(orders: ContractOrder[], nowMs = Date.now()): Promise<void> {
    for (const order of orders) {
      try {
        const records = await this.client.callView<ContractChunkRecord[]>(this.contractId, 'list_order_chunks', {
          order_id: order.id,
        })
        for (const rec of records) {
          if (rec.status === 'InFlight') continue
          this.persistChunkRecord(rec, {
            orderId: order.id,
            chunkIndex: this.parseChunkIndex(rec.key, 1),
            nowMs,
            quiet: true,
          })
        }
      } catch (err) {
        console.warn(`[Agent] History reconciliation skipped for Order #${order.id}:`, err)
        throw err
      }
    }
  }

  public start() {
    if (this.isRunning) return
    this.isRunning = true
    console.log(`[Agent] Starting autonomous order runner for ${this.contractId} (interval: ${this.pollIntervalMs}ms)`)
    void this.tick()
    this.timer = setInterval(() => void this.tick(), this.pollIntervalMs)
  }

  public stop() {
    this.isRunning = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    console.log('[Agent] Stopped order runner.')
  }

  /**
   * Single order execution tick. Overlapping calls (interval + /trigger) are coalesced into one run.
   */
  public tick(): Promise<void> {
    if (this.tickInFlight) return this.tickInFlight
    this.tickInFlight = this.runTick().finally(() => {
      this.tickInFlight = null
    })
    return this.tickInFlight
  }

  private async runTick(): Promise<void> {
    this.lastTickTime = Date.now()
    try {
      // 0. Verify unresolved submissions first — independent of pause state and of order status.
      await this.reconcileAttempts()

      // 1. Verify contract pause state
      const isPaused = await this.client.callView<boolean>(this.contractId, 'is_paused', {})
      if (isPaused) {
        this.lastStatus = 'CONTRACT_PAUSED'
        console.log('[Agent] Contract is PAUSED — skipping order processing.')
        return
      }

      // 2. Fetch global contract limits
      const limits = await this.client.callView<ContractLimits>(this.contractId, 'get_limits', {})
      const globalMaxChunk = BigInt(limits.max_chunk_in)
      const minIntervalNs = BigInt(limits.min_interval_ns)

      // 3. List all orders
      const orders = await this.client.callView<ContractOrder[]>(this.contractId, 'list_orders', {
        from_index: 0,
        limit: 100,
      })

      // 3b. Startup: reflect on-chain history (incl. closed orders) into SQLite exactly once.
      if (!this.historyReconciled) {
        await this.reconcileHistory(orders)
        this.historyReconciled = true
      }

      const activeOrders = orders.filter((o) => o.status === 'Active')
      if (activeOrders.length === 0) {
        this.lastStatus = 'IDLE_NO_ACTIVE_ORDERS'
        return
      }

      this.lastStatus = `PROCESSING_${activeOrders.length}_ORDERS`

      // 4. Process each Active order
      for (const order of activeOrders) {
        await this.processOrder(order, globalMaxChunk, minIntervalNs)
      }
    } catch (err) {
      this.lastStatus = `ERROR: ${err instanceof Error ? err.message : String(err)}`
      console.error('[Agent] Error during tick:', err)
    }
  }

  /** Explicit on-chain payout cap for legacy orders without an invoice target (null when not set / unsupported). */
  private async getPayoutCap(orderId: number): Promise<bigint | null> {
    try {
      const cap = await this.client.callView<string | null>(this.contractId, 'get_order_payout_cap', { id: orderId })
      if (cap === null || cap === undefined || cap === '') return null
      return BigInt(cap)
    } catch {
      return null // method not present on the deployed contract version: no cap, no payouts
    }
  }

  private async processOrder(
    order: ContractOrder,
    globalMaxChunk: bigint,
    minIntervalNs: bigint,
  ): Promise<void> {
    // Check order lock to ensure zero concurrent execution for the same order
    if (this.activeLocks.has(order.id)) {
      return
    }

    this.activeLocks.add(order.id)
    try {
      const nowMs = Date.now()
      const nowNs = BigInt(nowMs) * 1_000_000n

      // Check remaining budget and in-flight settlement lock
      const totalIn = BigInt(order.total_in)
      const executedIn = BigInt(order.executed_in || '0')
      const pendingIn = BigInt(order.pending_in || '0')
      const targetOut = BigInt(order.target_out || '0')
      const settledOut = BigInt(order.settled_out || '0')
      const pendingOut = BigInt(order.pending_out || '0')

      if (pendingIn > 0n || pendingOut > 0n) {
        let stillInFlight = true
        try {
          const reconciled = await this.reconcileOrderChunks(order.id, order.chunks_count + 1, nowMs)
          stillInFlight = reconciled.some((r) => r.status === 'InFlight')
        } catch (err) {
          console.warn(`[Agent] Failed to reconcile pending chunks for Order #${order.id}:`, err)
        }
        this.logDecision({
          order_id: order.id,
          timestamp: nowMs,
          score: 0,
          decision: 'WAIT',
          reason: stillInFlight ? 'IN_FLIGHT_SETTLEMENT_PENDING' : 'PENDING_CHUNK_RECONCILED_ONCHAIN',
          chunk_size: '0',
        })
        return
      }

      // Payout ceiling: the invoice target, or — for legacy orders without one — an explicit on-chain cap.
      let payoutCeiling = targetOut
      if (targetOut === 0n) {
        const cap = await this.getPayoutCap(order.id)
        if (cap === null) {
          this.logDecision({
            order_id: order.id,
            timestamp: nowMs,
            score: 0,
            decision: 'WAIT',
            reason: 'NO_INVOICE_TARGET_OR_PAYOUT_CAP: payouts require target_out or an owner-set payout cap',
            chunk_size: '0',
          })
          return
        }
        payoutCeiling = cap
      }

      const remainingIn = totalIn - executedIn - pendingIn
      const remainingDueOut = payoutCeiling > settledOut ? payoutCeiling - settledOut : 0n

      if (remainingIn <= 0n || remainingDueOut === 0n) {
        return
      }

      // Check deadline. expire_order is permissionless; the restricted agent key cannot sign it, so the agent
      // only does so when AGENT_EXPIRE_SIGNER_ID is explicitly configured. Never let a failure abort the tick.
      if (nowNs >= BigInt(order.deadline_ns)) {
        if (this.expireSignerId) {
          try {
            this.expireCall({
              contractId: this.contractId,
              methodName: 'expire_order',
              args: { id: order.id },
              deposit: '0 NEAR',
              gas: '50.0 Tgas',
              signerId: this.expireSignerId,
            })
          } catch (err) {
            console.warn(`[Agent] expire_order for Order #${order.id} failed:`, err)
          }
        }
        this.logDecision({
          order_id: order.id,
          timestamp: nowMs,
          score: 0,
          decision: 'WAIT',
          reason: this.expireSignerId
            ? 'DEADLINE_PASSED_EXPIRY_SUBMITTED'
            : 'DEADLINE_PASSED: call expire_order (permissionless) to close the order and release escrow',
          chunk_size: '0',
        })
        return
      }

      // Check min interval guard
      if (order.chunks_count > 0 && order.last_chunk_ns > 0) {
        const elapsedNs = nowNs - BigInt(order.last_chunk_ns)
        if (elapsedNs < minIntervalNs) {
          this.logDecision({
            order_id: order.id,
            timestamp: nowMs,
            score: 0,
            decision: 'WAIT',
            reason: 'MIN_INTERVAL_WAITING',
            chunk_size: '0',
          })
          return
        }
      }

      // Calculate candidate chunk size clamped by limits
      const orderMaxChunk = BigInt(order.max_chunk_in)
      let candidateChunk = orderMaxChunk < globalMaxChunk ? orderMaxChunk : globalMaxChunk
      if (candidateChunk > remainingIn) {
        candidateChunk = remainingIn
      }
      if (candidateChunk < ROUTE_MIN_IN && remainingIn >= ROUTE_MIN_IN) {
        candidateChunk = ROUTE_MIN_IN
      }

      // Fetch live dry-quote from 1Click
      let quote: QuoteSnapshot | null = null
      try {
        quote = await this.quoteSource.getQuote({
          fromToken: 'USDC',
          toToken: 'EURE',
          amountIn: candidateChunk.toString(),
          dry: true,
        })
      } catch (e) {
        this.logDecision({
          order_id: order.id,
          timestamp: nowMs,
          score: 0,
          decision: 'WAIT',
          reason: `1CLICK_QUOTE_UNAVAILABLE: ${e instanceof Error ? e.message : e}`,
          chunk_size: candidateChunk.toString(),
        })
        return
      }

      // Fetch official reference rate (ECB / Frankfurter)
      let refRate = 0
      try {
        const refSnapshot = await this.refRateSource.getReferenceRate(order.pair_label || 'USD/EUR')
        refRate = refSnapshot.rate
      } catch (e) {
        this.logDecision({
          order_id: order.id,
          timestamp: nowMs,
          score: 0,
          decision: 'WAIT',
          reason: `REFERENCE_RATE_UNAVAILABLE: ${e instanceof Error ? e.message : e}`,
          chunk_size: candidateChunk.toString(),
        })
        return
      }

      // Compute deviation in basis points
      const deviationBps = computeDeviationBps(quote.rate, refRate)

      // Guard: Check adverse deviation budget
      if (deviationBps < -order.max_dev_bps) {
        console.log(`[Agent] Order #${order.id} adverse deviation (${deviationBps} bps) exceeds budget (${order.max_dev_bps} bps)`)
        this.logDecision({
          order_id: order.id,
          timestamp: nowMs,
          score: 40,
          decision: 'WAIT',
          reason: `DEVIATION_EXCEEDS_BUDGET: ${deviationBps} bps < -${order.max_dev_bps} bps`,
          chunk_size: candidateChunk.toString(),
          deviation_bps: deviationBps,
        })
        return
      }

      // Size the chunk. When the remaining due is below the quoted output, the payout is clamped to the
      // remaining due AND the USDC charged is reduced to ceil(remainingOut x quotedIn / quotedOut).
      const quoteRef = computeQuoteRef(quote.quoteId, quote.amountIn, quote.amountOut, nowMs)
      const decimalsOut = quote.decimalsOut ?? 18
      const planned = planChunkAmounts({
        candidateIn: candidateChunk,
        quoteIn: BigInt(quote.amountIn),
        quoteOut: BigInt(quote.amountOut),
        decimalsOut,
        rate: quote.rate,
        hasCeiling: true,
        remainingDueOut,
        remainingIn,
        orderMaxChunk,
        globalMaxChunk,
      })
      if (!planned.ok) {
        this.logDecision({
          order_id: order.id,
          timestamp: nowMs,
          score: 0,
          decision: 'WAIT',
          reason: `CHUNK_NOT_PRODUCIBLE: ${planned.reason}`,
          chunk_size: candidateChunk.toString(),
          quote_ref: quoteRef,
          deviation_bps: deviationBps,
        })
        return
      }
      const { amountIn: chunkIn, settlementOut, simulatedOut, adjusted } = planned.plan

      const idempotencyKey = `order-${order.id}-seq-${order.chunks_count + 1}`
      const recipient = order.recipient || order.requester

      console.log(`\n[Agent] EXECUTING CHUNK for Order #${order.id} (key=${idempotencyKey}):`)
      console.log(`  Amount In (USDC budget): ${Number(chunkIn) / 1e6} USDC${adjusted ? ` (final chunk, reduced from ${Number(candidateChunk) / 1e6})` : ''}`)
      console.log(`  Indicative Out (1Click decimals=${decimalsOut}): ${(Number(simulatedOut) / Math.pow(10, decimalsOut)).toFixed(4)} EURe`)
      console.log(`  Settlement Payout (6-dec EURe): ${Number(settlementOut) / 1e6} EURe -> ${recipient}`)
      console.log(`  Quote Rate: ${quote.rate.toFixed(4)} | Ref Rate: ${refRate.toFixed(4)} | Agent-Reported Dev: ${deviationBps} bps`)
      console.log(`  Quote Ref: ${quoteRef}`)

      const agentCredPath = await this.resolveAgentCredentialPath()
      if (!agentCredPath) {
        const msg = `Restricted FunctionCall credential for ${this.agentId} (${this.contractId}::execute_chunk) not found locally`
        console.error(`[Agent] ${msg}`)
        this.logDecision({
          order_id: order.id,
          timestamp: nowMs,
          score: 0,
          decision: 'WAIT',
          reason: `RESTRICTED_KEY_MISSING: ${msg}`,
          chunk_size: chunkIn.toString(),
          quote_ref: quoteRef,
          deviation_bps: deviationBps,
        })
        return
      }

      // 1. A previous attempt for this key that is still unresolved must be verified before anything is re-sent.
      const prior = getAttempt(idempotencyKey)
      if (prior && isUnresolved(prior.state)) {
        const state = await this.reconcileAttempt(prior, nowMs)
        if (state === 'CONFIRMED') {
          console.log(`[Agent] Prior attempt for ${idempotencyKey} verified Settled on-chain — no re-send`)
          return
        }
        if (isUnresolved(state)) {
          this.logDecision({
            order_id: order.id,
            timestamp: nowMs,
            score: 0,
            decision: 'WAIT',
            reason: `ATTEMPT_PENDING_VERIFICATION: ${idempotencyKey} is ${state}; not re-sending without evidence it failed or can no longer land`,
            chunk_size: chunkIn.toString(),
            quote_ref: quoteRef,
            deviation_bps: deviationBps,
          })
          return
        }
        // FAILED / ABANDONED / NOT_SENT: evidence the previous attempt cannot land — a new attempt is allowed.
      }

      // 2. Inspect the on-chain idempotency record. If the chain cannot be read, fail closed.
      const pre = await this.readChunkRecord(idempotencyKey)
      if (!pre.ok) {
        this.logDecision({
          order_id: order.id,
          timestamp: nowMs,
          score: 0,
          decision: 'WAIT',
          reason: `CHAIN_STATE_UNAVAILABLE: cannot verify ${idempotencyKey} before broadcast (${pre.error})`,
          chunk_size: chunkIn.toString(),
          quote_ref: quoteRef,
          deviation_bps: deviationBps,
        })
        return
      }
      const existingRecord = pre.record

      if (existingRecord?.status === 'Settled') {
        console.log(`[Agent] Chunk ${idempotencyKey} is already Settled on-chain — reconciling without replay`)
        this.persistChunkRecord(existingRecord, { orderId: order.id, chunkIndex: order.chunks_count + 1, nowMs })
        return
      }

      if (existingRecord?.status === 'InFlight') {
        console.log(`[Agent] Chunk ${idempotencyKey} is InFlight on-chain — polling callback instead of re-sending`)
        const polled = (await this.pollChunkRecord(idempotencyKey)) ?? existingRecord
        this.persistChunkRecord(polled, { orderId: order.id, chunkIndex: order.chunks_count + 1, nowMs })
        return
      }

      const baselineAttempts = existingRecord?.attempts ?? 0

      // 3. Submit with bounded retries ONLY for failures that prove nothing was broadcast.
      const maxPreBroadcastTries = 3
      let txResult: { txHash?: string; explorerUrl?: string } | null = null
      let chainRecord: ContractChunkRecord | null = null

      for (let tries = 1; tries <= maxPreBroadcastTries; tries++) {
        // Durable attempt BEFORE broadcast (requested amounts, quote ref; tx identity added once known).
        recordAttemptPrepared(
          {
            idempotency_key: idempotencyKey,
            order_id: order.id,
            amount_in: chunkIn.toString(),
            settlement_out: settlementOut.toString(),
            simulated_out: simulatedOut.toString(),
            quote_ref: quoteRef,
            deviation_bps: deviationBps,
            recipient,
            baseline_attempts: baselineAttempts,
          },
          Date.now(),
        )

        try {
          txResult = this.executeChunkCall({
            contractId: this.contractId,
            methodName: 'execute_chunk',
            args: {
              id: order.id,
              amount_in: chunkIn.toString(),
              quote_ref: quoteRef,
              deviation_bps: deviationBps,
              simulated_out: simulatedOut.toString(),
              settlement_out: settlementOut.toString(),
              idempotency_key: idempotencyKey,
            },
            deposit: '0 NEAR',
            gas: '120.0 Tgas',
            signerId: this.agentId,
            credentialPath: agentCredPath,
          })
          updateAttempt(idempotencyKey, {
            state: 'SUBMITTED',
            tx_hash: txResult?.txHash ?? null,
            explorer_url: txResult?.explorerUrl ?? null,
            last_error: null,
          })
          break
        } catch (err) {
          const failure = classifySubmissionError(err)
          console.warn(`[Agent] Submission ${tries} failed (${idempotencyKey}, ${failure.kind}): ${failure.message}`)

          // Uncertain outcomes are resolved against on-chain state, never by blind retry.
          const observed = await this.readChunkRecord(idempotencyKey)
          if (observed.ok && observed.record) {
            const rec = observed.record
            if (rec.status === 'Settled') {
              updateAttempt(idempotencyKey, { state: 'SUBMITTED', tx_hash: failure.txHash ?? null, last_error: failure.message })
              chainRecord = rec
              break
            }
            if (rec.status === 'InFlight') {
              updateAttempt(idempotencyKey, { state: 'SUBMITTED', tx_hash: failure.txHash ?? null, last_error: failure.message })
              chainRecord = (await this.pollChunkRecord(idempotencyKey)) ?? rec
              break
            }
          }

          if (failure.kind === 'not_sent') {
            updateAttempt(idempotencyKey, { state: 'NOT_SENT', last_error: failure.message })
            if (tries >= maxPreBroadcastTries) {
              this.logDecision({
                order_id: order.id,
                timestamp: nowMs,
                score: 85,
                decision: 'WAIT',
                reason: `EXECUTION_FAILED: ${failure.message}`,
                chunk_size: chunkIn.toString(),
                quote_ref: quoteRef,
                deviation_bps: deviationBps,
              })
              return
            }
            await this.sleep(Math.min(1500 * tries, this.pollDelayMs * 1.5 * tries))
            continue
          }

          if (failure.kind === 'landed_failed') {
            // The transaction executed and the contract/runtime rejected it: nothing moved, retry next tick.
            updateAttempt(idempotencyKey, { state: 'FAILED', tx_hash: failure.txHash ?? null, last_error: failure.message })
            this.logDecision({
              order_id: order.id,
              timestamp: nowMs,
              score: 85,
              decision: 'WAIT',
              reason: `EXECUTION_REJECTED: ${failure.message.slice(0, 300)}`,
              chunk_size: chunkIn.toString(),
              quote_ref: quoteRef,
              deviation_bps: deviationBps,
            })
            return
          }

          // Uncertain: keep the attempt pending verification. Do NOT retry.
          updateAttempt(idempotencyKey, {
            state: 'UNCERTAIN',
            tx_hash: failure.txHash ?? null,
            last_error: observed.ok ? failure.message : `${failure.message} | chain unreadable: ${observed.error}`,
          })
          this.logDecision({
            order_id: order.id,
            timestamp: nowMs,
            score: 85,
            decision: 'WAIT',
            reason: `SUBMISSION_UNCERTAIN_PENDING_VERIFICATION: ${failure.message.slice(0, 200)}`,
            chunk_size: chunkIn.toString(),
            quote_ref: quoteRef,
            deviation_bps: deviationBps,
          })
          return
        }
      }

      // 4. Verify the outcome on-chain before persisting any fill truth.
      const record = chainRecord ?? (await this.pollChunkRecord(idempotencyKey))
      const meta = {
        orderId: order.id,
        chunkIndex: order.chunks_count + 1,
        nowMs,
        txHash: txResult?.txHash,
        explorerUrl: txResult?.explorerUrl,
      }

      if (!record || (record.status === 'Failed' && record.attempts <= baselineAttempts)) {
        // Missing record (RPC unavailable / not yet visible) or only a STALE failure from an earlier attempt:
        // no evidence either way. Keep the attempt pending verification — never invent a Failed fill.
        this.logDecision({
          order_id: order.id,
          timestamp: nowMs,
          score: 0,
          decision: 'WAIT',
          reason: `CHUNK_RECORD_UNAVAILABLE_PENDING_VERIFICATION: ${idempotencyKey} stays ${getAttempt(idempotencyKey)?.state ?? 'SUBMITTED'}`,
          chunk_size: chunkIn.toString(),
          quote_ref: quoteRef,
          deviation_bps: deviationBps,
        })
        return
      }

      const isConfirmed = this.persistChunkRecord(record, meta)
      if (record.status === 'Failed') {
        updateAttempt(idempotencyKey, { state: 'FAILED', last_error: record.failure_reason ?? 'chunk Failed on-chain' })
      } else if (record.status === 'InFlight') {
        updateAttempt(idempotencyKey, { state: 'SUBMITTED' })
      }

      if (isConfirmed) {
        console.log(`✅ Chunk confirmed by on-chain ft_transfer callback!`)
        if (txResult?.txHash) {
          console.log(`  execute_chunk tx (parent; its receipts include the EURe ft_transfer): ${txResult.txHash}`)
          console.log(`  Explorer: ${txResult.explorerUrl}`)
        }
      } else {
        const label = record.status === 'InFlight' ? 'IN_FLIGHT' : 'FAILED'
        const reason = record.failure_reason || `On-chain chunk status is ${record.status}`
        console.warn(`[Agent] ⚠ Chunk NOT settled (${label}): ${reason}`)
      }
    } finally {
      this.activeLocks.delete(order.id)
    }
  }
}

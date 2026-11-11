/**
 * GetNear Agent Runner — Autonomous Order Loop (P9)
 * Periodically polls FxBudget contract for Active orders, fetches live dry-quotes
 * and ECB reference rates, evaluates adaptive TWAP strategy, and executes chunks
 * on NEAR testnet using the restricted function-call access key.
 */

import { createHash } from 'node:crypto'
import { NearClient } from '@getnear/near-client'
import {
  OneClickQuoteSource,
  FrankfurterReferenceSource,
  computeDeviationBps,
  type QuoteSnapshot,
} from '@getnear/shared'
import {
  recordFill,
  recordDecision,
  type AgentFill,
  type AgentDecisionRecord,
} from './db.js'
import { findKeyCredentialPath, runCallFunction } from '../../../scripts/near/near-runner.js'

// Minimum route probe amount: $1.00 USDC (1_000_000 atomic units)
const ROUTE_MIN_IN = 1_000_000n

export function computeEuReAtomicOut(
  amountIn: bigint,
  simulatedOut: bigint,
  decimalsOut: number,
  rate: number,
): bigint {
  if (simulatedOut > 0n) {
    if (decimalsOut > 6) {
      const scaled = simulatedOut / 10n ** BigInt(decimalsOut - 6)
      if (scaled > 0n) return scaled
    } else if (decimalsOut < 6) {
      const scaled = simulatedOut * 10n ** BigInt(6 - decimalsOut)
      if (scaled > 0n) return scaled
    } else {
      return simulatedOut
    }
  }
  return BigInt(Math.max(1, Math.round((Number(amountIn) / 1e6) * rate * 1e6)))
}

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

export function computeSimulatedOutput(
  amountIn: bigint,
  quoteIn: bigint,
  quoteOut: bigint,
): bigint {
  if (quoteIn === 0n) return 0n
  return (amountIn * quoteOut) / quoteIn
}

export class AgentRunner {
  private client: NearClient
  private quoteSource: OneClickQuoteSource
  private refRateSource: FrankfurterReferenceSource
  private contractId: string
  private agentId: string
  private operatorId: string
  private eureId: string
  private cachedAgentCredPath?: string
  private activeLocks = new Set<number>()
  private isRunning = false
  private timer: NodeJS.Timeout | null = null
  private pollIntervalMs: number
  public totalChunksExecuted = 0
  public lastTickTime = 0
  public lastStatus = 'INITIALIZED'

  constructor(options?: {
    pollIntervalMs?: number
    contractId?: string
    agentId?: string
    rpcUrls?: string[]
  }) {
    this.pollIntervalMs = options?.pollIntervalMs || Number(process.env.AGENT_POLL_INTERVAL_MS || 10_000)
    this.operatorId = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
    this.contractId = options?.contractId || process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${this.operatorId}`
    this.agentId = options?.agentId || process.env.AGENT_ACCOUNT_ID || 'chilliroger-agent.testnet'
    this.eureId = process.env.EURE_CONTRACT_ID || `eure.${this.operatorId}`

    this.client = new NearClient({
      networkId: 'testnet',
      rpcUrls: options?.rpcUrls || ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
    })

    this.quoteSource = new OneClickQuoteSource()
    this.refRateSource = new FrankfurterReferenceSource()
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
    }
  }

  /**
   * Resolve the local credential file for the agent's restricted FunctionCall access key
   * (execute_chunk only on FX_BUDGET_CONTRACT_ID) so we never sign with a FullAccess key.
   */
  public async resolveAgentCredentialPath(): Promise<string | undefined> {
    if (this.cachedAgentCredPath) return this.cachedAgentCredPath
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

  private async pollChunkRecord(
    idempotencyKey: string,
    maxPolls = 6,
    delayMs = 1000,
  ): Promise<ContractChunkRecord | null> {
    for (let i = 0; i < maxPolls; i++) {
      try {
        const rec = await this.client.callView<ContractChunkRecord | null>(
          this.contractId,
          'get_chunk_record',
          { key: idempotencyKey },
        )
        if (rec && rec.status !== 'InFlight') {
          return rec
        }
        if (i === maxPolls - 1) {
          return rec
        }
      } catch {
        // Transient view RPC error; continue bounded polling
      }
      await new Promise((r) => setTimeout(r, delayMs))
    }
    return null
  }

  public start() {
    if (this.isRunning) return
    this.isRunning = true
    console.log(`[Agent] Starting autonomous order runner for ${this.contractId} (interval: ${this.pollIntervalMs}ms)`)
    this.tick()
    this.timer = setInterval(() => this.tick(), this.pollIntervalMs)
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
   * Single order execution tick — evaluates and processes all Active orders.
   */
  public async tick(): Promise<void> {
    this.lastTickTime = Date.now()
    try {
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

      // 3. List all orders and filter Active
      const orders = await this.client.callView<ContractOrder[]>(this.contractId, 'list_orders', {
        from_index: 0,
        limit: 100,
      })

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
        recordDecision({
          order_id: order.id,
          timestamp: nowMs,
          score: 0,
          decision: 'WAIT',
          reason: 'IN_FLIGHT_SETTLEMENT_PENDING',
          chunk_size: '0',
        })
        return
      }

      const remainingIn = totalIn - executedIn - pendingIn
      const remainingDueOut = targetOut > settledOut ? targetOut - settledOut : 0n

      if (remainingIn <= 0n || (targetOut > 0n && remainingDueOut === 0n)) {
        return
      }

      // Check deadline (expire_order is permissionless; run via operator so agent stays restricted to execute_chunk)
      if (nowNs >= BigInt(order.deadline_ns)) {
        console.log(`[Agent] Order #${order.id} deadline has passed. Expiring...`)
        runCallFunction({
          contractId: this.contractId,
          methodName: 'expire_order',
          args: { id: order.id },
          deposit: '0 NEAR',
          gas: '50.0 Tgas',
          signerId: this.operatorId,
        })
        recordDecision({
          order_id: order.id,
          timestamp: nowMs,
          score: 0,
          decision: 'WAIT',
          reason: 'DEADLINE_PASSED_EXPIRED',
          chunk_size: '0',
        })
        return
      }

      // Check min interval guard
      if (order.chunks_count > 0 && order.last_chunk_ns > 0) {
        const elapsedNs = nowNs - BigInt(order.last_chunk_ns)
        if (elapsedNs < minIntervalNs) {
          const waitSec = Number((minIntervalNs - elapsedNs) / 1_000_000_000n)
          recordDecision({
            order_id: order.id,
            timestamp: nowMs,
            score: 0,
            decision: 'WAIT',
            reason: `MIN_INTERVAL_WAITING (${waitSec}s remaining)`,
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
        recordDecision({
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
        recordDecision({
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
        recordDecision({
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

      // Execute Chunk on NEAR Testnet via FxBudget::execute_chunk (cross-contract NEP-141 payout + callback)
      const quoteRef = computeQuoteRef(quote.quoteId, quote.amountIn, quote.amountOut, nowMs)
      const decimalsOut = quote.decimalsOut ?? 18
      const simulatedOut = computeSimulatedOutput(
        candidateChunk,
        BigInt(quote.amountIn),
        BigInt(quote.amountOut),
      )

      let settlementOut = computeEuReAtomicOut(candidateChunk, simulatedOut, decimalsOut, quote.rate)
      if (targetOut > 0n && remainingDueOut > 0n && settlementOut > remainingDueOut) {
        settlementOut = remainingDueOut
      }

      const idempotencyKey = `order-${order.id}-seq-${order.chunks_count + 1}`
      const recipient = order.recipient || order.requester

      console.log(`\n[Agent] EXECUTING CHUNK for Order #${order.id} (key=${idempotencyKey}):`)
      console.log(`  Amount In (USDC budget): ${Number(candidateChunk) / 1e6} USDC`)
      console.log(`  Indicative Out (1Click decimals=${decimalsOut}): ${(Number(simulatedOut) / Math.pow(10, decimalsOut)).toFixed(4)} EURe`)
      console.log(`  Settlement Payout (6-dec EURe): ${Number(settlementOut) / 1e6} EURe -> ${recipient}`)
      console.log(`  Quote Rate: ${quote.rate.toFixed(4)} | Ref Rate: ${refRate.toFixed(4)} | Agent-Reported Dev: ${deviationBps} bps`)
      console.log(`  Quote Ref: ${quoteRef}`)

      const agentCredPath = await this.resolveAgentCredentialPath()
      if (!agentCredPath) {
        const msg = `Restricted FunctionCall credential for ${this.agentId} (${this.contractId}::execute_chunk) not found locally`
        console.error(`[Agent] ${msg}`)
        recordDecision({
          order_id: order.id,
          timestamp: nowMs,
          score: 0,
          decision: 'WAIT',
          reason: `RESTRICTED_KEY_MISSING: ${msg}`,
          chunk_size: candidateChunk.toString(),
          quote_ref: quoteRef,
          deviation_bps: deviationBps,
        })
        return
      }

      // Execute transaction with bounded retries (using ONLY the restricted execute_chunk key)
      let txResult: any = null
      let attempts = 0
      const maxAttempts = 3

      while (attempts < maxAttempts) {
        attempts++
        try {
          txResult = runCallFunction({
            contractId: this.contractId,
            methodName: 'execute_chunk',
            args: {
              id: order.id,
              amount_in: candidateChunk.toString(),
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
          break
        } catch (err: any) {
          const errMsg = err?.stderr || err?.message || String(err)
          console.warn(`[Agent] Attempt ${attempts} failed: ${errMsg}`)
          if (attempts >= maxAttempts) {
            recordDecision({
              order_id: order.id,
              timestamp: nowMs,
              score: 85,
              decision: 'WAIT',
              reason: `EXECUTION_FAILED: ${errMsg}`,
              chunk_size: candidateChunk.toString(),
              quote_ref: quoteRef,
              deviation_bps: deviationBps,
            })
            return
          }
          await new Promise((r) => setTimeout(r, 1500 * attempts))
        }
      }

      // Query on-chain callback-confirmed settlement status before persisting fill truth
      const chunkRecord = await this.pollChunkRecord(idempotencyKey)
      const isConfirmed = chunkRecord?.status === 'Settled'

      if (isConfirmed) {
        this.totalChunksExecuted++
        const fill: AgentFill = {
          order_id: order.id,
          chunk_index: order.chunks_count + 1,
          idempotency_key: idempotencyKey,
          amount_in: candidateChunk.toString(),
          settlement_out: chunkRecord.settlement_out || settlementOut.toString(),
          simulated_out: simulatedOut.toString(),
          recipient: chunkRecord.recipient || recipient,
          quote_ref: quoteRef,
          deviation_bps: deviationBps,
          tx_hash: txResult?.txHash,
          explorer_url: txResult?.explorerUrl,
          ft_transfer_tx_hash: txResult?.txHash,
          ft_transfer_url: txResult?.explorerUrl,
          settlement_status: 'CONFIRMED',
          is_simulated: false,
          timestamp: nowMs,
        }
        recordFill(fill)

        recordDecision({
          order_id: order.id,
          timestamp: nowMs,
          score: 88,
          decision: 'EXECUTE',
          reason: `CHUNK_SETTLED_ONCHAIN: ${Number(candidateChunk) / 1e6} USDC -> ${(Number(fill.settlement_out) / 1e6).toFixed(2)} EURe (${deviationBps} bps)`,
          chunk_size: candidateChunk.toString(),
          quote_ref: quoteRef,
          deviation_bps: deviationBps,
        })

        console.log(`✅ Chunk confirmed by on-chain ft_transfer callback!`)
        if (txResult?.txHash) {
          console.log(`  Tx Hash: ${txResult.txHash}`)
          console.log(`  Explorer: ${txResult.explorerUrl}`)
        }
      } else {
        const status = chunkRecord?.status === 'InFlight' ? 'IN_FLIGHT' : 'FAILED'
        const failureReason =
          chunkRecord?.failure_reason ||
          `On-chain chunk status is ${chunkRecord?.status || 'UNKNOWN'} — invoice balance unchanged`

        const fill: AgentFill = {
          order_id: order.id,
          chunk_index: order.chunks_count + 1,
          idempotency_key: idempotencyKey,
          amount_in: candidateChunk.toString(),
          settlement_out: chunkRecord?.settlement_out || settlementOut.toString(),
          simulated_out: simulatedOut.toString(),
          recipient,
          quote_ref: quoteRef,
          deviation_bps: deviationBps,
          tx_hash: txResult?.txHash,
          explorer_url: txResult?.explorerUrl,
          settlement_status: status,
          failure_reason: failureReason,
          is_simulated: true, // CRITICAL: Never label an unconfirmed/failed transfer non-simulated
          timestamp: nowMs,
        }
        recordFill(fill)

        recordDecision({
          order_id: order.id,
          timestamp: nowMs,
          score: 0,
          decision: status === 'FAILED' ? 'SETTLEMENT_FAILED_BALANCE_UNCHANGED' : 'WAIT',
          reason: failureReason,
          chunk_size: candidateChunk.toString(),
          quote_ref: quoteRef,
          deviation_bps: deviationBps,
        })

        console.warn(`[Agent] ⚠ Chunk NOT settled (${status}): ${failureReason}`)
      }
    } finally {
      this.activeLocks.delete(order.id)
    }
  }
}

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
import { runCallFunction } from '../../../scripts/near/near-runner.js'

// Minimum route probe amount: $1.00 USDC (1_000_000 atomic units)
const ROUTE_MIN_IN = 1_000_000n

export interface ContractOrder {
  id: number
  requester: string
  pair_label: string
  total_in: string
  executed_in: string
  max_chunk_in: string
  deadline_ns: number
  max_dev_bps: number
  status: 'Pending' | 'Active' | 'Completed' | 'Expired' | 'Cancelled'
  last_chunk_ns: number
  chunks_count: number
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
    const operator = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
    this.contractId = options?.contractId || process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${operator}`
    this.agentId = options?.agentId || process.env.AGENT_ACCOUNT_ID || 'chilliroger-agent.testnet'

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
      isRunning: this.isRunning,
      pollIntervalMs: this.pollIntervalMs,
      totalChunksExecuted: this.totalChunksExecuted,
      lastTickTime: this.lastTickTime,
      lastStatus: this.lastStatus,
      activeLocks: Array.from(this.activeLocks),
    }
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

      // Check remaining amount
      const totalIn = BigInt(order.total_in)
      const executedIn = BigInt(order.executed_in)
      const remainingIn = totalIn - executedIn

      if (remainingIn <= 0n) {
        return
      }

      // Check deadline
      if (nowNs >= BigInt(order.deadline_ns)) {
        console.log(`[Agent] Order #${order.id} deadline has passed. Expiring...`)
        runCallFunction({
          contractId: this.contractId,
          methodName: 'expire_order',
          args: { id: order.id },
          deposit: '0 NEAR',
          gas: '50.0 Tgas',
          signerId: this.agentId,
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

      // Execute Chunk on NEAR Testnet
      const quoteRef = computeQuoteRef(quote.quoteId, quote.amountIn, quote.amountOut, nowMs)
      const simulatedOut = computeSimulatedOutput(
        candidateChunk,
        BigInt(quote.amountIn),
        BigInt(quote.amountOut),
      )

      console.log(`\n[Agent] 🚀 EXECUTING CHUNK for Order #${order.id}:`)
      console.log(`  Amount In: ${Number(candidateChunk) / 1e6} USDC`)
      console.log(`  Simulated Out: ${(Number(simulatedOut) / Math.pow(10, quote.decimalsOut ?? 18)).toFixed(4)} EURe`)
      console.log(`  Quote Rate: ${quote.rate.toFixed(4)} | Ref Rate: ${refRate.toFixed(4)} | Dev: ${deviationBps} bps`)
      console.log(`  Quote Ref: ${quoteRef}`)

      // Execute transaction with bounded retries
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
            },
            deposit: '0 NEAR',
            gas: '100.0 Tgas',
            signerId: this.agentId,
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

      this.totalChunksExecuted++

      // Record fill with strict simulated provenance
      const fill: AgentFill = {
        order_id: order.id,
        chunk_index: order.chunks_count + 1,
        amount_in: candidateChunk.toString(),
        simulated_out: simulatedOut.toString(),
        quote_ref: quoteRef,
        deviation_bps: deviationBps,
        tx_hash: txResult?.txHash,
        explorer_url: txResult?.explorerUrl,
        is_simulated: true, // Strictly simulated per hackathon rules
        timestamp: nowMs,
      }
      recordFill(fill)

      recordDecision({
        order_id: order.id,
        timestamp: nowMs,
        score: 88,
        decision: 'EXECUTE',
        reason: `CHUNK_EXECUTED: ${Number(candidateChunk) / 1e6} USDC (${deviationBps} bps)`,
        chunk_size: candidateChunk.toString(),
        quote_ref: quoteRef,
        deviation_bps: deviationBps,
      })

      console.log(`✅ Chunk successfully executed and persisted!`)
      if (txResult?.txHash) {
        console.log(`  Tx Hash: ${txResult.txHash}`)
        console.log(`  Explorer: ${txResult.explorerUrl}`)
      }
    } finally {
      this.activeLocks.delete(order.id)
    }
  }
}

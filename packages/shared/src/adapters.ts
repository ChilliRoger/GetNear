/**
 * GetNear core adapter interfaces
 */

import type { QuoteSnapshot } from './domain.js'

// 1. Quote Source
export interface QuoteRequest {
  fromToken: string
  toToken: string
  amountIn: string
  slippageToleranceBps?: number
  dry?: boolean
  recipient?: string
  refundTo?: string
  decimalsIn?: number
  decimalsOut?: number
}

export interface QuoteResult extends QuoteSnapshot {}

export interface QuoteSource {
  getQuote(request: QuoteRequest): Promise<QuoteResult>
}

// 2. Reference Rate Source
export interface ReferenceRate {
  pair: string
  rate: number
  timestamp: number
  source: string
}

export interface ReferenceRateSource {
  getReferenceRate(pair: string): Promise<ReferenceRate>
}

// 3. Executor
export interface ExecutionRequest {
  orderId: string
  amountIn: string
  quoteRef: string
  deviationBps: number
  simulatedOut: string
}

export interface ExecutionResult {
  success: boolean
  txHash: string
  amountIn: string
  simulatedOut: string
  executedAt: number
  isSimulated: true
}

export interface Executor {
  executeChunk(request: ExecutionRequest): Promise<ExecutionResult>
}

// 4. Approval Gate
export interface ApprovalRequest {
  orderId: string
  totalIn: string
  requester: string
}

export interface ApprovalStatus {
  orderId: string
  approved: boolean
  proposalId?: string
  votesFor: number
  votesAgainst: number
  requiredVotes: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
}

export interface ApprovalGate {
  requestApproval(request: ApprovalRequest): Promise<ApprovalStatus>
  checkApproval(orderId: string): Promise<ApprovalStatus>
}

// ─── MOCK IMPLEMENTATIONS ──────────────────────────────────────────

/**
 * GetNear Core Domain Interfaces & Mock Adapters
 *
 * Replaces upstream EVM / CRE / Arc / Base dependencies with explicit interfaces.
 * When GETNEAR_MODE === 'mock', mock implementations provide deterministic seeded behavior.
 */

// 1. Quote Source
export interface QuoteRequest {
  fromToken: string
  toToken: string
  amountIn: string
  slippageToleranceBps?: number
}

export interface QuoteResult {
  quoteId: string
  fromToken: string
  toToken: string
  amountIn: string
  amountOut: string
  rate: number
  quotedAt: number
  expiresAt: number
  source: string
}

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

/**
 * MOCK QuoteSource
 * Returns deterministic quotes for USDC -> EURC (~0.925 rate, EUR/USD ~1.08)
 */
export class MockQuoteSource implements QuoteSource {
  private baseRate: number

  constructor(baseRate = 0.9259) {
    this.baseRate = baseRate
  }

  async getQuote(request: QuoteRequest): Promise<QuoteResult> {
    const amountInNum = Number(request.amountIn)
    // Small deterministic jitter based on timestamp
    const jitter = ((Date.now() % 1000) / 1000 - 0.5) * 0.002
    const currentRate = this.baseRate + jitter
    const amountOutNum = Math.floor(amountInNum * currentRate)

    return {
      quoteId: `mock_quote_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fromToken: request.fromToken,
      toToken: request.toToken,
      amountIn: request.amountIn,
      amountOut: amountOutNum.toString(),
      rate: currentRate,
      quotedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      source: 'MOCK (Simulated 1Click)',
    }
  }
}

/**
 * MOCK ReferenceRateSource
 * Returns mid EUR/USD reference rate (~1.0800)
 */
export class MockReferenceRateSource implements ReferenceRateSource {
  private refRate: number

  constructor(refRate = 1.0800) {
    this.refRate = refRate
  }

  async getReferenceRate(pair: string): Promise<ReferenceRate> {
    return {
      pair,
      rate: this.refRate,
      timestamp: Date.now(),
      source: 'MOCK (Simulated ECB Ref)',
    }
  }
}

/**
 * MOCK Executor
 * Returns simulated execution receipt with mock NEAR tx hash
 */
export class MockExecutor implements Executor {
  async executeChunk(request: ExecutionRequest): Promise<ExecutionResult> {
    return {
      success: true,
      txHash: `mock_near_tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      amountIn: request.amountIn,
      simulatedOut: request.simulatedOut,
      executedAt: Date.now(),
      isSimulated: true,
    }
  }
}

/**
 * MOCK ApprovalGate
 * Simulates Sputnik DAO 2-of-3 council approval flow
 */
export class MockApprovalGate implements ApprovalGate {
  private proposals = new Map<string, ApprovalStatus>()

  async requestApproval(request: ApprovalRequest): Promise<ApprovalStatus> {
    const proposal: ApprovalStatus = {
      orderId: request.orderId,
      approved: false,
      proposalId: `mock_prop_${Date.now()}`,
      votesFor: 0,
      votesAgainst: 0,
      requiredVotes: 2,
      status: 'PENDING',
    }
    this.proposals.set(request.orderId, proposal)
    return proposal
  }

  async checkApproval(orderId: string): Promise<ApprovalStatus> {
    const existing = this.proposals.get(orderId)
    if (existing) return existing

    return {
      orderId,
      approved: true,
      votesFor: 2,
      votesAgainst: 0,
      requiredVotes: 2,
      status: 'APPROVED',
    }
  }

  castVote(orderId: string, approve: boolean): ApprovalStatus {
    const prop = this.proposals.get(orderId)
    if (!prop) throw new Error(`Proposal for order ${orderId} not found`)
    if (approve) {
      prop.votesFor++
      if (prop.votesFor >= prop.requiredVotes) {
        prop.approved = true
        prop.status = 'APPROVED'
      }
    } else {
      prop.votesAgainst++
      if (prop.votesAgainst > 1) {
        prop.status = 'REJECTED'
      }
    }
    return prop
  }
}

/**
 * GetNear — Simulated Contract Read Helpers (P2 Mock State)
 *
 * All fills and contract reads are SIMULATED.
 * In P2 (Mock), returns deterministic mock state without blockchain RPC.
 * In P4/P7/P8, this will be connected to packages/near-client and FxBudget contract views.
 */

export interface TreasuryBalances {
  usdcBal: bigint | null
  eurcBal: bigint | null
}

export interface TreasuryPolicy {
  threshold: bigint | null
  rateMin: bigint | null
  rateMax: bigint | null
  version: bigint | null
}

export interface ActivePendingTrade {
  tradeId: string
  fromAmount: bigint
  toAmount: bigint
  exchangeRate: bigint
  createdAt: bigint
  expiresAt: bigint
  status: number
  approvedBy?: string
  approvedAt?: bigint
}

// --- Read helpers ---

export async function fetchBalances(): Promise<TreasuryBalances> {
  // In mock mode, return realistic testnet treasury balances
  return {
    usdcBal: 250_000_000_000n, // $250,000 USDC (6 decimals)
    eurcBal: 120_000_000_000n, // 120,000 EURC (6 decimals)
  }
}

export async function fetchPolicy(): Promise<TreasuryPolicy> {
  return {
    threshold: 500_000_000n,    // $500 auto-cap (6 decimals)
    rateMin: 1_050_000_000_000_000_000n, // 1.05 min rate (18 decimals)
    rateMax: 1_120_000_000_000_000_000n, // 1.12 max rate (18 decimals)
    version: 1n,
  }
}

interface PendingTradeApiRecord {
  id: string
  input_amount?: string
  desired_output?: string
  created_at?: number
  deadline?: number
}

export async function fetchPendingTrades(): Promise<ActivePendingTrade[]> {
  try {
    const res = await fetch('/api/oracle/api/trades?status=PENDING')
    if (!res.ok) return []
    const orders: PendingTradeApiRecord[] = await res.json()
    return orders.map((o) => ({
      tradeId: o.id,
      fromAmount: BigInt(o.input_amount || '0'),
      toAmount: BigInt(o.desired_output || '0'),
      exchangeRate: 1_080_000_000_000_000_000n,
      createdAt: BigInt(o.created_at || Math.floor(Date.now() / 1000)),
      expiresAt: BigInt(o.deadline || Math.floor(Date.now() / 1000) + 3600),
      status: 0, // Pending
    }))
  } catch {
    return []
  }
}

export async function fetchTreasuryBalances(): Promise<TreasuryBalances> {
  return fetchBalances()
}

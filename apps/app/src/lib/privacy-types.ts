/**
 * Frontend type re-exports and hook contracts for the Privacy Treasury v2.
 *
 * All API shapes come from the shared package; this file adds
 * React-hook return types consumed by UI components.
 */

export type {
  MintRequest,
  MintResponse,
  PublicBalancesResponse,
  ShieldedBalancesResponse,
  ShieldRequest,
  ShieldResponse,
  UnshieldRequest,
  UnshieldResponse,
  PrivateSwapRequest,
  PrivateSwapResponse,
  SwapEstimateResponse,
  ShieldTransaction,
  ShieldHistoryResponse,
  SepoliaToken,
} from '@getnear/shared'

import type {
  PublicBalancesResponse,
  ShieldedBalancesResponse,
  ShieldTransaction,
} from '@getnear/shared'

// ── Frontend hook return types ────────────────────────────────────────

export interface UsePublicBalances {
  data: PublicBalancesResponse | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export interface UseShieldedBalances {
  data: ShieldedBalancesResponse | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export interface UseShieldHistory {
  data: ShieldTransaction[]
  loading: boolean
  error: string | null
  refetch: () => void
}

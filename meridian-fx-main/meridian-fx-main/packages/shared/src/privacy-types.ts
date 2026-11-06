/**
 * Privacy Treasury v2 — Integration Contracts
 *
 * Every API route, DB row shape, and frontend hook is typed here.
 * Subsequent agents implement against these locked interfaces.
 */

import { SEPOLIA_TOKENS } from './sepolia-tokens'

// Re-export so consumers only need one import
export type { SepoliaToken } from './sepolia-tokens'

// ── API Request / Response Contracts ────────────────────────────────

// POST /api/privacy/mint
export interface MintRequest {
  token: keyof typeof SEPOLIA_TOKENS
  amount: string // raw units
}
export interface MintResponse {
  ok: boolean
  txHash: string
  token: string
  amount: string
}

// GET /api/privacy/balances/public
export interface PublicBalancesResponse {
  address: string // deployer wallet address
  balances: Array<{
    token: keyof typeof SEPOLIA_TOKENS
    symbol: string
    balance: string   // raw units
    decimals: number
    displayBalance: string // human-readable
  }>
}

// GET /api/privacy/balances/shielded
export interface ShieldedBalancesResponse {
  unlinkAddress: string
  balances: Array<{
    token: string   // token contract address
    symbol: string
    amount: string  // raw units
    displayAmount: string
  }>
}

// POST /api/privacy/shield
export interface ShieldRequest {
  token: keyof typeof SEPOLIA_TOKENS
  amount: string // raw units
}
export interface ShieldResponse {
  ok: boolean
  shieldTxId: string   // Unlink transaction ID
  evmTxHash: string    // on-chain approval/deposit tx
  explorerUrl: string
  status: 'pending' | 'confirmed' | 'failed'
}

// POST /api/privacy/unshield
export interface UnshieldRequest {
  token: string   // token contract address
  amount: string  // raw units
  recipientAddress?: string // defaults to deployer
}
export interface UnshieldResponse {
  ok: boolean
  unshieldTxId: string
  evmTxHash: string
  explorerUrl: string
  status: 'pending' | 'confirmed' | 'failed'
}

// POST /api/privacy/swap
export interface PrivateSwapRequest {
  tokenIn: string   // token contract address
  tokenOut: string  // token contract address
  amountIn: string  // raw units
}
export interface PrivateSwapResponse {
  ok: boolean
  estimatedOutput: string
  txId: string
  status: 'pending' | 'confirmed' | 'failed'
  steps: Array<{
    step: 'withdraw' | 'swap' | 'deposit'
    status: string
    txHash?: string
  }>
}

// GET /api/privacy/shield/history
export interface ShieldTransaction {
  id: number
  direction: 'shield' | 'unshield'
  token: string
  tokenSymbol: string
  amount: string
  displayAmount: string
  txHash: string | null
  unlinkTxId: string | null
  explorerUrl: string | null
  status: 'pending' | 'confirmed' | 'failed'
  createdAt: number // unix timestamp
}
export interface ShieldHistoryResponse {
  transactions: ShieldTransaction[]
}

// GET /api/privacy/swap/estimate
export interface SwapEstimateRequest {
  tokenIn: string
  tokenOut: string
  amountIn: string
}
export interface SwapEstimateResponse {
  estimatedOutput: string
  rate: number
  source: 'mainnet-oracle' | 'pool-quote'
  priceImpactBps: number | null
}

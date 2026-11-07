/**
 * GetNear Utility Helpers (P3)
 *
 * - yocto/atomic-unit helpers for NEAR amounts
 * - Nanosecond ↔ millisecond time helpers
 * - Basis-point math
 * - Testnet explorer link builders (testnet.nearblocks.io)
 */

// ── NEAR Amount Helpers ──────────────────────────────────────────────

/** 1 NEAR = 10^24 yoctoNEAR */
export const YOCTO_PER_NEAR = 10n ** 24n

/** Convert NEAR (human, as number) to yoctoNEAR (bigint string) */
export function nearToYocto(near: number): string {
  const yocto = BigInt(Math.floor(near * 1e12)) * (YOCTO_PER_NEAR / 10n ** 12n)
  return yocto.toString()
}

/** Convert yoctoNEAR string to human NEAR (number, up to 6 decimals) */
export function yoctoToNear(yocto: string): number {
  const y = BigInt(yocto)
  const whole = y / YOCTO_PER_NEAR
  const remainder = y % YOCTO_PER_NEAR
  const fractional = Number(remainder) / Number(YOCTO_PER_NEAR)
  return Number(whole) + fractional
}

/** Format yoctoNEAR for display, e.g. "2.5 NEAR" */
export function formatNear(yocto: string, decimals = 4): string {
  return `${yoctoToNear(yocto).toFixed(decimals)} NEAR`
}

// ── Stablecoin Amount Helpers (6 decimals) ───────────────────────────

/** 1 USDC or EURC = 10^6 atomic units */
export const ATOMIC_PER_STABLECOIN = 1_000_000n

/** Convert human stablecoin amount to atomic units bigint */
export function stablecoinToAtomic(amount: number): bigint {
  return BigInt(Math.floor(amount * 1_000_000))
}

/** Convert atomic units string to human amount */
export function atomicToStablecoin(atomic: string): number {
  return Number(BigInt(atomic)) / 1_000_000
}

/** Format atomic units for display, e.g. "100.00 USDC" */
export function formatStablecoin(atomic: string, symbol = 'USDC', decimals = 2): string {
  return `${atomicToStablecoin(atomic).toFixed(decimals)} ${symbol}`
}

// ── Nanosecond Time Helpers ──────────────────────────────────────────

/** 1 second in nanoseconds */
export const NS_PER_SECOND = 1_000_000_000n
/** 1 millisecond in nanoseconds */
export const NS_PER_MS = 1_000_000n

/** Convert Unix milliseconds to NEAR nanosecond timestamp string */
export function msToNs(ms: number): string {
  return (BigInt(ms) * NS_PER_MS).toString()
}

/** Convert NEAR nanosecond timestamp string to Unix milliseconds */
export function nsToMs(ns: string): number {
  return Number(BigInt(ns) / NS_PER_MS)
}

/** Current time as NEAR nanosecond timestamp string */
export function nowNs(): string {
  return msToNs(Date.now())
}

/** Convert seconds offset to nanoseconds string (for deadline calculations) */
export function secondsFromNowNs(seconds: number): string {
  return msToNs(Date.now() + seconds * 1_000)
}

/** Human-readable time remaining from nanosecond deadline */
export function timeRemainingHuman(deadlineNs: string): string {
  const remainMs = nsToMs(deadlineNs) - Date.now()
  if (remainMs <= 0) return 'expired'
  const mins = Math.floor(remainMs / 60_000)
  const secs = Math.floor((remainMs % 60_000) / 1_000)
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

// ── Basis-Point Math ─────────────────────────────────────────────────

/**
 * Compute deviation in basis points between quote rate and reference rate.
 * Positive = quote is better than reference (agent gets more output per input).
 * Sign convention: (quoteRate - referenceRate) / referenceRate * 10_000
 */
export function computeDeviationBps(quoteRate: number, referenceRate: number): number {
  if (referenceRate <= 0) throw new Error('referenceRate must be positive')
  return Math.round(((quoteRate - referenceRate) / referenceRate) * 10_000)
}

/** Convert basis points to a percentage string, e.g. 25 bps → "0.25%" */
export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`
}

/** Apply basis-point fee to an amount, returning reduced amount */
export function applyBpsFee(amount: bigint, feeBps: number): bigint {
  return (amount * BigInt(10_000 - feeBps)) / 10_000n
}

// ── Testnet Explorer Link Builders ───────────────────────────────────

const EXPLORER_BASE = 'https://testnet.nearblocks.io'

/** Build explorer link for a transaction hash */
export function explorerTxUrl(txHash: string, explorerBase = EXPLORER_BASE): string {
  return `${explorerBase}/txns/${txHash}`
}

/** Build explorer link for an account */
export function explorerAccountUrl(accountId: string, explorerBase = EXPLORER_BASE): string {
  return `${explorerBase}/address/${accountId}`
}

/** Build explorer link for a contract method call result (transaction) */
export function explorerContractTxUrl(txHash: string, explorerBase = EXPLORER_BASE): string {
  return explorerTxUrl(txHash, explorerBase)
}


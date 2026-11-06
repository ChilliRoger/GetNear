export const DISPLAY_MULTIPLIER = 1

export function formatDisplayAmount(rawAmount: bigint, currency = 'USD'): string {
  const realUsd = Number(rawAmount) / 1e6
  const displayUsd = realUsd * DISPLAY_MULTIPLIER
  return displayUsd.toLocaleString('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  })
}

export function displayToRaw(displayAmount: number): bigint {
  const realAmount = displayAmount / DISPLAY_MULTIPLIER
  return BigInt(Math.floor(realAmount * 1e6))
}

// Contract minimum
export const MIN_TRADE_AMOUNT = 1_000_000n // 1 USD stablecoin (6 decimals)

// Supported testnet pairs for GetNear
export const SUPPORTED_PAIRS = ['USDC/EURC', 'EURC/USDC'] as const
export type SupportedPair = typeof SUPPORTED_PAIRS[number]

// Default network mode
export const DEFAULT_NETWORK = 'testnet' as const

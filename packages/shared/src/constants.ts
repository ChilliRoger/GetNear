export function formatDisplayAmount(rawAmount: bigint, currency = 'USD'): string {
  const realUsd = Number(rawAmount) / 1e6
  const displayUsd = realUsd
  return displayUsd.toLocaleString('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  })
}

export function displayToRaw(displayAmount: number): bigint {
  return BigInt(Math.floor(displayAmount * 1e6))
}

// Contract minimum
export const MIN_TRADE_AMOUNT = 1_000_000n // 1 USD stablecoin (6 decimals)

// Supported testnet pairs for GetNear
export const SUPPORTED_PAIRS = ['USDC/EURe'] as const
export type SupportedPair = typeof SUPPORTED_PAIRS[number]

// Default network mode
export const DEFAULT_NETWORK = 'testnet' as const

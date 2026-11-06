import { formatDisplayAmount } from "@getnear/shared";

// Re-export from shared as the single source of truth
export { formatDisplayAmount };

/**
 * Format a raw 6-decimal string amount for display.
 */
export function formatDisplayAmountFromString(
  rawAmount: string,
  currency = "USD"
): string {
  return formatDisplayAmount(BigInt(rawAmount), currency);
}

/**
 * Format basis points as a percentage string.
 */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/**
 * Format a rate from X18 string to human-readable.
 */
export function formatRateX18(rateX18: string): string {
  return (Number(rateX18) / 1e18).toFixed(4);
}

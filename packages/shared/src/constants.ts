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

// Token addresses (Base mainnet)
export const TOKENS = {
  USDC_BASE: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  EURC_BASE: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42',
  WETH_BASE: '0x4200000000000000000000000000000000000006',
} as const

// Deployed contract addresses
export const CONTRACTS = {
  SWAP_EXECUTOR_BASE: '0xBcA2be0dCe857a936b4660538A9CCdDcB7aE92fF',
  TREASURY_VAULT_ARC: '0x75a1ff87d9369fefeb2914bd6cc69296f7ebd997',
  MOCK_USDC_ARC: '0x4Fa3A73189DaC96f6D44cf67f25301E010C78BB7',
  MOCK_EURC_ARC: '0xe022c7abF67DD1C99D679f6C7f5912bb4404D956',
} as const

// Chain IDs
export const CHAINS = {
  BASE_MAINNET: 8453,
  ARC_TESTNET: 5042002,
} as const

// Uniswap
export const UNISWAP = {
  ROUTER_BASE: '0x2626664c2603336E57B271c5C0b26F421741e481', // V3 SwapRouter02
  POOL_FEE: 500, // 0.05% fee tier for stablecoins
} as const

// Contract minimum
export const MIN_TRADE_AMOUNT = 1_000_000n // $1 real USDC (1e6)

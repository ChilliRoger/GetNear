/**
 * Base Sepolia token metadata and network constants.
 */

export const SEPOLIA_TOKENS = {
  USDC:  '0x4Fa3A73189DaC96f6D44cf67f25301E010C78BB7',
  EURC:  '0xe022c7abF67DD1C99D679f6C7f5912bb4404D956',
  WBTC:  '0x96371C8851C6bc00EB3E211c20eb9F02B1Ec8E23',
  WETH:  '0xB261461F7D6F6B7Bcdab8Fb082acD91DFC94F69E',
  ULNKm: '0x7501de8ea37a21e20e6e65947d2ecab0e9f061a7',
} as const

export type SepoliaToken = keyof typeof SEPOLIA_TOKENS

export const SEPOLIA_TOKEN_META = {
  USDC:  { address: SEPOLIA_TOKENS.USDC,  decimals: 6,  symbol: 'USDC'  },
  EURC:  { address: SEPOLIA_TOKENS.EURC,  decimals: 6,  symbol: 'EURC'  },
  WBTC:  { address: SEPOLIA_TOKENS.WBTC,  decimals: 8,  symbol: 'WBTC'  },
  WETH:  { address: SEPOLIA_TOKENS.WETH,  decimals: 18, symbol: 'WETH'  },
  ULNKm: { address: SEPOLIA_TOKENS.ULNKm, decimals: 18, symbol: 'ULNKm' },
} as const

export const BASE_SEPOLIA_EXPLORER = 'https://sepolia.basescan.org'
export const DEPLOYER_ADDRESS = '0xB60679110E14D2291f8105EF002A49809cfB283b'

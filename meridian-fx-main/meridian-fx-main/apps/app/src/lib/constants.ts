/** Bank wire fee in basis points (1.30%) */
export const BANK_FEE_BPS = 130;

/** DEX swap fee in basis points (0.05%) */
export const DEX_FEE_BPS = 5;

/** Estimated savings in basis points (bank fee minus DEX fee) */
export const SAVINGS_BPS = BANK_FEE_BPS - DEX_FEE_BPS;

# packages/shared -- @meridian/shared

Shared TypeScript types and constants for all Meridian tracks.

## What This Package Does

Provides the single source of truth for types, token addresses, chain IDs, and utility functions. Every other package in the monorepo imports from here. There is no build step -- consumers import directly from `src/`.

## Files

- `src/types.ts` -- All shared interfaces (QuoteSnapshot, TradeDecision, PendingTrade, ExecutionReceipt, ExecutionContext, ApprovalSession)
- `src/constants.ts` -- DISPLAY_MULTIPLIER, TOKENS, CHAINS, UNISWAP, MIN_TRADE_AMOUNT, formatDisplayAmount(), displayToRaw()
- `src/index.ts` -- Re-exports everything

## Rules

### 1. Never add single-track types here
If a type is only used by one track (e.g., a UI component prop type), keep it in that track's codebase. This package is for types that cross track boundaries.

### 2. Types must match Solidity enums exactly
`TradeStatus` in types.ts must mirror the `TradeStatus` enum in TreasuryVault.sol:
```
Solidity:  enum TradeStatus { PENDING, APPROVED, EXECUTED, REJECTED }
TypeScript: type TradeStatus = 'PENDING' | 'APPROVED' | 'EXECUTED' | 'REJECTED'
```
If you add or remove a status in one, update the other in the same commit.

### 3. Exchange rates use 18 decimals
All rate fields end in `X18` (e.g., `exchangeRateX18`) and store 18-decimal string values. This matches the contract convention of using `ether` units for rates.

### 4. Amount fields are BigNumber strings
All token amount fields (`fromAmount`, `toAmount`, `threshold`) are string representations of BigInt values with 6 decimal precision (matching USDC/EURC decimals).

### 5. Display multiplier is x1M
`DISPLAY_MULTIPLIER = 1_000_000`. Always use `formatDisplayAmount()` for UI display and `displayToRaw()` for converting user input back to raw amounts. Never hardcode the multiplier elsewhere.

### 6. Token addresses are canonical
The `TOKENS` constant is the single source of truth for token addresses. Do not hardcode addresses in other packages -- import from here.

### 7. Import pattern
```typescript
import { QuoteSnapshot, TradeDecision, TOKENS, CHAINS, MIN_TRADE_AMOUNT } from '@meridian/shared'
```

## Adding a New Type

1. Add the interface to `src/types.ts`
2. Ensure it is re-exported via `src/index.ts` (the barrel file already does `export * from './types'`)
3. Run `pnpm typecheck` from this directory to verify
4. If the type corresponds to a Solidity struct or enum, verify alignment with the contract
5. Commit with a message explaining which tracks will consume the new type

## Constants Quick Reference

| Constant | Value | Note |
|----------|-------|------|
| DISPLAY_MULTIPLIER | 1,000,000 | UI display scaling |
| MIN_TRADE_AMOUNT | 1,000,000n | $1 real USDC |
| CHAINS.BASE_MAINNET | 8453 | |
| UNISWAP.ROUTER_BASE | 0x2626...e481 | V3 SwapRouter02 |
| UNISWAP.POOL_FEE | 500 | 0.05% stablecoin tier |

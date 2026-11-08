# 1Click Route Minimums (USDC → EURe)

*Generated on 2026-11-08T06:57:20.459Z via `scripts/quotes/probe-minimums.ts`*
*Pair: USDC (`nep141:17208628f8...`) → EURe (`nep141:gnosis-0x420ca...`)*

## Summary of Findings

- **Tested Amount Ladder**: $1, $5, $10, $50, $100, $500, $1,000, $5,000 USD
- **Minimum Observed Feasible Chunk Size**: **$1 USD**
- **Recommended Strategy Engine Minimum Chunk**: **$5.00 USDC** (5,000,000 atomic units) to account for market depth and fee coverage.

## Detailed Probe Results

| Input USD | Atomic Units (USDC) | Status | Output EURe | Effective Rate (EUR/USD) | Latency / Time Est | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| $1 | `1000000` | ✅ OK | 0.887568787079686731 EURe | 0.88757 | 10s | Valid market maker quote |
| $5 | `5000000` | ✅ OK | 4.437826781514561991 EURe | 0.88757 | 10s | Valid market maker quote |
| $10 | `10000000` | ✅ OK | 8.875610623018295633 EURe | 0.88756 | 10s | Valid market maker quote |
| $50 | `50000000` | ✅ OK | 44.376324376831162312 EURe | 0.88753 | 10s | Valid market maker quote |
| $100 | `100000000` | ✅ OK | 88.748270455993849799 EURe | 0.88748 | 10s | Valid market maker quote |
| $500 | `500000000` | ✅ OK | 443.554085647887779837 EURe | 0.88711 | 10s | Valid market maker quote |
| $1000 | `1000000000` | ✅ OK | 886.56978375652587839 EURe | 0.88657 | 10s | Valid market maker quote |
| $5000 | `5000000000` | ✅ OK | 4365.50178048893314098 EURe | 0.87310 | 10s | Valid market maker quote |

## Implications for GetNear Architecture

1. **Chunk Clamping**:
   - The strategy engine (P6) must ensure every chunk is at least **$5.00 USDC** (5,000,000 atomic units).
   - If an order's remaining balance is less than $5.00, it should either be filled in a final sweep chunk or flagged.
2. **Auto-Cap & TWAP**:
   - For an order of $100 USDC with 10 chunks, each chunk is $10 USDC, well above the route minimum.
   - For smaller orders ($10–$20), the strategy should use 2–4 chunks of $5.00.
3. **Dry-Quote Verification**:
   - All probes were executed with `dry: true` in accordance with hackathon rules (no real assets spent).

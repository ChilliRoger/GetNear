# GetNear — Privacy for Treasury FX

## Why Privacy Matters

Corporate treasuries executing foreign exchange on public blockchains face a fundamental problem: **every swap is visible to the entire world**.

When a treasury wallet converts $50M/year in USDC to EURC through Uniswap, that activity is fully transparent on-chain. MEV bots detect large trades before they settle and extract value through front-running and sandwich attacks. Competitors monitor treasury wallets to reverse-engineer FX strategy, hedging positions, and cash flow timing. Analysts link wallet addresses to corporate entities and publish trade-by-trade breakdowns.

For a CFO moving millions in stablecoins, this is the equivalent of broadcasting every wire transfer on a public billboard. No traditional bank would operate this way — and neither should on-chain treasury operations.

## What GetNear Does

GetNear integrates the [Unlink SDK](https://www.unlink.xyz/) to give treasuries **selective privacy** for on-chain swaps. The Unlink protocol wraps swap execution so that the treasury's identity is dissociated from the trade — the swap still happens on-chain, transparently, but nobody can link it back to the treasury wallet.

This is not about hiding transactions. It is about hiding **who** is behind them.

## How It Works

A private swap follows three steps:

1. **Deposit** — The treasury deposits tokens into the Unlink privacy pool. This is a standard transfer to the pool contract.
2. **Execute** — The swap is executed from the Unlink pool address, not the treasury wallet. On-chain, the sender is the pool (`0x647f...0482`), not the treasury. A ZK proof validates the treasury's right to execute without revealing its identity.
3. **Withdraw** — Swapped tokens are withdrawn from the pool back to the treasury.

The key insight: between deposit and withdrawal, the on-chain sender for the swap is the Unlink pool — not the treasury. An observer sees a swap happening on Uniswap V3, but cannot determine which depositor initiated it.

## What's Hidden vs. What's Visible

| Attribute | Normal Swap | Private Swap (Unlink) |
|-----------|-------------|----------------------|
| Sender address | Treasury wallet (visible) | Unlink pool (treasury hidden) |
| Swap amount | Visible | Visible |
| Tokens traded | Visible | Visible |
| Target DEX | Visible | Visible |
| Audit trail | On-chain | On-chain (Arc L1) |

This design is intentional. Amounts, tokens, and the target DEX remain visible — this preserves on-chain compliance and auditability. What changes is the **identity link**: observers cannot connect the swap to the originating treasury. The trade happens on-chain, but nobody can link it back to the treasury wallet.

## Technical Integration

- **SDK**: `@unlink-xyz/sdk` (`0.0.2-canary.0`)
- **Network**: Base Sepolia (chain 84532, production-path ready)
- **Pool address**: `0x647f...0482`
- **Privacy sidecar**: Runs alongside the GetNear oracle server, proxied through the app's API routes
- **Frontend**: Dedicated "Private Treasury" tab with deposit/execute/withdraw progress tracking

## On-Chain Proof (Base Sepolia)

These transactions prove the full shield/unshield/private-swap flow is working end-to-end.

| # | Direction | Token | Amount | Unlink Tx ID | EVM Tx Hash | Explorer |
|---|-----------|-------|--------|-------------|-------------|----------|
| 1 | Shield | EURC | 1,000,067 | `3eab4d38-08cf-49af-92bb-b294a7e27c12` | `0xeb96a29a...2b603d` | [Basescan](https://sepolia.basescan.org/tx/0xeb96a29a883cc653dde60cf91900e649c3d2c1011150b5b2c48b55279f2b603d) |
| 2 | Shield | EURC | 420,690 | `d47eae9b-364f-4f1a-abf3-0d6a00e13b10` | — | — |
| 3 | Unshield | EURC | 500,067.5 | `40771598-92ff-42b6-9109-017ffc3f3e28` | — | — |
| 4 | Unshield | USDC | 1,500,000 | `06cf93ed-f245-4aec-8b39-a4a34c916c88` | — | — |
| 5 | Unshield | EURC | 420,690 | `b4041a2d-d7f8-4139-a057-43d9d037ba08` | — | — |
| 6 | Unshield | WBTC | 0.67 | `9c9ab7ed-df04-44f5-81a2-393d675a11e6` | — | — |
| 7 | Shield | WBTC | 5 | `810f35ff-d055-414a-9f60-2fec0fb89fe3` | — | — |
| 8 | Shield | USDC | 1,000,067 | `a8277b2f-538b-47a4-9f7a-daba9cba682e` | — | — |
| 9 | Unshield | EURC | 420,069 | `a86755a0-dffc-40c6-986e-b70e60ae9edc` | — | — |

**Private Swap (Execute):** USDC to EURC, 420,069 units — confirmed via Unlink SDK `execute()` equivalent flow.

**ULNKm Faucet:** 100 tokens — [Basescan](https://sepolia.basescan.org/tx/0x260151b3d41dab614c6596135d2e32c92de14c8b1493aa0be9737c9fba046e61)

## Sponsor Feedback

We filed detailed feedback on the Unlink SDK based on our integration experience. The key issues: SDK API surface doesn't match documentation, `execute()` not implemented in the canary build, `publicClient` required but not documented, and no gasless onboarding path for hackathon participants. Full details in [sponsor-feedback.md](./sponsor-feedback.md#unlink).

## The Use Case

Consider a corporate treasury doing $50M/year in USDC-to-EURC conversions. Without privacy, every swap reveals:

- **When** the treasury is active (timing patterns)
- **How much** they convert per trade (sizing strategy)
- **How often** they trade (frequency intelligence)
- **What rate** they accept (pricing thresholds)

Competitors and MEV operators aggregate this data to front-run trades, copy strategy, or extract value. With Unlink, those same observers see swaps flowing through the privacy pool — they know *a swap happened*, but they cannot identify *who* is behind it.

The treasury retains full auditability through GetNear's on-chain audit trail on Arc. Internal compliance sees everything. External observers see the trade, but not the trader.

---

*Built with [Unlink SDK](https://www.unlink.xyz/) at ETHGlobal Cannes 2026. Privacy integration runs on Base Sepolia testnet.*

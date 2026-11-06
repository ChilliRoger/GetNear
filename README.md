# GetNear

**Autonomous treasury FX agent for NEAR teams. Testnet-only prototype.**

> TESTNET ONLY · SIMULATED FILLS · Forked from Meridian FX (MIT) · NEAR Hackathon Nov 2026

GetNear lets a team holding stablecoins convert them before a deadline using chunked, timed execution — without giving the agent unchecked authority. A Rust contract (`FxBudget`) enforces on-chain limits; large orders require multi-signer DAO approval.

## What it does

- **Goal-based orders**: amount, pair, deadline, max chunk size, max price deviation.
- **Chunked execution**: a timing score (0–100) from live quotes vs a reference FX rate drives when to execute.
- **Contract-enforced budget**: the agent can only act inside on-chain limits.
- **Multi-signer approval**: large orders need 2-of-3 council votes via Sputnik DAO.
- **Transparent decision log**: every tick logged with reasons; every on-chain step linked on the testnet explorer.

## What it is NOT

- Real swaps (NEAR Intents has no testnet; all fills are simulated and labeled).
- Mainnet use, privacy features, or oracle-verified prices.
- Savings claims or alpha promises.

## Architecture

```
Operator wallet --create_order--> FxBudget contract (testnet) <--execute_chunk-- Agent runner
                                        ^                                              |
                                        | approve_order (DAO only)                    |-- 1Click dry quotes
                                  Sputnik DAO (2-of-3) <-- votes -- Council wallets  |-- Reference FX rate
Dashboard <-- RPC reads + local decision log (SQLite) + explorer links
```

## Status

**Current stage: P2 complete (Interim Mock Mode).**

- **EVM stack stripped**: Solidity contracts, Chainlink CRE, Unlink privacy, World ID, Arc/Base chain configurations, and viem dependencies have been cleanly removed.
- **Strategy engine preserved**: The multi-factor timing score, adaptive TWAP, urgency curves, and SQLite decision log are preserved and verified via unit smoke tests.
- **Pluggable domain interfaces**: `QuoteSource`, `ReferenceRateSource`, `Executor`, and `ApprovalGate` interfaces defined in `@getnear/shared` with working mock implementations.
- **Interim mock mode active**: The monorepo builds (`pnpm build`), lints (`pnpm lint`), and tests (`pnpm test`) cleanly. The Next.js frontend (`apps/app`), Oracle backend (`apps/oracle`), and dev ops panel (`apps/dev-ui`) boot end-to-end with simulated fills and mock banners.
- **Next step**: Block P3 (Shared types, typed zod config, testnet environment). See `docs/TODO.md` for the full roadmap.

## Development

```bash
pnpm install --ignore-scripts
pnpm build
pnpm dev
```

See `docs/CONFIG.md` for environment variable setup (written in P3).

## Upstream

Forked from [Meridian FX](https://github.com/pulseplay-stack/meridian-fx) by Team Ippo (ETHGlobal Cannes 2026, MIT).
See `NOTICE.md` and `LICENSE`.

## License

MIT — see `LICENSE`.

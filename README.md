# GetNear

**Autonomous treasury FX agent for NEAR teams. Testnet-only prototype.**

> TESTNET ONLY · CALLBACK-VERIFIED DEMO EURe PAYOUTS · SIMULATED USDC FX LEG (1Click dry:true) · NEAR Hackathon Nov 2026

GetNear lets a team settle supplier payables or FX budgets before a deadline using chunked, timed execution — without giving the agent unchecked authority. A Rust contract (`FxBudget`) enforces on-chain caps and only reduces invoice balances due after cross-contract `ft_transfer` callbacks confirm delivery; large orders require multi-signer Sputnik DAO approval.

## What it does

- **Invoice & FX goal orders**: budget cap (`total_in` USDC), optional supplier `recipient`, `target_out` (EURe due), `invoice_ref`, deadline, max chunk size, and max price deviation.
- **Callback-verified invoice balance**: `FxBudget::execute_chunk` dispatches cross-contract `ft_transfer` in demo NEP-141 `EURe` and locks in-flight state. Only inside `#[private] on_chunk_settled` does a successful `PromiseResult` reduce the supplier's remaining balance due; failed transfers leave the amount due unchanged and idempotent retries never double-pay.
- **Chunked execution**: a timing score (0–100) from live 1Click `dry: true` quotes vs Frankfurter ECB reference rates drives when `apps/agent` executes chunks.
- **Restricted key & multisig gate**: the agent signs `execute_chunk` using a NEAR protocol `FunctionCall`-restricted key (`execute_chunk` only); orders above `auto_cap_in` require 2-of-3 Sputnik DAO council votes.
- **Transparent decision log**: SQLite persists confirmed vs failed settlement provenance (`is_simulated = true` for any failed/unconfirmed row) with NearBlocks explorer links.

## What it is NOT (Honest Disclosures)

- **No real mainnet FX swap**: NEAR Intents has no testnet. 1Click is queried strictly with `dry: true` for live indicative rates; the USDC FX leg is simulated accounting, while the EURe payout transfers **testnet demo NEP-141 tokens** (`eure.chilliroger-operator.testnet`) from `fx-budget`'s prefunded testnet vault.
- **On-chain deviation guard is a policy check on an agent-reported value**: `FxBudget` enforces `-deviation_bps <= max_dev_bps` against the `deviation_bps` value submitted by the agent runner rather than an independent on-chain price oracle.
- **Testnet only**: not audited for mainnet custody or production funds.

## Architecture

```
Operator / Buyer --create_order--> FxBudget contract (testnet) <--execute_chunk (FunctionCall key)-- Agent runner
                                        |          ^                                                      |
                        ft_transfer     |          | approve_order (DAO only)                             |-- 1Click dry:true quote
                   + on_chunk_settled   v          |                                                      |-- Frankfurter ECB rate
                    eure.chilliroger   Sputnik DAO (2-of-3) <-- votes -- Council wallets
                           |
                           v
                  Supplier recipient (verified EURe balance reduction)
Dashboard (apps/app) <-- RPC views + SQLite settlement log + NearBlocks links
```

## Status

**Implemented & Verified on NEAR Testnet (P0–P10.5 + Settlement-Proof Hardening; P11–P14 pending).**

- **Smart contract (`contracts/fx-budget`)**: Deployed and migrated at `fx-budget.chilliroger-operator.testnet` with invoice balance tracking, `ChunkStatus` (`InFlight | Settled | Failed`) idempotency store, cross-contract NEP-141 `ft_transfer` + `on_chunk_settled` callback, and `migrate` admin upgrade (`10/10` contract suite tests pass).
- **Agent runner (`apps/agent`)**: Signs solely with `chilliroger-agent.testnet`'s restricted `execute_chunk` FunctionCall key, verifies `get_chunk_record` callback status before marking any SQLite row `CONFIRMED` (`is_simulated = false`), and records failed transfers as `FAILED` / `is_simulated = true` (`8/8` agent tests pass).
- **Live €1,000 supplier invoice verification**: Verified on testnet (`Order #8`, `INV-2026-1000` -> `supplier-eu.chilliroger-operator.testnet`): DAO 2-of-3 approval, Chunk #1 settled (`€582.76`), idempotent replay transferred `0`, Chunk #2 failed on-chain leaving `€417.24` due unchanged, and retry completed `€1,000.00` total (`0.00` remaining due). See `docs/DEMO_LOG.md`.
- **Remaining roadmap**: P11 (optional NEAR AI intake), P12–P14 (final packaging & submission). See `docs/TODO.md`.

## Development

```bash
pnpm install
pnpm test:contract
pnpm agent:test
pnpm --filter @getnear/app dev
pnpm --filter @getnear/agent start
```

See `docs/CONFIG.md` for environment variables, `docs/CONTRACT.md` for the contract spec, and `docs/DEMO_LOG.md` for live NEARBlocks proofs.

## Upstream

Forked from [Meridian FX](https://github.com/pulseplay-stack/meridian-fx) by Team Ippo (ETHGlobal Cannes 2026, MIT).
See `NOTICE.md` and `LICENSE`.

## License

MIT — see `LICENSE`.

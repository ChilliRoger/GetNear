# GetNear — NEAR Testnet Autonomous Treasury & Invoice FX Execution

GetNear executes supplier-invoice FX payouts (`USDC -> EURe`) on **NEAR testnet** with **Sputnik DAO v2 (2-of-3) governance**, **restricted `FunctionCall`-key isolation**, and **callback-verified NEP-141 token settlement**.

Instead of marking an invoice chunk settled when an off-chain script starts, the Rust `FxBudget` contract reserves the chunk in flight, dispatches cross-contract `ft_transfer` from a prefunded demo `EURe` vault to the supplier's approved NEAR account, and updates `settled_out` and remaining balance due **only inside `#[private] on_chunk_settled`**.

---

## Honest Execution Scope (Three Separate Facts)

Every chunk record and dashboard entry separates three distinct facts:

1. **Live 1Click Dry Quote (`dry: true`):** Fetches live indicative `USDC -> EURe` pricing from the NEAR Intents 1Click API (`https://1click.chaindefuser.com/v0/quote`) alongside the ECB / Frankfurter reference rate (`api.frankfurter.app`).
2. **Simulated FX Conversion (No USDC Debited):** NEAR Intents does not run a live testnet cross-chain solver, so `dry: true` quotes the FX swap (`simulated_out`) without moving testnet USDC, and the contract enforces `max_dev_bps` as a policy check on the **agent-reported** deviation value.
3. **Confirmed NEAR Testnet Demo-Token Transfer:** `FxBudget::execute_chunk` initiates a real cross-contract NEP-141 `ft_transfer` from the prefunded `eure.chilliroger-operator.testnet` vault to the invoice's approved `recipient` (`supplier-eu.chilliroger-operator.testnet`). If `ft_transfer` fails on-chain, `on_chunk_settled` marks the chunk `Failed`, leaves `settled_out` and remaining balance due unchanged, releases the in-flight lock, and persists `is_simulated: true` in SQLite.

---

## Upstream Attribution: Meridian FX vs. Built for NEAR

| Layer | Originated in Meridian FX | Built / Re-engineered for GetNear on NEAR |
| :--- | :--- | :--- |
| **Strategy Timing & Reference Rate** | Adaptive TWAP / timing score heuristic & ECB Frankfurter rate concept (`packages/shared`) | Extended with 1Click `dry: true` quote source, 18-to-6 decimal atomic EURe conversion, and SQLite audit schema (`apps/agent/src/db.ts`) |
| **Settlement Smart Contract** | None (off-chain / non-NEAR prototype) | `contracts/fx-budget/src/lib.rs` (Rust `near-sdk 5.30.1`): invoice payables, Sputnik DAO owner cap, in-flight lock, `ChunkRecord` idempotency (`InFlight`/`Settled`/`Failed`), cross-contract `ft_transfer` + `#[private] on_chunk_settled`, `expire_order` |
| **Governance & Key Security** | None | `chilliroger-dao.sputnik-v2.testnet` 2-of-3 council approval flow + `FunctionCall`-only access key restricted to `fx-budget::execute_chunk` (`chilliroger-agent.testnet`) |
| **Agent Runner & Reconciliation** | Basic loop concept | `apps/agent/src/runner.ts`: pre-broadcast `get_chunk_record` guard, uncertain-RPC outcome reconciliation (`get_chunk_record` / `list_order_chunks`), fail-safe SQLite upsert (`is_simulated=true` on unconfirmed/failed chunks) |
| **Chain Client & Testnet Infra** | None | `packages/near-client`, NEP-141 demo tokens (`usdc.*` / `eure.*`), testnet deployment & verification scripts (`scripts/near/*`) |
| **Frontend Workspace** | App shell & UI card/table primitives (`apps/app`) | Live `/api/near` RPC + `list_order_chunks` loader, Supplier Invoice Order intake, Sputnik DAO 2-of-3 voting controls, 3-fact fill receipts, expired unpaid-remainder view, testnet account faucet (`apps/app`) |

---

## Deployed NEAR Testnet Infrastructure

- **FxBudget Contract:** [`fx-budget.chilliroger-operator.testnet`](https://testnet.nearblocks.io/address/fx-budget.chilliroger-operator.testnet) (migrated in [`EKfuns36z7MM6tAUxZYTmHbgP4uYxMGa457zEWXowATD`](https://testnet.nearblocks.io/txns/EKfuns36z7MM6tAUxZYTmHbgP4uYxMGa457zEWXowATD))
- **Sputnik DAO v2 (2-of-3 Owner):** [`chilliroger-dao.sputnik-v2.testnet`](https://testnet.nearblocks.io/address/chilliroger-dao.sputnik-v2.testnet)
- **NEP-141 Demo Settlement Token:** [`eure.chilliroger-operator.testnet`](https://testnet.nearblocks.io/address/eure.chilliroger-operator.testnet) (prefunded vault on `fx-budget`)
- **NEP-141 Demo Budget Token:** [`usdc.chilliroger-operator.testnet`](https://testnet.nearblocks.io/address/usdc.chilliroger-operator.testnet)
- **Agent Account (Restricted Key):** `chilliroger-agent.testnet` (`FunctionCall` limited to `fx-budget.chilliroger-operator.testnet::execute_chunk`)
- **Supplier Recipient:** `supplier-eu.chilliroger-operator.testnet`

---

## Judge Quickstart & Verification Replay

### 1. Run Local Build & Regression Tests

```bash
pnpm install

# Rust WASM release build check, 27-export verification & acceptance logic tests
pnpm test:contract

# Agent math helpers, SQLite failure provenance & live local HTTP JSON-RPC reconciliation tests
pnpm agent:test

# Build the Next.js dashboard + API routes
pnpm --filter @getnear/app build

# Full Turborepo workspace test suite
pnpm test
```

> **Windows host note on Rust unit tests:** `near-sdk 5.30.1` `unit-testing` pulls `aws-lc-sys`, which requires `NASM` on Windows hosts and fails native `cargo test --lib` here. Accordingly, `contracts/fx-budget` is compiled directly to `wasm32-unknown-unknown` (`release`), validated by `pnpm test:contract`, and exercised end-to-end on live NEAR testnet via the scripts below.

### 2. Run the Dashboard & Agent Runner Locally

```bash
pnpm --filter @getnear/app dev    # Dashboard on http://localhost:3100
pnpm --filter @getnear/agent dev  # Agent loop + HTTP trigger on http://127.0.0.1:38175
```

### 3. Re-run Live NEAR Testnet Settlement & Bounds Drills

```bash
# Reproduces €1,000 supplier invoice Order flow (DAO approval, Chunk #1 confirm,
# idempotent replay = 0 EURe, failed ft_transfer leaving due unchanged, retry settling €1,000)
pnpm tsx scripts/near/verify-invoice-settlement.ts

# Reproduces Pending gate before DAO, out-of-bounds rejections (signer, chunk cap, target, budget, deadline),
# partial chunk settlement, and permissionless expire_order with unpaid remainder
pnpm tsx scripts/near/verify-bounds-and-expiry.ts
```

*Expected outcome:* Both commands exit `0`, printing live NEARBlocks transaction IDs and asserting on-chain balances and SQLite state after every step. (Requires local NEAR CLI credentials for the testnet demo accounts.)

---

## Verified Live NEAR Testnet Explorer Links

| Scenario / Check | On-Chain Result | NEARBlocks Link |
| :--- | :--- | :--- |
| **Order #8 (`INV-2026-1000`): Create (`€1,000.00`)** | Exceeds auto-cap -> `Pending` | [`28AjjbNGGHyYEwWD8sAWoMAQTZGVpGLSDShvNgwBfRze`](https://testnet.nearblocks.io/txns/28AjjbNGGHyYEwWD8sAWoMAQTZGVpGLSDShvNgwBfRze) |
| **Sputnik DAO Prop #8: Approve Order #8** | 2-of-3 vote -> `Active` | [`9eHYwHCZVPLvECUbJ8E3q9LMgiAXAuEE5SzWgnPxezVq`](https://testnet.nearblocks.io/txns/9eHYwHCZVPLvECUbJ8E3q9LMgiAXAuEE5SzWgnPxezVq) |
| **Chunk #1 Confirmed (`order-8-seq-1`)** | `+€582.76 EURe` -> Due `€417.24` | [`EATGRqzgJF4Y5KyC7RKQuQ5wC5b21JVYNycGkYyvAC1m`](https://testnet.nearblocks.io/txns/EATGRqzgJF4Y5KyC7RKQuQ5wC5b21JVYNycGkYyvAC1m) |
| **Chunk #1 Replay (`order-8-seq-1`)** | `0 EURe` moved (`idempotent_replay: true`) | [`5aAovDnuWo7gE877m6jb1PYraZWcWm2HpZEbz3ie9z8Y`](https://testnet.nearblocks.io/txns/5aAovDnuWo7gE877m6jb1PYraZWcWm2HpZEbz3ie9z8Y) |
| **Chunk #2 Failed (`order-8-seq-2` #1)** | `ft_transfer` failed -> Due `€417.24`, `is_simulated=true` | [`Dq2WdyNTou6jFQ2rDHAuXcgwpK4xqTJJFQXy8ZotNSrf`](https://testnet.nearblocks.io/txns/Dq2WdyNTou6jFQ2rDHAuXcgwpK4xqTJJFQXy8ZotNSrf) |
| **Chunk #2 Retry (`order-8-seq-2` #2)** | `+€417.24 EURe` -> `Completed` (`€0.00` due) | [`7D78yZ4FPtqYc4cpsFYid3JKarV1cZj578aFcerbXMoZ`](https://testnet.nearblocks.io/txns/7D78yZ4FPtqYc4cpsFYid3JKarV1cZj578aFcerbXMoZ) |
| **Order #10 (`Pending` Gate): Rejected Pre-DAO** | Reverted on `Order is not Active` | [`FogZ88dxv1YaPM4H8BDPQaCiFkNpNRJC3fAw2yPKmeov`](https://testnet.nearblocks.io/txns/FogZ88dxv1YaPM4H8BDPQaCiFkNpNRJC3fAw2yPKmeov) |
| **Order #11 Bounds: Over Chunk Cap Rejected** | `$12 > $10` rejected on-chain | [`EHaHo7BbwZ9hAz9A5v3BzD5zrRBjFuQYbUJKGvUefrUD`](https://testnet.nearblocks.io/txns/EHaHo7BbwZ9hAz9A5v3BzD5zrRBjFuQYbUJKGvUefrUD) |
| **Order #11 Bounds: Over Target Due Rejected** | `€26 > €25` rejected on-chain | [`9N1nChTVXpkW2Y4Gjnuub4NmZPk1G8rbHaLEQWsKp685`](https://testnet.nearblocks.io/txns/9N1nChTVXpkW2Y4Gjnuub4NmZPk1G8rbHaLEQWsKp685) |
| **Order #11 Partial Confirmed (`order-11-seq-1`)** | `+€8.70 EURe` paid -> `€16.30` remaining | [`5V8BxTDbR6oF4SJoBMsLjH2X2yRD2d1UY4FwLyLRcWv6`](https://testnet.nearblocks.io/txns/5V8BxTDbR6oF4SJoBMsLjH2X2yRD2d1UY4FwLyLRcWv6) |
| **Order #11 Past Deadline + `expire_order`** | `Expired` with **`€16.30 EURe` unpaid remainder** | [`F12SPGcE3fS8GWFuA3qJmL5qSaRn6xEUHzCeJTGPnAUn`](https://testnet.nearblocks.io/txns/F12SPGcE3fS8GWFuA3qJmL5qSaRn6xEUHzCeJTGPnAUn) |

Full deployment and transaction archive: [docs/DEMO_LOG.md](docs/DEMO_LOG.md)

# GetNear: on-chain evidence and what each check proves

Everything here is on **NEAR testnet** and can be re-checked without a wallet: `pnpm verify:readonly` (read-only RPC queries).

## Evidence

### Fresh invoice from the upgraded build: Order #13 (captured 2026-11-13)

One escrowed supplier invoice (`INV-FINAL-CHUNK-1794586331`: canonical Circle testnet USDC escrow, demo EURe payout, simulated FX) whose final
quoted chunk exceeded the amount due, so the upgraded build **capped the payout at the remaining balance (€5.00), recalculated the USDC debit
at full quote precision ($5.541224 charged) and refunded the unused escrow ($4.458776)**. Recorded in
[`docs/evidence/fresh-invoice.json`](docs/evidence/fresh-invoice.json) and checked live by `pnpm verify:readonly --expect-upgraded --expect-fresh`.

| Step | Parent transaction |
| :--- | :--- |
| Escrow funding (`ft_transfer_call`, $10 Circle USDC) | [ZnaHzUsM…](https://testnet.nearblocks.io/txns/ZnaHzUsMawWiTTAa5RrbfqTeQQqyhn8vY6tb41b7nMd) |
| Final `execute_chunk` (+€5.00 demo EURe, restricted agent key) | [6eAGwbnB…](https://testnet.nearblocks.io/txns/6eAGwbnBR8X5Q72J8kf8tPMPaChHSJ5Ma9zmBmzLM7of) |
| `refund_unused_escrow` ($4.458776 back to the operator) | [63pmWkCc…](https://testnet.nearblocks.io/txns/63pmWkCcViJShmXwgwELG5uUTbn5TBCRAHjv7Di2pFha) |

### Orders #8, #11, #12 — historical evidence from the PREVIOUS build

> **Evidence from the previous version (commit `ca4eab1`).** These transactions came from the contract and agent *before*
> the payout-bound and final-chunk fixes in this checkout. They do not prove the new behaviour until the new build is
> deployed (a separate task). All links are **parent transactions**; the EURe `ft_transfer` and `on_chunk_settled`
> receipts are inside each transaction's receipt tree.

| Order | What it shows | Parent transaction |
| :--- | :--- | :--- |
| **#8** `INV-2026-1000` (accounting-only, drill auto-cap) | Create → `Pending`; DAO prop #8 → `Active` | [create](https://testnet.nearblocks.io/txns/28AjjbNGGHyYEwWD8sAWoMAQTZGVpGLSDShvNgwBfRze) · [approve](https://testnet.nearblocks.io/txns/9eHYwHCZVPLvECUbJ8E3q9LMgiAXAuEE5SzWgnPxezVq) |
| #8 chunk 1 | `+€582.76` demo EURe, due `€417.24` | [execute_chunk](https://testnet.nearblocks.io/txns/EATGRqzgJF4Y5KyC7RKQuQ5wC5b21JVYNycGkYyvAC1m) |
| #8 replay / failed / retry | Replay moves `0`; failed `ft_transfer` leaves due unchanged; retry pays `€417.24` → `Completed` | [replay](https://testnet.nearblocks.io/txns/5aAovDnuWo7gE877m6jb1PYraZWcWm2HpZEbz3ie9z8Y) · [failed](https://testnet.nearblocks.io/txns/Dq2WdyNTou6jFQ2rDHAuXcgwpK4xqTJJFQXy8ZotNSrf) · [retry](https://testnet.nearblocks.io/txns/7D78yZ4FPtqYc4cpsFYid3JKarV1cZj578aFcerbXMoZ) |
| **#11** `INV-EXPIRY-DEMO` | **Scripted** partial chunk: `+€8.70` (hard-coded; `quote_ref` is a hand-written string, not a live quote) → `€16.30` due | [execute_chunk](https://testnet.nearblocks.io/txns/5V8BxTDbR6oF4SJoBMsLjH2X2yRD2d1UY4FwLyLRcWv6) |
| #11 bounds + expiry | Over-cap and over-target calls rejected on-chain; `expire_order` → `Expired` with `€16.30` unpaid | [chunk cap](https://testnet.nearblocks.io/txns/EHaHo7BbwZ9hAz9A5v3BzD5zrRBjFuQYbUJKGvUefrUD) · [target](https://testnet.nearblocks.io/txns/9N1nChTVXpkW2Y4Gjnuub4NmZPk1G8rbHaLEQWsKp685) · [expire](https://testnet.nearblocks.io/txns/F12SPGcE3fS8GWFuA3qJmL5qSaRn6xEUHzCeJTGPnAUn) |
| **#12** Circle USDC escrow | **$15.00** real Circle testnet USDC `ft_transfer_call` → escrow | [escrow funding](https://testnet.nearblocks.io/txns/5NnWXU3krRhoezmRtWsbPm23zYmesuDSNwn91gqEvcdZ) |
| #12 chunk | `$10.00` consumed → `+€8.00` demo EURe from the prefunded vault (`Completed`) | [execute_chunk](https://testnet.nearblocks.io/txns/6QV6ZUsCEheaiYhYCXSG5RGEMugAupRift1psAthJphL) |
| #12 refund | `$5.00` returned by a **manually triggered** `refund_unused_escrow` signed by the operator | [refund](https://testnet.nearblocks.io/txns/nyUHd7uwsfYBq9Nk7sivdHzCNHHatKfQRG9RryE4nU1) |

**Order #12 accounting** (verified live by `pnpm verify:readonly`): $15 funded, $10 consumed, $5 refunded, $10 retained by
`FxBudget`; `€8.00` paid from the vault. **Known flaw of the previous version:** the chunk charged the full `$10` although the
quote implied `€8.9645` for `$10` (≈ `$8.92` for `€8.00`), an over-charge of `$1.075889` retained by the contract. The fixed agent
charges the adjusted input; this is covered by local tests, **not** by testnet evidence yet.

## What changed since Orders #8, #11, #12 (now live on testnet; code hash `0bd18830…7d2fec`)

| Area | Change | Where |
| :--- | :--- | :--- |
| Final chunk | USDC charged is reduced with the payout (integer, rounded up) | `packages/shared/src/chunk-sizing.ts`, `apps/agent/src/runner.ts` |
| Payout bound | New orders require `target_out`; legacy orders need an owner-set cap | `contracts/fx-budget/src/lib.rs` — **code-only redeploy, no state migration** |
| Recovery | Attempt persisted before broadcast; bounded CLI timeout; evidence-based retry; startup + closed-order reconciliation; no downgrade of confirmed fills | `apps/agent/src/{runner,db}.ts`, `scripts/near/near-runner.ts` |
| Access | Demo signer / faucet / trigger disabled by default, authenticated, allow-listed; agent binds to loopback | `apps/app/src/lib/demo-guard.ts`, `apps/agent/src/server.ts`; see [docs/SECURITY.md](docs/SECURITY.md) |
| Judge path | Node 20/22/24 import fix, non-interactive lint, `pnpm verify:readonly` | `scripts/package.json`, `apps/faucet/.eslintrc.json`, `scripts/verify-readonly.ts` |
| Demo scripts | Order creation passes the required atomic-unit `target_out`; escrow drill asserts the adjusted final chunk; correct recipient/order lookup | `scripts/near/{demo-approval-flow,test-real-settlement,verify-circle-usdc-escrow}.ts`, `scripts/near/order-args.ts` |
| Upgrade tooling | Code-only deploy with plan/confirm gate, pre-upgrade snapshot, post-upgrade verification, evidence capture | `scripts/near/deploy-fx-budget.ts`, `scripts/upgrade-checks.ts`, `scripts/capture-invoice-evidence.ts`, [docs/UPGRADE_AND_FRESH_INVOICE.md](docs/UPGRADE_AND_FRESH_INVOICE.md) |
| Rust build | `Cargo.lock` committed, toolchain pinned, path-remapped reproducible build recorded in `res/artifacts.json` | `contracts/fx-budget/`, `scripts/build-contract.ts` |

---

## Verification layers (what each check actually proves)

| Layer | Command | Proves |
| :--- | :--- | :--- |
| Live read-only verification | `pnpm verify:readonly` | The live chain matches the documented evidence; deployed bytes equal the bundled `.wasm` (**binary comparison only** — not that the `.wasm` was built from `lib.rs`). |
| Rust unit tests (execute contract logic) | `cd contracts/fx-budget && cargo test --locked --lib` | Payout bounds, adjusted escrow debit, failed-callback accounting, refund rollback, idempotency, migration, in near-sdk's mock VM. **Executed locally: 15 passed** (Windows/GNU toolchain, rustc 1.99.1). Also defined in CI (`.github/workflows/ci.yml`), **not yet run there**. |
| WASM artifact inspection | `pnpm test:contract` (first block) | The `.wasm` exports the expected method names. Does not execute code. |
| TypeScript models | `pnpm test:contract` (second block) | Documents intended rules. **Never calls the contract**; not proof. |
| Agent / app / shared tests | `pnpm test` | Agent sizing, recovery and access boundaries against a local JSON-RPC stub; dashboard server-side access rules. |
| Script arguments | `pnpm test:scripts` | Order-creation scripts build atomic-unit arguments that always carry `target_out`; all scripts target testnet and the documented accounts/tokens. |
| Upgrade verification | `pnpm upgrade:verify` | **After** the upgrade: deployed hash == artifact, new view callable, every pre-upgrade order/chunk/escrow unchanged, legacy cap policy. |
| Live write drills | `scripts/near/verify-*.ts` | End-to-end settlement on testnet. **Need local credentials and DAO rights; they send transactions.** |

A green build establishes that the code compiles and tests pass; end-to-end settlement is evidenced separately by the live transactions above.

---

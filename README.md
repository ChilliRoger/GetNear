# GetNear — Controlled Supplier Payments on NEAR Testnet

**The problem.** A treasury owes a euro supplier an invoice but holds USDC. Paying it safely means: a human-governed
approval for large payments, an automated agent that can *only* pay that supplier up to the invoice amount, retries that
never pay twice, and a ledger that marks the invoice paid **only when the transfer really happened**.

**What GetNear does (testnet only).** An invoice order is created and funded with Circle testnet USDC, approved by a
Sputnik DAO (2-of-3) when above the auto-cap, and paid in chunks by an agent holding a restricted `FunctionCall` key.
The Rust `FxBudget` contract reserves each chunk in flight, sends demo EURe to the supplier from a prefunded vault with a
cross-contract `ft_transfer`, and reduces the amount due **only inside the `#[private] on_chunk_settled` callback**.
A failed transfer leaves the invoice due unchanged and the chunk retryable; refunds return unspent escrow.

> Testnet-only hackathon prototype. No mainnet funds. See [what is real vs simulated](#what-is-real-vs-simulated).

---

## Fastest way to verify (no wallet, no credentials, ~2 minutes)

```bash
# Node 20.19+, 22 or 24, and pnpm 12 (see Prerequisites)
pnpm install --frozen-lockfile
pnpm verify:readonly      # read-only testnet queries; prints expected vs observed for Orders #8, #11, #12
```

Expected: `PASS 62  FAIL 0  RPC_ERROR 0` and exit code `0`. Exit `1` means the live chain does not match the documented
evidence; exit `2` means the RPC could not answer (retry or pass `--rpc <url>`): RPC failures are reported separately
from assertion failures. It checks, read-only: the deployed code hash against the bundled artifacts, Orders #8, #11, #12 (labelled
**historical, previous build**), the Order #12 escrow reconciliation, and the **fresh upgraded-build invoice** (currently
`pending`: see [Evidence](#evidence)). Strict modes: `--expect-upgraded` (the upgraded contract must be live) and
`--expect-fresh` (the fresh invoice must be captured); both currently exit `1` by design because neither has happened yet.

Optional local checks:

```bash
pnpm test                          # shared, near-client, oracle, faucet(live RPC), agent, app security tests, script-argument tests
pnpm lint                          # non-interactive
pnpm --filter @getnear/app build   # dashboard production build
```

---

## What is real vs simulated

Every chunk shown in the dashboard separates four facts:

| # | Fact | Status |
| :-: | :--- | :--- |
| 1 | **Live 1Click dry quote** (`dry: true`, `https://1click.chaindefuser.com/v0/quote`) next to the ECB / Frankfurter reference rate | Real, **indicative only**: nothing is executed and it is a mainnet price feed. |
| 2 | **FX conversion** | **Simulated.** No cross-chain swap happens; the contract checks `max_dev_bps` against an **agent-reported** deviation. |
| 3 | **Circle testnet USDC escrow** (`3e2210e1…b8af`) for orders funded with `ft_transfer_call` | **Real testnet tokens** locked in `FxBudget`; unspent USDC is refundable. Accounting-only orders (`create_order`) move no USDC. |
| 4 | **Demo EURe payout** from the prefunded vault (`eure.chilliroger-operator.testnet`) to the supplier | **Real NEP-141 transfer on testnet**, confirmed by the callback. The EURe is a **team-minted demo token**, and the "supplier" is a sub-account of the operator. |

## How a payment flows

1. **Create + fund** — wallet `ft_transfer_call` of Circle USDC (or accounting-only `create_order`). Every order needs an invoice target (`target_out`) which bounds its payouts on-chain.
2. **Approve** — above the auto-cap ($100) the order is `Pending` until the DAO approves (2-of-3).
3. **Quote** — the agent fetches a live dry quote + reference rate and applies the deviation policy.
4. **Size** — if the remaining invoice amount is below the quoted output, the payout is clamped **and the USDC charged is reduced** to `ceil(remainingOut × quotedIn / quotedOut)`.
5. **Persist, then broadcast** — the attempt is stored in SQLite, then `execute_chunk` is sent with the restricted key.
6. **Callback** — `FxBudget` transfers demo EURe; `on_chunk_settled` updates `settled_out`/`executed_in` only on success.
7. **Reconcile** — the agent verifies on-chain state (also at startup and for closed orders); the dashboard reads the contract.
8. **Refund** — after `Completed`/`Cancelled`/`Expired`, `refund_unused_escrow` returns unspent USDC (a manual, requester-signed call).

"Paid" means the amount due is **zero**. If the USDC budget runs out first the dashboard shows *"Budget exhausted · €X still due"*.

---

## Evidence

### Fresh invoice from the upgraded build — PENDING

One escrowed supplier invoice (canonical Circle testnet USDC, demo EURe payout, simulated FX) whose final quoted chunk exceeds the amount
due, so the upgraded build **caps the payout at the remaining balance, recalculates the USDC debit at full quote precision, and refunds the
unused escrow**. Not captured yet: it needs the upgraded contract deployed and one signed run. The exact steps, inputs and acceptance criteria are in
[docs/UPGRADE_AND_FRESH_INVOICE.md](docs/UPGRADE_AND_FRESH_INVOICE.md); the result will be recorded in
[`docs/evidence/fresh-invoice.json`](docs/evidence/fresh-invoice.json) and checked live by `pnpm verify:readonly --expect-fresh`.

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

## What changed since the evidence (needs redeploy / restart to take effect on testnet)

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

## Prerequisites & supported versions

* **Node.js 20.19+, 22, or 24** (verified locally for the agent suite; a CI matrix is defined in `.github/workflows/ci.yml` but has not been run yet). `better-sqlite3` is pinned to `~12.9.0`, the newest release with prebuilt Windows binaries for Node 20, 22 and 24.
* **pnpm 12** (`packageManager` is pinned; `npm i -g pnpm@12.18.0` if corepack cannot fetch it).
* For the **optional** pieces only: Rust + `wasm32-unknown-unknown` (contract build/tests), `near-cli-rs` (write drills, the opt-in demo signer; set `NEAR_CLI_PATH` if not on `PATH`).

## Optional: try it with your own wallet

| Need | Where | Notes |
| :--- | :--- | :--- |
| Demo tokens (optional) | **[GetNear Faucet](https://getnear-faucet.vercel.app/)** | Dispenses the team's **demo USDC** (`usdc.chilliroger-operator.testnet`) and **demo EURe**, up to 500 per claim (balance cap 2,500), registers NEP-145 storage on those tokens, and sends ≈ 0.45 NEAR to empty wallets. **Demo USDC cannot fund escrow.** Its own operator wallet holds little NEAR, so it can run dry. |
| **Canonical Circle testnet USDC** (required for escrow) | **<https://faucet.circle.com/>** (choose NEAR testnet) | Token `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`. The demo escrow uses 15 USDC. |

**A fresh wallet is not ready to create an order. It needs all of:**

1. A NEAR testnet account with a little NEAR for gas.
2. Circle testnet USDC (above), with the account registered (NEP-145 `storage_deposit`, 0.00125 NEAR) on the Circle USDC contract.
3. **Authorization as a requester on FxBudget** (the DAO runs `add_requester(<account>)`). Orders are not open to arbitrary wallets: without this,
   funding is refunded by the token and no order is created. Judges therefore verify the captured demo order with `pnpm verify:readonly`.
4. For a recipient other than `supplier-eu.chilliroger-operator.testnet`: registration on the demo EURe token (claiming EURe from the GetNear Faucet does this).
5. An invoice target (EURe due) on every order, and the agent running with its restricted key for payouts.

## Run the dashboard and agent locally (optional)

```bash
cp .env.example .env
pnpm --filter @getnear/app dev     # dashboard on http://localhost:3100  (sign with your own NEAR wallet)
pnpm agent:start                   # agent loop + HTTP service on 127.0.0.1:38175 (needs the restricted key file to submit)
```

The dashboard works read-only without any credentials. To **create orders** with your own wallet, your account must be an authorized
requester on the contract (the DAO runs `add_requester`); otherwise the escrow is refunded and no order is created — the UI warns about this.
The server-side *demo signer*, demo faucet and agent trigger are **off by default** and must be explicitly enabled; see `.env.example` and [docs/SECURITY.md](docs/SECURITY.md).
Circle testnet USDC comes from [faucet.circle.com](https://faucet.circle.com/).

---

## Deployed testnet infrastructure

- **FxBudget:** [`fx-budget.chilliroger-operator.testnet`](https://testnet.nearblocks.io/address/fx-budget.chilliroger-operator.testnet) (the **previous build**; V2 `migrate` [tx](https://testnet.nearblocks.io/txns/EKfuns36z7MM6tAUxZYTmHbgP4uYxMGa457zEWXowATD), V3 `migrate_v3` [tx](https://testnet.nearblocks.io/txns/AsvHD4dd3U9uALori1hVwd8ihBYunBjrqSRskgBwb7fo))
- **Sputnik DAO v2 (owner, 2-of-3):** [`chilliroger-dao.sputnik-v2.testnet`](https://testnet.nearblocks.io/address/chilliroger-dao.sputnik-v2.testnet)
- **Escrow input token (Circle Native NEAR testnet USDC):** [`3e2210e1…b8af`](https://testnet.nearblocks.io/token/3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af)
- **Demo settlement token:** [`eure.chilliroger-operator.testnet`](https://testnet.nearblocks.io/address/eure.chilliroger-operator.testnet) · **Demo faucet USDC:** `usdc.chilliroger-operator.testnet`
- **Agent account:** `chilliroger-agent.testnet` (restricted `execute_chunk` key; also holds a separate full-access key — see [docs/SECURITY.md](docs/SECURITY.md)) · **Supplier:** `supplier-eu.chilliroger-operator.testnet`

Full archive: [docs/DEMO_LOG.md](docs/DEMO_LOG.md).

---

## Credit: Meridian FX vs built for NEAR

GetNear started from **Meridian FX** (Team Ippo, ETHGlobal Cannes 2026; MIT) — see [NOTICE.md](NOTICE.md). Meridian FX is a non-NEAR prototype.

| Layer | Inherited from Meridian FX | Built for GetNear on NEAR |
| :--- | :--- | :--- |
| Strategy & rate reference | Adaptive TWAP / timing-score heuristic and the ECB (Frankfurter) reference-rate idea (`packages/shared`, `apps/oracle`) | 1Click `dry:true` quote source, 18→6 decimal conversion, SQLite audit schema, integer final-chunk sizing |
| Frontend | App shell and card/table primitives (`apps/app`, `apps/dev-ui`) | Live NEAR RPC views, supplier-invoice intake, DAO voting UI, provenance/fill panels, wallet selector |
| Settlement contract | — | `contracts/fx-budget` (Rust, `near-sdk`): invoice payables, DAO owner, in-flight lock, idempotent chunk records, cross-contract `ft_transfer` + `#[private]` callback, escrow + refunds, expiry, payout bounds |
| Governance & keys | — | Sputnik DAO 2-of-3 approval, restricted `FunctionCall` agent key, opt-in/authenticated demo surfaces |
| Agent | Basic loop concept | `apps/agent`: attempt persistence, uncertain-outcome reconciliation, no-downgrade receipts, authenticated local API |
| Chain client & tooling | — | `packages/near-client`, token deployment and verification scripts (`scripts/near/*`), read-only verifier |

## Known limitations

* Retained input USDC has no withdrawal path (see [docs/SECURITY.md](docs/SECURITY.md)); `settlement_out` is not tied to `amount_in` on-chain.
* Pending (never-approved) escrowed orders are not auto-expired; someone must call `expire_order`. Refunds are a manual call.
* The deployed testnet contract and agent are the **previous build**. The upgrade (code-only), the fresh escrowed invoice and their live re-verification are **pending** and need signing credentials: see [docs/UPGRADE_AND_FRESH_INVOICE.md](docs/UPGRADE_AND_FRESH_INVOICE.md).
* `rpc.testnet.near.org` can rate-limit; the verifier and apps fall back to `test.rpc.fastnear.com`.
* Release-WASM hashes depend on the rustc version and host OS. The committed artifact's hash and build environment are in `contracts/fx-budget/res/artifacts.json`; the deployed bytes, not a rebuild, are what `verify:readonly` compares.

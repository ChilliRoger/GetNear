# Upgrade FxBudget and capture one fresh escrowed invoice (operator runbook)

**Status: NOT EXECUTED.** The signing steps below need local credentials (the `fx-budget` deployment key, a funded
wallet) that were not available when this was prepared. Everything up to the signing step has been checked locally
and against read-only testnet RPC. Nothing here has been deployed or signed.

Until it is executed, testnet runs the **previous build** and Orders #8, #11, #12 are evidence of that build only.

## 0. What is being deployed

| Item | Value |
| :--- | :--- |
| Network / account | NEAR **testnet** / `fx-budget.chilliroger-operator.testnet` |
| Mode | **Code-only upgrade**: `DeployContract` with **no init call**. The borsh state layout is unchanged, so no `migrate*` is run (calling `migrate_v3` on V3 state would panic and revert the deploy). Existing orders, chunk records and escrow records are untouched. |
| Signer | The `fx-budget` account's **own FullAccess key** (local near-cli credential file). The DAO does not control it. |
| Artifact | `contracts/fx-budget/res/fx_budget.next.wasm` — **sha256 `0bd188300827654a6be91ed1585955faa6b3459a99e187882657fa23717d2fec`**, 344,560 bytes |
| Build | commit `de6c9a971aa220ea430cb72b7d3d6fc7b399cd59` (contract sources), `pnpm build:contract --write-artifact`, rustc 1.99.1 (`x86_64-pc-windows-gnu`), `cargo build --locked`, path-remapped. Rebuilding that commit from a different directory gave the identical hash. Details: `contracts/fx-budget/res/artifacts.json` |
| Currently deployed | `res/fx_budget.wasm` (previous build, sha256 `41f7fed29a0e5906ab67669e2af8f4d81196ed3d54b9be2e6e3862b7055b55f5`) |
| Behaviour change | New orders require `target_out`; legacy orders (`target_out == 0`) cannot pay until the DAO calls `set_order_payout_cap`; `set_order_payout_cap` / `get_order_payout_cap` added. See `docs/CONTRACT.md`. |

The agent and dashboard changes (final-chunk sizing, durable attempts) are **off-chain** and take effect when the agent is
restarted from the same commit.

## 1. Preconditions (checked by the plan step)

* Node 20.19+/22/24, `pnpm install --frozen-lockfile`, `near-cli-rs` on `PATH` (or `NEAR_CLI_PATH`).
* The deployment credential exists locally: `~/.near-credentials/testnet/fx-budget.chilliroger-operator.testnet.json`.
* Free balance on the account covers the extra code storage (≈ +0.09 NEAR for +8.6 KB; the plan prints the exact figure).
* The artifact hash recomputes to the value in `artifacts.json` and differs from the live on-chain hash.

## 2. Upgrade — exact commands

```bash
git checkout <commit that contains res/fx_budget.next.wasm>     # record: git rev-parse HEAD
pnpm install --frozen-lockfile

pnpm upgrade:snapshot                 # READ-ONLY. Records every order, chunk record, escrow record, config and balance.
pnpm contract:upgrade                 # PLAN ONLY: prints target, signer, mode, hashes and the exact near command. Signs nothing.
pnpm contract:upgrade --confirm-deploy   # EXECUTES the deploy. Equivalent to:
#   near contract deploy fx-budget.chilliroger-operator.testnet use-file contracts/fx-budget/res/fx_budget.next.wasm \
#        without-init-call network-config testnet sign-with-access-key-file ~/.near-credentials/testnet/fx-budget.chilliroger-operator.testnet.json send
```

### Post-upgrade checks (all read-only, no credentials)

```bash
pnpm upgrade:verify                   # exit 0 required
pnpm verify:readonly --expect-upgraded   # exit 0 required
```

`upgrade:verify` asserts: deployed code sha256 == artifact; `get_order_payout_cap` is callable; config (owner, agent, tokens,
limits, pause) unchanged; **every pre-upgrade order, chunk record and escrow record is identical** (this includes
Orders #8, #11, #12 and the Order #12 escrow `15 / 10 / 5 / 0`); FxBudget-held Circle USDC and demo EURe unchanged; every
open legacy order (e.g. Order #6, `Pending`) has **no payout cap** — i.e. it cannot pay until the DAO sets one.

### Rollback

The previous artifact is `res/fx_budget.wasm`. The script refuses to deploy it by design (it is a downgrade). To roll back run
the `near contract deploy … use-file contracts/fx-budget/res/fx_budget.wasm without-init-call …` command manually, then
`pnpm verify:readonly` (the binary check will report the previous build). State is unaffected either way.

### Start the upgraded agent

```bash
AGENT_TRIGGER_TOKEN=<>=16 chars> pnpm agent:start     # loads the restricted execute_chunk key file; binds 127.0.0.1
```

## 3. Fresh escrowed invoice through the dashboard

**Why these inputs.** They match historical Order #12 so the two are directly comparable. The live quote for the planned $10
chunk (≈ 8.96 demo EURe) **exceeds the €8.00 still due**, so the upgraded build must (a) cap the payout at 8.00 and (b) charge only
the recalculated input (≈ 8.92 USDC) instead of 10.00. Order #12 charged the full 10.00.

| Dashboard field | Value |
| :--- | :--- |
| Funding | **Lock Real Circle Native USDC Escrow** (checked) — canonical token `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` |
| Total amount | `15` |
| Max chunk | `10` |
| Max deviation (bps) | `250` (Order #12 used 250; the dashboard default is 120 — either works while the live deviation is small) |
| Deadline (hours) | `1` |
| Supplier account | `supplier-eu.chilliroger-operator.testnet` (already registered on the demo EURe token) |
| Target due (EURe) | `8` |
| Invoice reference | `INV-FINAL-CHUNK-8` |

### Wallet prerequisites (a fresh wallet is NOT ready by default)

1. A NEAR testnet account with a little NEAR for gas. The GetNear faucet drips ≈ 0.45 NEAR to empty wallets.
2. **≥ 15 canonical Circle testnet USDC** from <https://faucet.circle.com/> (choose NEAR testnet). Circle USDC is **not** the
   demo USDC from the GetNear faucet, and only Circle USDC can fund escrow. The account must be NEP-145 registered on the Circle
   USDC contract (`storage_deposit`, 0.00125 NEAR) to receive tokens.
3. **The account must be an authorized requester on FxBudget.** The DAO runs `add_requester(<account>)`. Without it
   `ft_on_transfer` panics, the token refunds the sender, and no order is created (the dashboard now warns about this).
   The operator account `chilliroger-operator.testnet` is already authorized.
4. The agent must be running (section 2) with its restricted key, and the vault must hold demo EURe (≈ 98,965 today).

### Steps

1. `pnpm evidence:balances --wallet <account> --out before.json` (record balances before funding).
2. Dashboard → connect wallet → enter the fields above → **Submit Order to Testnet** (a single signed `ft_transfer_call`). Note the funding tx.
3. Let the agent run (or press **Trigger Agent Tick** if the demo signer/trigger is enabled). Wait for the order to show **Paid**. Note the `execute_chunk` tx.
4. Press **Claim Refund** (a manual `refund_unused_escrow`). Note the refund tx.
5. `pnpm evidence:capture --order <id> --wallet <account> --before before.json --fund-tx <hash> --payout-tx <hash> --refund-tx <hash> --write`
6. `pnpm verify:readonly --expect-upgraded --expect-fresh` (exit 0) and commit `docs/evidence/fresh-invoice.json`.

### Acceptance criteria (all derived from chain state; the capture tool refuses to write unless every one holds)

* Deployed code hash == `fx_budget.next.wasm`.
* `settled_out == target_out` (8.00 demo EURe), payout capped at the remaining balance; amount due `0` ⇒ the dashboard label is **Paid**
  (and the label is *not* Paid while any amount is due).
* `charged USDC < planned $10.00`, and `0 ≤ quotedOut − payout × 1e12 < 1 atomic USDC` at the 18-decimal quote output recorded on-chain
  (i.e. the input is the minimal covering input at full quote precision).
* `funded = charged + refunded + remaining escrow` with `remaining = 0` and `refunded = funded − charged`.
* Wallet Circle USDC net debit == charged; FxBudget Circle USDC net credit == charged; supplier demo EURe credit == 8.00.
* Receipts: funding = `ft_transfer_call` (wallet), payout = `execute_chunk` (agent), refund = `refund_unused_escrow` (requester).
  Every link is the **parent** transaction; the Circle USDC transfers, the demo-EURe `ft_transfer` and the callbacks are inside its receipt tree.

### Labels that must accompany the evidence

* Funding is **canonical Circle testnet USDC** (real testnet tokens).
* The payout is **demo EURe from the prefunded vault** (a team-minted token), not a real euro stablecoin.
* The FX conversion is **simulated**; the 1Click quote is a live **dry** (indicative) quote and nothing is swapped.
* The refund is a **manually triggered** call, not automatic.

## 4. What is verified where

| Claim | Local (executed) | CI | Testnet |
| :--- | :--- | :--- | :--- |
| Payout bounds, adjusted escrow debit, failed-callback accounting, refund rollback | `cargo test --locked --lib` (15 pass) | defined, not yet run | **not yet** (needs the upgrade) |
| Agent sizing / recovery / access boundaries | agent, shared, app tests | defined, not yet run | **not yet** |
| Script transaction arguments | `pnpm test:scripts` | defined, not yet run | **not yet** |
| Previous build: Orders #8/#11/#12 | — | — | `pnpm verify:readonly` (62 pass) |
| Upgrade applied, state preserved | — | — | `pnpm upgrade:verify` **after** the upgrade |
| Fresh invoice | — | — | `pnpm verify:readonly --expect-fresh` **after** the run |

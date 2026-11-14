# GetNear — Trust Model & Access Boundaries (testnet)

This page states what each key and service can actually do. It reflects live testnet state read with
`pnpm verify:readonly` (view calls only) and the code in this checkout. **Testnet only.**

## 1. Who controls what

| Authority | Controls | Does **not** control |
| :--- | :--- | :--- |
| **Sputnik DAO** `chilliroger-dao.sputnik-v2.testnet` (council of 3, 2 approvals) | The FxBudget **contract logic** as `owner`: `approve_order`, `set_agent`, `set_limits`, `pause`/`unpause`, `add_requester`/`remove_requester`, `set_input_token`/`set_settlement_token`, `set_order_payout_cap` (new build). | The **code** deployed on `fx-budget` and the tokens it holds (see the deployment key below). |
| **Agent restricted key** (`chilliroger-agent.testnet`, `FunctionCall` → `fx-budget` / `execute_chunk`, limited allowance) | Calling `execute_chunk`: choosing `amount_in` (≤ chunk cap and remaining budget), `settlement_out` (≤ invoice target, or the owner-set cap for legacy orders), the idempotency key, and the agent-reported `deviation_bps`. | Anything else on-chain through *that key*: it cannot approve orders, change limits, lift its own payout bound, expire orders, or call other contracts. |
| **Deployment key** — a `FullAccess` key on `fx-budget.chilliroger-operator.testnet` | Redeploying the contract code, moving the prefunded EURe vault and the retained Circle USDC held by the account. | Not governed by the DAO. **This is the real root of authority over funds.** |
| **Agent account's other key** — `chilliroger-agent.testnet` also holds a `FullAccess` key | Everything the account can do. | The "restricted key" claim applies only to the key file the runner loads, not to the account. |
| **Council / operator accounts** | Each holds a `FullAccess` key. In the demo all three council keys can sit on one machine, so "2-of-3" is enforced by the protocol but **not independent people** unless the keys are separated. | — |

Verify the key facts yourself: `pnpm verify:readonly` prints the agent's restricted key check and the number of
`FullAccess` keys on the agent and `fx-budget` accounts (informational).

### Recommended hardening before anything beyond a testnet demo (deployment task, not done here)
1. Remove the `FullAccess` keys from `fx-budget` after the final deploy (or make upgrades a DAO proposal).
2. Remove the agent account's `FullAccess` key so the restricted key is its only key.
3. Keep council keys on separate wallets/machines.
4. Add an owner-only withdrawal for retained input USDC (there is currently **no** function that moves retained
   Circle USDC out of the contract; it is stranded unless the deployment key redeploys code).

## 2. Money-movement bounds (contract)

* Every new order must carry `target_out > 0`; payouts are bounded by it. Legacy orders (`target_out == 0`) cannot pay
  until the DAO sets an explicit `set_order_payout_cap`. *(Live since the 2026-11-13 upgrade; see `docs/CONTRACT.md`.)*
* Orders above `auto_cap_in` (default $100) are `Pending` until the DAO approves; the **recipient is chosen by the
  requester** and is only reviewed by the DAO for above-cap orders. There is no supplier allow-list.
* `settlement_out` is **not** tied to `amount_in` on-chain. The agent sizes `amount_in`; a compromised agent key can
  over-charge USDC within `max_chunk_in` and the order budget, and can pay out up to the order's target.
* `deviation_bps` is agent-reported and only compared to the order's `max_dev_bps`.

## 3. Server-side surfaces

| Surface | Default | How to enable / what it enforces |
| :--- | :--- | :--- |
| Dashboard **demo signer** `POST /api/near/tx` | **Disabled** (403) | `GETNEAR_DEMO_SIGNER=1` + `GETNEAR_DEMO_TOKEN` (≥16 chars). Requires `Authorization: Bearer`, same-origin, `application/json`, and an exact allow-list of (signer, contract, method, deposit). Ordinary users sign with their own wallet. |
| Dashboard **faucet** `POST /api/faucet` | **Disabled** (403) | Same gate. Account must match `^…\.testnet$`, amount is an integer 1–1000, and the script is spawned **without a shell**. Mints the team's *demo* USDC, not Circle USDC. |
| Dashboard **agent trigger** `POST /api/agent/trigger` | **Disabled** (403) | Same gate; forwards with `AGENT_TRIGGER_TOKEN`. No local-process fallback. |
| **Agent HTTP service** (`pnpm agent:start`) | Binds **127.0.0.1**; `POST /trigger` returns 503 until `AGENT_TRIGGER_TOKEN` is set | Bearer token required for state-changing requests; CORS closed unless `AGENT_CORS_ORIGINS` lists origins; a non-loopback bind needs `AGENT_ALLOW_REMOTE=1`. |
| Agent `expire_order` | Not signed by the agent | `expire_order` is permissionless; the restricted key cannot call it. Set `AGENT_EXPIRE_SIGNER_ID` to opt in with a separate credential. |

The tests in `apps/app/tests/security.test.ts` and `apps/agent/tests/server.test.ts` assert these boundaries.

## 4. Agent payment-recovery guarantees

* A submission attempt (order, idempotency key, requested amounts, quote reference, baseline chain attempt count, and
  the transaction identity when known) is stored in SQLite **before** the transaction is broadcast.
* `near-cli` calls are bounded (`NEAR_CLI_TIMEOUT_MS`, default 120 s). A timeout or transport error leaves the attempt
  `UNCERTAIN`: **no re-send** until there is evidence that it failed (the contract recorded a *new* failed attempt, or the
  transaction failed) or can no longer land (`AGENT_ATTEMPT_LANDING_WINDOW_MS`, default 30 h ≈ transaction expiry plus margin).
* Unresolved attempts are verified at startup and at the start of every tick, including for orders that have already closed.
* SQLite is a receipt cache: a `CONFIRMED` fill is immutable (no downgrade, amounts and first receipt preserved). The
  dashboard takes status and amounts from the contract and uses SQLite only for the transaction link.
* On-chain idempotency still protects against double payment even if the agent logic were wrong.

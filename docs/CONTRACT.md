# GetNear — FxBudget Smart Contract Specification

> **Build status.** This document describes the contract source in this checkout (`contracts/fx-budget/src/lib.rs`).
> The contract currently deployed on testnet (`fx-budget.chilliroger-operator.testnet`) is the **previous build**.
> The payout-bound change below (mandatory `target_out`, `set_order_payout_cap`) is a **code-only upgrade**: the
> borsh state layout is unchanged, so **no state migration is required**, but it must be **redeployed** to take effect.
> Until then, Orders #8, #11 and #12 are historical evidence of the previous build only
> (`pnpm verify:readonly` reports whether the newer build is deployed).

The `FxBudget` smart contract (`contracts/fx-budget`) is an on-chain governance, budget-limit, and callback-verified settlement contract for corporate treasury FX payables on NEAR Testnet. It is implemented in Rust using `near-sdk` v5.7.0.

> [!IMPORTANT]
> **Key Design Constraints**:
> - **Callback-Verified NEP-141 Settlement (Testnet Demo Tokens)**: `execute_chunk` initiates a cross-contract `ft_transfer` on `settlement_token` (`eure.chilliroger-operator.testnet`, demo NEP-141 token) and attaches `on_chunk_settled` (`#[private]`). Invoice `settled_out` and `executed_in` advance **only** when `PromiseResult` confirms `ft_transfer` succeeded; failures unlock in-flight state and leave the supplier's remaining balance due unchanged.
> - **Simulated Swap Leg + Agent-Reported Deviation Policy Check**: 1Click quotes run with `dry: true` (NEAR Intents has no testnet), so the USDC FX conversion is accounting-only. On-chain, `deviation_bps >= -max_dev_bps` is an **enforced policy check on an agent-reported value**, not an oracle signature check.
> - **Sputnik DAO Ownership**: The contract is owned by a Sputnik DAO v2 council (`chilliroger-dao.sputnik-v2.testnet`). Limits, settlement token changes, upgrades (`migrate`), agent authorization, and above-cap order approvals require DAO proposals and 2-of-3 multisig votes.
> - **Restricted Key Execution**: The agent runner's operational function-call access key is restricted strictly to `execute_chunk` with `0 NEAR` allowance for attached deposits.

---

## 1. Contract State Architecture

```rust
pub struct FxBudget {
    pub owner: AccountId,                             // Sputnik DAO contract account
    pub agent: Option<AccountId>,                     // Designated automated agent account
    pub settlement_token: Option<AccountId>,          // NEP-141 payout token (eure.chilliroger-operator.testnet)
    pub requesters: IterableSet<AccountId>,           // Authorized order creation accounts
    pub auto_cap_in: u128,                            // Auto-activation threshold (default: 100 USDC)
    pub max_chunk_in: u128,                           // Max chunk size per execution (default: 20 USDC)
    pub min_interval_ns: u64,                         // Minimum interval between chunks (default: 60s)
    pub max_horizon_ns: u64,                          // Maximum order deadline horizon (7 days)
    pub paused: bool,                                 // Circuit breaker pause switch
    pub next_order_id: u64,                           // Auto-incrementing order ID counter
    pub orders: IterableMap<u64, Order>,              // Orders collection
    pub open_orders_count: LookupMap<AccountId, u32>, // Storage bounding per requester
    pub chunk_records: IterableMap<String, ChunkRecord>,   // Idempotency store keyed by idempotency_key
    pub order_chunk_keys: IterableMap<u64, Vec<String>>,   // Ordered keys per order ID
}
```

### Order & ChunkRecord Schemas

```rust
pub struct Order {
    pub id: u64,
    pub requester: AccountId,
    pub recipient: AccountId,      // Supplier payout account (defaults to requester)
    pub invoice_ref: String,       // Optional invoice reference (e.g. "INV-2026-1000")
    pub pair_label: String,        // e.g. "USDC/EURe"
    pub total_in: U128,            // Budget cap in input units (6-dec USDC)
    pub executed_in: U128,         // Callback-confirmed input budget consumed
    pub pending_in: U128,          // Input locked during an in-flight ft_transfer callback
    pub target_out: U128,          // Supplier invoice amount owed (0 = budget-only order)
    pub settled_out: U128,         // Callback-confirmed EURe transferred to recipient
    pub pending_out: U128,         // Output locked during an in-flight callback
    pub max_chunk_in: U128,        // Max per-chunk input size for this order
    pub deadline_ns: u64,          // Expiration timestamp in nanoseconds
    pub max_dev_bps: u32,          // Policy cap on agent-reported adverse deviation
    pub status: OrderStatus,       // Pending | Active | Completed | Expired | Cancelled
    pub last_chunk_ns: u64,        // Timestamp of last confirmed settlement
    pub chunks_count: u32,         // Count of callback-confirmed settlements
}

pub struct ChunkRecord {
    pub key: String,               // Deterministic idempotency_key (e.g. "order-8-seq-1")
    pub order_id: u64,
    pub amount_in: U128,
    pub settlement_out: U128,      // 6-dec NEP-141 transfer amount
    pub simulated_out: U128,       // Indicative 1Click quote simulation output
    pub recipient: AccountId,
    pub quote_ref: String,
    pub deviation_bps: i32,
    pub status: ChunkStatus,       // InFlight | Settled | Failed
    pub attempts: u32,
    pub initiated_ns: u64,
    pub settled_ns: u64,
    pub failure_reason: Option<String>,
}
```

---

## 2. Policy Limits & Defaults

| Parameter | Default Value | Human Value | Purpose |
| :--- | :--- | :--- | :--- |
| `auto_cap_in` | `100_000_000` | \$100.00 USDC | Orders $\le \$100$ become `Active` immediately. Orders $> \$100$ require Sputnik DAO approval. |
| `max_chunk_in` | `20_000_000` | \$20.00 USDC | Caps individual chunk size to enforce order dispersion. |
| `min_interval_ns` | `60_000_000_000` | 60 seconds | Enforces minimum pacing between chunks to reduce price impact. |
| `max_horizon_ns` | `604_800_000_000_000` | 7 days | Bounds the maximum allowable order duration. |
| `MAX_OPEN_ORDERS` | `16` | 16 orders | Prevents storage griefing by limiting concurrent open orders per requester. |

---

## 3. Methods & Access Control

### 3.1 Initialization, Upgrade & Admin (Owner / Self Only)

- **`new(owner: AccountId, settlement_token: Option<AccountId>)`**:
  Initializes contract state. Callable only once (`require!(!env::state_exists())`).
- **`#[init(ignore_state)] #[private] migrate(settlement_token: Option<AccountId>)`**:
  Owner/self migration hook preserving all legacy orders while backfilling invoice & idempotency collections.
- **`set_agent(agent: AccountId)`** / **`set_settlement_token(token: AccountId)`**:
  Authorizes the agent account ID and sets the NEP-141 token contract (`eure.chilliroger-operator.testnet`).
- **`add_requester(account: AccountId)`** / **`remove_requester(account: AccountId)`**:
  Authorizes or revokes corporate treasury accounts allowed to create orders.
- **`set_order_payout_cap(id, cap_out)`** *(owner only; new build)*: gives a **legacy** order (created with `target_out == 0`) an explicit cumulative payout ceiling. Requires: order exists, `target_out == 0`, status `Pending`/`Active`, `cap_out > 0`, `cap_out >= settled_out + pending_out`. Stored in raw storage under key `"P" + id` (outside the borsh state, so no migration). Until a cap is set, a legacy order **cannot make any payout**. Emits `order_payout_cap_set`.
- **`set_limits(auto_cap_in, max_chunk_in, min_interval_ns, max_horizon_ns)`**:
  Updates governance execution parameters.
- **`pause()`** / **`unpause()`**:
  Emergency circuit breaker. Pausing blocks order creation and chunk execution.

### 3.2 Order Lifecycle

- **`create_order(pair_label, total_in, deadline_ns, max_chunk_in, max_dev_bps, recipient?, target_out?, invoice_ref?) -> u64`**:
  - **Caller**: Authorized requester (or owner).
  - **Pre-conditions**:
    - Contract is not paused, `total_in > 0`, `now < deadline_ns`, `deadline_ns - now <= max_horizon_ns`, `max_chunk_in <= global max_chunk_in`, open orders $< 16$.
  - **Invoice Fields**: `recipient` defaults to requester if omitted; `target_out` is **required and must be > 0** (it is the order's on-chain payout bound; orders without one are rejected, and an escrow funding call without one is refunded by the token); `invoice_ref` tags the payable. Orders created by earlier builds with `target_out == 0` are *legacy* orders (see `set_order_payout_cap`).
  - **Status Assignment**: `total_in <= auto_cap_in` &rarr; `Active`; `total_in > auto_cap_in` &rarr; `Pending` (awaits Sputnik DAO 2-of-3 approval).
  - **Emits**: NEP-297 `order_created`.

- **`approve_order(id: u64)`**:
  - **Caller**: Contract owner only (via Sputnik DAO FunctionCall proposal).
  - **Pre-conditions**: Order must exist and be in `Pending` status.
  - **Effect**: Status transitions to `Active`.
  - **Emits**: NEP-297 `order_approved`.

- **`cancel_order(id: u64)`**:
  - **Caller**: Order requester OR contract owner.
  - **Pre-conditions**: Order must be in `Pending` or `Active` status and have no `InFlight` callback (`pending_in == 0`).
  - **Effect**: Status transitions to `Cancelled`. Decrements requester open orders.
  - **Emits**: NEP-297 `order_cancelled`.

- **`execute_chunk(id, amount_in, quote_ref, deviation_bps, simulated_out, settlement_out?, idempotency_key?)`**:
  - **Caller**: Designated agent account (via restricted `FunctionCall` access key).
  - **Idempotency**:
    - If `idempotency_key` already has status `Settled`, immediately returns `{ idempotent_replay: true, status: "Settled", ... }` without initiating any transfer.
    - If `InFlight` (either key or order `pending_in > 0`), aborts to prevent overlapping callbacks.
    - If `Failed`, permits safe retry using the same key (incrementing `attempts`).
  - **Pre-conditions**:
    - Contract is not paused, order status is `Active`, `now < order.deadline_ns`, `pending_in == 0`.
    - `amount_in <= order.max_chunk_in`, `order.executed_in + amount_in <= order.total_in`.
    - If `chunks_count > 0`, $\text{now} - \text{last\_chunk\_ns} \ge \text{min\_interval\_ns}$.
    - `deviation_bps >= -(order.max_dev_bps as i32)` (policy check on agent-reported deviation).
    - **Payout bound**: `settled_out + settlement_out <= target_out` for invoice orders; for legacy orders (`target_out == 0`) `<= payout cap`, and a missing cap rejects the call. `settlement_out` is otherwise chosen by the agent: the contract does **not** relate it to `amount_in` or `simulated_out` (the agent sizes `amount_in`; see `packages/shared/src/chunk-sizing.ts`).
  - **Cross-Contract Effect**:
    - Locks `pending_in` / `pending_out` and records `ChunkRecord` as `InFlight`.
    - Calls `ext_ft::ft_transfer(recipient, settlement_out, memo)` on `settlement_token` (1 yoctoNEAR from contract balance), chained to `#[private] on_chunk_settled(id, key, amount_in, settlement_out)`.

- **`#[private] on_chunk_settled(id, key, amount_in, settlement_out) -> ChunkSettlementView`**:
  - Inspects `env::promise_result_checked(0, 1024).is_ok()`, clears `pending_in` and `pending_out`.
  - **On success**: increments `executed_in`, `settled_out`, and `chunks_count`; updates `last_chunk_ns`; marks `ChunkStatus::Settled`; transitions order to `Completed` if `settled_out >= target_out` (for invoice orders) or `executed_in >= total_in`; emits NEP-297 `chunk_settled`.
  - **On failure**: keeps `executed_in`, `settled_out`, `chunks_count`, and supplier remaining due **unchanged**; sets `ChunkStatus::Failed` with `failure_reason`; emits NEP-297 `chunk_settlement_failed`.

- **`expire_order(id: u64)`**:
  - **Caller**: Permissionless (when `now >= deadline_ns` and `pending_in == 0`).

### 3.3 View Methods (Read-Only)

- `get_order(id: u64) -> Option<Order>`
- `list_orders(from_index: Option<u64>, limit: Option<u64>) -> Vec<Order>`
- `get_order_payout_cap(id: u64) -> Option<U128>` *(new build)*
- `get_invoice_summary(id: u64) -> Option<InvoiceSummaryView>` (exposes `target_out`, `settled_out`, `pending_out`, `remaining_due_out`)
- `get_chunk_record(key: String) -> Option<ChunkRecord>`
- `list_order_chunks(order_id: u64) -> Vec<ChunkRecord>`
- `get_limits() -> LimitsView`
- `get_owner() -> AccountId`
- `get_agent() -> Option<AccountId>`
- `get_settlement_token() -> Option<AccountId>`
- `is_requester(account: AccountId) -> bool`
- `is_paused() -> bool`
- `get_open_orders_count(account: AccountId) -> u32`

---

## 4. NEP-297 Structured Event Logging

All contract state transitions emit standardized NEP-297 events logged via `env::log_str`:

```json
EVENT_JSON:{"standard":"nep297","version":"1.0.0","event":"order_created","data":[{"id":1,"requester":"operator.testnet","pair_label":"USDC/EURe","total_in":"50000000","max_chunk_in":"20000000","deadline_ns":1762600000000000000,"max_dev_bps":120,"status":"Active"}]}
```

```json
EVENT_JSON:{"standard":"nep297","version":"1.0.0","event":"chunk_executed","data":[{"id":1,"amount_in":"20000000","executed_in":"20000000","quote_ref":"6c9e47ee-8319-4002...","deviation_bps":-85,"simulated_out":"17750000000000000000","chunks_count":1,"status":"Active"}]}
```

---

## 5. Security & Verification Audit

1. **Predecessor Assertions**:
   All access checks assert on `env::predecessor_account_id()` (the direct caller), never `signer_account_id()`, preventing relay/proxy spoofing.
2. **Checked Arithmetic**:
   All financial amounts use checked/saturating arithmetic to prevent integer overflow.
3. **Callback-Gated Settlement & Re-Entrancy Lock**:
   `pending_in` and `pending_out` plus `ChunkStatus::InFlight` prevent concurrent overlapping transfers on the same order or key, and balance due advances only inside `#[private] on_chunk_settled` on verified `PromiseResult` success.
4. **Idempotent Retry Safety**:
   Deterministic `idempotency_key` records prevent paying a settled chunk twice, while allowing failed chunks (`ChunkStatus::Failed`) to retry once the failure cause (e.g. recipient storage registration) is fixed.
5. **Every payout has an on-chain ceiling** *(new build)*:
   New orders must carry a `target_out`; legacy orders need an owner-set cap. A compromised or buggy agent key can therefore not move more EURe than the order's invoice target / cap, and cannot lift its own bound (`set_order_payout_cap` is owner-only). It can still choose *how much USDC* a chunk consumes within `max_chunk_in` and the order budget.
6. **What the DAO and the agent key do NOT control**: see `docs/SECURITY.md` (the `fx-budget` account has a separate full-access deployment key; the agent account holds a separate full-access key).
7. **Bounded Storage & Governed Upgrades**:
   Capped open orders ($16$ per requester) bound state growth; contract upgrades via `migrate` are gated by the contract's key/owner governance.

---

## 6. Build & Test Commands

```bash
# Build the release WebAssembly artifact (needs the Rust toolchain + wasm32-unknown-unknown target)
pnpm build:contract

# Tests that EXECUTE the contract logic: Rust unit tests with near-sdk's mock blockchain.
# Covers payout bounds, escrow accounting (final chunk, refund, failed callback, refund rollback), idempotency, migration.
cd contracts/fx-budget && cargo test --lib

# WASM artifact inspection + TypeScript models (does NOT execute contract code):
pnpm test:contract

# Wallet-free read-only verification of the deployed testnet evidence:
pnpm verify:readonly
```

| Check | What it actually proves |
| :--- | :--- |
| `cargo test --lib` | contract logic behaves as specified in the mocked VM. **Written but not yet executed**: the `.github/workflows/ci.yml` job is the intended runner |
| `pnpm test:contract` — WASM inspection | the `.wasm` file exports the expected method names; **not** that it was built from `lib.rs` |
| `pnpm test:contract` — TypeScript models | documents intent only; never calls the contract |
| `pnpm verify:readonly` — binary comparison | deployed bytes equal the bundled `res/fx_budget.wasm` |
| `scripts/near/verify-*.ts` | live end-to-end drills (need local credentials; write-enabled) |

---

## 7. Companion NEP-141 Fungible Token Smart Contracts

To support verifiable on-chain settlement alongside the FxBudget accounting contract, two standard NEP-141 Fungible Token smart contracts are deployed on NEAR Testnet:

### A. Token Specifications
- **USDC Contract**: `usdc.chilliroger-operator.testnet`
  - Name: `USD Coin (Testnet)`
  - Symbol: `USDC`
  - Decimals: `6`
  - Initial Supply: `1,000,000 USDC`
- **EURe Contract**: `eure.chilliroger-operator.testnet`
  - Name: `Euro Stablecoin (Testnet)`
  - Symbol: `EURe`
  - Decimals: `6`
  - Initial Supply: `1,000,000 EURe`

### B. Standard Interfaces Implemented
1. **NEP-141 Core**:
   - `ft_transfer(receiver_id, amount, memo)` (requires 1 yoctoNEAR attached deposit)
   - `ft_balance_of(account_id)` &rarr; `U128`
   - `ft_total_supply()` &rarr; `U128`
2. **NEP-148 Metadata**:
   - `ft_metadata()` &rarr; returns spec, name, symbol, icon, decimals
3. **NEP-145 Storage Management**:
   - `storage_deposit(account_id, registration_only)` (requires 0.0125 NEAR deposit)
   - `storage_balance_of(account_id)` &rarr; returns `{ total, available }`
4. **Testnet Faucet & Mint**:
   - `mint(account_id, amount)` &rarr; used by `/api/faucet` and onboarding scripts to dispense test tokens.

### C. Vault Settlement Architecture
- The `fx-budget.chilliroger-operator.testnet` contract account is pre-registered on both tokens via NEP-145 `storage_deposit`.
- The vault was seeded with **100,000 EURe** (testnet demo NEP-141 liquidity).
- Upon `execute_chunk`, `fx-budget` invokes `ext_ft::ft_transfer` directly on `settlement_token` (`eure.chilliroger-operator.testnet`) to pay `order.recipient`, advancing `settled_out` and reducing invoice balance due solely inside the `on_chunk_settled` callback.



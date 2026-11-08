# GetNear — FxBudget Smart Contract Specification

The `FxBudget` smart contract (`contracts/fx-budget`) is an immutable, on-chain accounting and governance gate for corporate treasury FX execution on NEAR Protocol. It is implemented in Rust using `near-sdk` v5.30.

> [!IMPORTANT]
> **Key Design Constraints**:
> - **Accounting Only**: Fills are simulated; no tokens move on-chain, and function-call keys cannot attach deposits.
> - **Sputnik DAO Ownership**: The contract is owned by a Sputnik DAO v2 council. Limits, agent authorization, and above-cap order approvals require DAO proposals and 2-of-3 multisig votes.
> - **Restricted Key Execution**: The agent runner's function-call access key is restricted strictly to `execute_chunk`.

---

## 1. Contract State Architecture

```rust
pub struct FxBudget {
    pub owner: AccountId,                      // Sputnik DAO contract account
    pub agent: Option<AccountId>,              // Designated automated agent account
    pub requesters: IterableSet<AccountId>,    // Authorized order creation accounts
    pub auto_cap_in: u128,                     // Auto-activation threshold (100 USDC = 100,000,000)
    pub max_chunk_in: u128,                    // Max chunk size per execution (20 USDC = 20,000,000)
    pub min_interval_ns: u64,                  // Minimum interval between chunks (60s = 60,000,000,000 ns)
    pub max_horizon_ns: u64,                   // Maximum order deadline horizon (7 days)
    pub paused: bool,                          // Circuit breaker pause switch
    pub next_order_id: u64,                    // Auto-incrementing order ID counter
    pub orders: IterableMap<u64, Order>,       // Orders collection
    pub open_orders_count: LookupMap<AccountId, u32>, // Storage bounding per requester
}
```

### Order Schema

```rust
pub struct Order {
    pub id: u64,
    pub requester: AccountId,
    pub pair_label: String,        // e.g. "USDC/EURe"
    pub total_in: U128,            // Total input amount (atomic units)
    pub executed_in: U128,         // Total amount filled so far
    pub max_chunk_in: U128,        // Max per-chunk input size for this order
    pub deadline_ns: u64,          // Expiration timestamp in nanoseconds
    pub max_dev_bps: u32,          // Maximum allowed adverse deviation (e.g. 120 bps)
    pub status: OrderStatus,       // Pending | Active | Completed | Expired | Cancelled
    pub last_chunk_ns: u64,        // Timestamp of last executed chunk
    pub chunks_count: u32,         // Number of chunks executed so far
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

### 3.1 Initialization & Admin (Owner Only)

- **`new(owner: AccountId)`**:
  Initializes contract state. Callable only once (`require!(!env::state_exists())`).
- **`set_agent(agent: AccountId)`**:
  Authorizes the agent account ID for chunk execution.
- **`add_requester(account: AccountId)`** / **`remove_requester(account: AccountId)`**:
  Authorizes or revokes corporate treasury accounts allowed to create orders.
- **`set_limits(auto_cap_in, max_chunk_in, min_interval_ns, max_horizon_ns)`**:
  Updates governance execution parameters.
- **`pause()`** / **`unpause()`**:
  Emergency circuit breaker. Pausing blocks order creation and chunk execution.

### 3.2 Order Lifecycle

- **`create_order(pair_label, total_in, deadline_ns, max_chunk_in, max_dev_bps) -> u64`**:
  - **Caller**: Authorized requester (or owner).
  - **Pre-conditions**:
    - Contract is not paused.
    - `total_in > 0`.
    - `now < deadline_ns` and `deadline_ns - now <= max_horizon_ns`.
    - `max_chunk_in <= global max_chunk_in` and `max_chunk_in <= total_in`.
    - Requester open orders $< 16$.
  - **Status Assignment**:
    - If `total_in <= auto_cap_in` &rarr; `Active`.
    - If `total_in > auto_cap_in` &rarr; `Pending` (awaits Sputnik DAO council approval).
  - **Emits**: NEP-297 `order_created`.

- **`approve_order(id: u64)`**:
  - **Caller**: Contract owner only (via Sputnik DAO FunctionCall proposal).
  - **Pre-conditions**: Order must exist and be in `Pending` status.
  - **Effect**: Status transitions to `Active`.
  - **Emits**: NEP-297 `order_approved`.

- **`cancel_order(id: u64)`**:
  - **Caller**: Order requester OR contract owner.
  - **Pre-conditions**: Order must be in `Pending` or `Active` status.
  - **Effect**: Status transitions to `Cancelled`. Decrements requester open orders.
  - **Emits**: NEP-297 `order_cancelled`.

- **`execute_chunk(id, amount_in, quote_ref, deviation_bps, simulated_out)`**:
  - **Caller**: Designated agent account (via restricted function-call access key).
  - **Pre-conditions**:
    - Contract is not paused.
    - Order status is `Active`.
    - Current block timestamp $< \text{order.deadline\_ns}$.
    - `amount_in <= order.max_chunk_in`.
    - `order.executed_in + amount_in <= order.total_in`.
    - If `chunks_count > 0`, $\text{now} - \text{last\_chunk\_ns} \ge \text{min\_interval\_ns}$.
    - `deviation_bps >= -order.max_dev_bps` (adverse deviation does not exceed order limit).
  - **Effect**:
    - Updates `executed_in`, `last_chunk_ns`, and increments `chunks_count`.
    - If `executed_in == total_in` &rarr; status becomes `Completed`.
  - **Emits**: NEP-297 `chunk_executed`.

- **`expire_order(id: u64)`**:
  - **Caller**: Permissionless (anyone can call).
  - **Pre-conditions**: $\text{now} \ge \text{order.deadline\_ns}$ and order is `Pending` or `Active`.
  - **Effect**: Status transitions to `Expired`. Decrements requester open orders.
  - **Emits**: NEP-297 `order_expired`.

### 3.3 View Methods (Read-Only)

- `get_order(id: u64) -> Option<Order>`
- `list_orders(from_index: Option<u64>, limit: Option<u64>) -> Vec<Order>`
- `get_limits() -> LimitsView`
- `get_owner() -> AccountId`
- `get_agent() -> Option<AccountId>`
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
   All financial amounts use checked addition (`checked_add`) and saturation logic to prevent integer overflow.
3. **No Cross-Contract Promises**:
   The contract is a fully self-contained state machine. It does not await external contract callbacks, eliminating re-entrancy attack surfaces.
4. **Bounded Storage**:
   Capped open orders ($16$ per requester) prevent malicious state ballooning.
5. **No Upgrade Path**:
   The contract code is non-upgradable to ensure predictable, immutable rules.

---

## 6. Build & Test Commands

```bash
# Build release WebAssembly artifact
cd contracts/fx-budget
cargo build --target wasm32-unknown-unknown --release

# Run comprehensive test suite
pnpm test:contract
```


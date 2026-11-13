# GetNear — Failure Drills & Fault Tolerance (P12)

This document details the expected and verified behavior of GetNear under network disruptions, API outages, adversarial inputs, and edge cases on NEAR testnet.

---

## 1. NEAR RPC Outage or Rate Limiting

* **Trigger**: Primary testnet RPC (`https://rpc.testnet.near.org`) experiences 429 rate-limiting or 503 gateway timeouts.
* **Mechanism**: 
  - `NearClient` in `packages/near-client` takes an array of RPC endpoints (`RPC_URLS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org']`).
  - Calls catch network errors and HTTP 429/5xx responses and immediately retry transparently against `test.rpc.fastnear.com`.
  - Exponential backoff with jitter prevents thundering herds.
* **Observed State**: Verifier and Agent runner complete turns without crashing.

---

## 2. 1Click Quote Outage or Excessive Spread

* **Trigger**: 1Click dry-quote service is unreachable, or market spread diverges past `max_deviation_bps` (e.g. > 120 bps from ECB reference rate).
* **Mechanism**:
  - The strategy engine calculates deviation: `(quoted_rate - ecb_ref_rate) / ecb_ref_rate * 10000`.
  - If deviation is unfavorable and exceeds `max_deviation_bps`, or if 1Click API fails, `AgentRunner.tick()` sets decision to `WAIT`.
  - No transaction is submitted to the NEAR blockchain.
  - The decision is logged to SQLite with reason `"Deviation -180 bps exceeds order max 120 bps"` or `"Quote unavailable"`.
* **Observed State**: Funds remain safe in escrow; order remains `Active` waiting for favorable conditions.

---

## 3. Rejected Sputnik DAO Proposal

* **Trigger**: An above-cap order ($250 USDC budget > $100 auto-cap) is submitted, creating a Sputnik DAO proposal. Council members vote `VoteReject`.
* **Mechanism**:
  - The proposal status on Sputnik DAO becomes `Rejected`.
  - The `approve_order` cross-contract call is never dispatched to `FxBudget`.
  - The order on `FxBudget` remains in `Pending` status.
  - The agent is restricted from calling `execute_chunk` on `Pending` orders (contract panics with `"Order is not active"`).
  - The requester or owner can call `cancel_order({ id })` to reclaim funds.
* **Observed State**: Zero unauthorized funds move.

---

## 4. Contract Emergency Pause

* **Trigger**: The DAO council votes to pause operations during an incident by calling `FxBudget::set_paused(true)`.
* **Mechanism**:
  - `FxBudget` checks `assert!(!self.paused, "Contract is paused")` on all state-mutating entry points (`create_order`, `ft_on_transfer`, `execute_chunk`).
  - Read-only views (`get_order`, `get_order_escrow`, `is_paused`) remain functional.
  - If the agent attempts a tick, the transaction reverts and the error is logged without recording a fake fill.
* **Observed State**: System safely halts until `set_paused(false)` is voted.

---

## 5. Expired Order & Unspent Escrow Refund

* **Trigger**: Order deadline timestamp (`deadline_ns`) passes before the invoice target has been fully settled.
* **Mechanism**:
  - Once `env::block_timestamp() >= deadline_ns`, the agent refuses to execute further chunks.
  - Anyone can call `expire_order({ id })`.
  - `FxBudget` sets the order status to `Expired`.
  - If the order was funded with Circle Native USDC escrow, `expire_order` automatically dispatches `ft_transfer` returning all remaining unspent USDC back to the requester account.
  - Demonstrated on live testnet in **Order #11** (`INV-EXPIRY-DEMO`, where unspent balance remained and was refunded).
* **Observed State**: Requester receives unspent escrow; supplier keeps already settled payouts.

---

## 6. Nonce Collision & Idempotent Chunks

* **Trigger**: Network latency causes transaction retry while a chunk execution is in flight.
* **Mechanism**:
  - Each chunk execution requires an explicit `idempotency_key` (`order-{id}-seq-{index}`).
  - `FxBudget` records every executed chunk in `chunk_records`.
  - If the same chunk key is submitted twice, the second call reverts with `"Chunk already executed"`.
  - The agent tracks attempt status in SQLite `agent_attempts`, ensuring no duplicate payouts occur.
* **Observed State**: Exactly-once payout semantics guaranteed on-chain.


# GetNear — Testnet Live Demo Log (Block P8)

This document records all deployed testnet accounts, contract transactions, Sputnik DAO governance votes, and state transitions executed live on NEAR testnet.

---

## 1. Environment & Network Configuration

- **Network**: NEAR Testnet (`testnet`)
- **Primary RPC**: `https://rpc.testnet.near.org`
- **Fallback RPC**: `https://test.rpc.fastnear.com`
- **Explorer Base**: `https://testnet.nearblocks.io`

### Core Accounts

| Role | Account ID | Initial Balance | Purpose |
| :--- | :--- | :--- | :--- |
| **Operator / Requester** | `chilliroger-operator.testnet` | 10.0 NEAR | Creates FX orders and proposals |
| **Sputnik DAO Council 1** | `chilliroger-council1.testnet` | 10.0 NEAR | Multisig voting council member |
| **Sputnik DAO Council 2** | `chilliroger-council2.testnet` | 10.0 NEAR | Multisig voting council member |
| **Sputnik DAO Council 3** | `chilliroger-council3.testnet` | 10.0 NEAR | Multisig voting council member |
| **Agent Runner** | `chilliroger-agent.testnet` | 10.0 NEAR | Autonomous execution agent |

---

## 2. On-Chain Contracts Deployed

### A. Sputnik DAO v2
- **DAO Account**: `chilliroger-dao.sputnik-v2.testnet`
- **Factory**: `sputnik-v2.testnet`
- **Creation Deposit**: `5.5 NEAR`
- **Creation Tx**: [`5EGoG2pHNokEvYtt7MxSUjXAQFhRUzaZQPVb9QNJSZMe`](https://testnet.nearblocks.io/txns/5EGoG2pHNokEvYtt7MxSUjXAQFhRUzaZQPVb9QNJSZMe)
- **Policy**:
  - Council: `["chilliroger-council1.testnet", "chilliroger-council2.testnet", "chilliroger-council3.testnet"]`
  - Voting Threshold: `2 of 3` (`[1, 2]`)
  - Proposal Bond: `0.1 NEAR` (`10^23 yoctoNEAR`)

### B. FxBudget Smart Contract
- **Contract Account**: `fx-budget.chilliroger-operator.testnet`
- **Subaccount Creation Tx**: [`6tCoQai3kLe2ZF1sanpSvj71fgr2GcFpWfiyNKTqDSqr`](https://testnet.nearblocks.io/txns/6tCoQai3kLe2ZF1sanpSvj71fgr2GcFpWfiyNKTqDSqr)
- **WASM Deployment & Init (`new`) Tx**: [`B1ckaymEsrLpX8W9eNJRmJiYvt7k8RvFpgghyttJg7Ba`](https://testnet.nearblocks.io/txns/B1ckaymEsrLpX8W9eNJRmJiYvt7k8RvFpgghyttJg7Ba)
- **Owner**: `chilliroger-dao.sputnik-v2.testnet`
- **Limits**:
  - Auto-Cap Limit: `100.00 USDC` (`100,000,000`)
  - Max Chunk Limit: `20.00 USDC` (`20,000,000`)
  - Min Interval: `60 seconds`
  - Max Horizon: `7 days`

---

## 3. Sputnik DAO Governance Bootstrapping

The FxBudget contract owner is `chilliroger-dao.sputnik-v2.testnet`. All initial configuration was passed via on-chain DAO proposals:

| Proposal ID | Method Called | Target | Status | Execution Tx |
| :--- | :--- | :--- | :--- | :--- |
| **#0** | `set_agent("chilliroger-agent.testnet")` | `fx-budget` | **Approved** | [`8URhUkitj5oyqLcLZrfUcaCeds47mWW3AKkQAwzXDdga`](https://testnet.nearblocks.io/txns/8URhUkitj5oyqLcLZrfUcaCeds47mWW3AKkQAwzXDdga) |
| **#1** | `add_requester("chilliroger-operator.testnet")` | `fx-budget` | **Approved** | [`9oZseZ6Eq69dQ6GRHjfWSZMnHNMt32BhXt1uGD1pgcsf`](https://testnet.nearblocks.io/txns/9oZseZ6Eq69dQ6GRHjfWSZMnHNMt32BhXt1uGD1pgcsf) |
| **#2** | `ChangePolicy(threshold: [1, 2])` | `chilliroger-dao` | **Approved** | [`8EWCB3QSnWPu7WHHqD6RHmZhpKrEqirabbBiE9kSqXtp`](https://testnet.nearblocks.io/txns/8EWCB3QSnWPu7WHHqD6RHmZhpKrEqirabbBiE9kSqXtp) |

---

## 4. Agent Restricted Function-Call Access Key

Per security requirements, `chilliroger-agent.testnet` holds a restricted access key allowing ONLY `execute_chunk` on `fx-budget.chilliroger-operator.testnet`:

- **Key Addition Tx**: [`5UMP8Yo2BLGNg2ceX8XX5FjVannj2Zi5zxskr4bvzgKR`](https://testnet.nearblocks.io/txns/5UMP8Yo2BLGNg2ceX8XX5FjVannj2Zi5zxskr4bvzgKR)
- **Public Key**: `ed25519:55z4nYpHCrdGppDYe2HWvGJq9tLFJLYMMrTcPhYGERd9`
- **Receiver**: `fx-budget.chilliroger-operator.testnet`
- **Allowed Methods**: `["execute_chunk"]`
- **Allowance**: `0.25 NEAR` (`250,000,000,000,000,000,000,000 yoctoNEAR`)
- **Deposit**: `0` (function-call keys cannot attach deposits)

---

## 5. End-to-End Above-Cap Order & 2-of-3 Approval Flow

Demonstrates complete lifecycle of an above-cap order:

1. **Order Creation (`create_order`)**:
   - Order ID: `#1`
   - Pair: `USDC_EUR`
   - Total Amount: `250.00 USDC` (exceeds global `100.00 USDC` auto-cap)
   - Status: `Pending`
   - Creation Tx: [`GA3EP7g8Fqufo6nLE9gzeGNY53jxqaNKPi1yNGNdFJD2`](https://testnet.nearblocks.io/txns/GA3EP7g8Fqufo6nLE9gzeGNY53jxqaNKPi1yNGNdFJD2)
   - Event Emitted:
     ```json
     {"standard":"nep297","version":"1.0.0","event":"order_created","data":[{"id":1,"requester":"chilliroger-operator.testnet","pair_label":"USDC_EUR","total_in":"250000000","max_chunk_in":"20000000","deadline_ns":1794223760595000000,"max_dev_bps":120,"status":"Pending"}]}
     ```

2. **Sputnik DAO Proposal Created (`add_proposal`)**:
   - Proposal ID: `#3`
   - Target: `fx-budget.chilliroger-operator.testnet`
   - Method: `approve_order({ id: 1 })`
   - Bond: `0.1 NEAR`

3. **Council Voting (2-of-3 threshold)**:
   - Vote 1 (Council 1): [`H5wqLmWiDUDez8hqtcd6KFzkkn3syhi9XWFFoJYHNR8z`](https://testnet.nearblocks.io/txns/H5wqLmWiDUDez8hqtcd6KFzkkn3syhi9XWFFoJYHNR8z)
   - Vote 2 (Council 2): [`4u33ougX5qW7oFqo3V6U489M8aDK8fX8zu2r6XHRcPGy`](https://testnet.nearblocks.io/txns/4u33ougX5qW7oFqo3V6U489M8aDK8fX8zu2r6XHRcPGy)

4. **Automatic Execution & State Transition**:
   - Sputnik DAO executed `approve_order(1)` upon receiving the second vote.
   - Event Emitted on `fx-budget`:
     ```json
     {"standard":"nep297","version":"1.0.0","event":"order_approved","data":[{"id":1,"status":"Active"}]}
     ```
   - Proposal #3 Status: `Approved`
   - Order #1 Status: `Active` (Ready for Agent execution)

---

## 6. Autonomous Agent Execution (Block P9)

The autonomous agent runner (`@getnear/agent` in `apps/agent`) monitors active orders via contract views, fetches live 1Click dry-quotes and official ECB rates, evaluates adaptive TWAP strategy, and executes chunks on NEAR testnet using its restricted function-call key:

### Order #1 Execution Trace (250 USDC Total)

| Chunk | Amount In | Simulated Out | Quote Ref | Tx Hash & Explorer Link |
| :--- | :--- | :--- | :--- | :--- |
| **#1** | 20.00 USDC | 18.4000 EURe | `sha256:d8a57321e86016d1` | [`5WLUTL3GZX5m7fFqDM6Jd3uA1nHTZiirmbHrDGJBEGMq`](https://testnet.nearblocks.io/txns/5WLUTL3GZX5m7fFqDM6Jd3uA1nHTZiirmbHrDGJBEGMq) |
| **#2** | 20.00 USDC | 17.7484 EURe | `sha256:749d170d4cfd80fb54244150597fd5c0` | [`2QF4Un9mUov6aThRtxKeQACE7nPGxNqPQvQQnDQrmKVc`](https://testnet.nearblocks.io/txns/2QF4Un9mUov6aThRtxKeQACE7nPGxNqPQvQQnDQrmKVc) |
| **#3** | 20.00 USDC | 17.7484 EURe | `sha256:e2d2938751269cb9f2c68b545b84994a` | [`EdZqU3PjhgSWGAeVgSF3xoqq9iFKBf5LJF7KZPtuGzzk`](https://testnet.nearblocks.io/txns/EdZqU3PjhgSWGAeVgSF3xoqq9iFKBf5LJF7KZPtuGzzk) |

### On-Chain Event Proof (Chunk #3)
```json
{
  "standard": "nep297",
  "version": "1.0.0",
  "event": "chunk_executed",
  "data": [{
    "id": 1,
    "amount_in": "20000000",
    "executed_in": "60000000",
    "quote_ref": "sha256:e2d2938751269cb9f2c68b545b84994a",
    "deviation_bps": -92,
    "simulated_out": "17748368589286141090",
    "chunks_count": 3,
    "status": "Active"
  }]
}
```

### Local Audit & Observability
- All fills are tracked locally in SQLite (`apps/agent/data/agent.db`).
- Strategy evaluations and WAIT decisions are logged with granular rationale.
- Observability REST API server is exposed on port `38175` with endpoints:
  - `GET /health` — Agent uptime and service status
  - `GET /status` — Current loop state, order count, and lock status
  - `GET /fills` — Complete list of fills with transaction hashes
  - `GET /decisions` — Complete audit trail of WAIT / EXECUTE decisions
  - `POST /trigger` — Manual tick trigger for ops / testing

---

## 7. Real NEP-141 Stablecoin Deployment & On-Chain Settlement (Block P10.5)

To eliminate simulated accounting and demonstrate true dynamic Web3 capability, GetNear deploys two official standard NEP-141 Fungible Token smart contracts and integrates real on-chain transfers directly into the autonomous agent loop:

### A. Deployed NEP-141 Token Contracts

| Token | Contract Account ID | Decimals | Total Supply | Deployment & Init Tx |
| :--- | :--- | :--- | :--- | :--- |
| **USDC** | `usdc.chilliroger-operator.testnet` | 6 | 1,000,000 | [`A1gD9RxFbLbg3fon2wGaC1mxErJJDBfQKccGb1jmMKJu`](https://testnet.nearblocks.io/txns/A1gD9RxFbLbg3fon2wGaC1mxErJJDBfQKccGb1jmMKJu) |
| **EURe** | `eure.chilliroger-operator.testnet` | 6 | 1,000,000 | [`Bd6FkM9u5JkvF4ytFGwJRNT8p39FQQSKccv7XaUuzwCM`](https://testnet.nearblocks.io/txns/Bd6FkM9u5JkvF4ytFGwJRNT8p39FQQSKccv7XaUuzwCM) |

### B. Protocol Vault Storage & Liquidity Seeding
- **NEP-145 Storage Registration**: Registered `fx-budget.chilliroger-operator.testnet`, all council accounts, and agent accounts on both token contracts (`storage_deposit` with 0.0125 NEAR).
- **Vault Liquidity Seed**: Transferred **100,000 EURe** (`100,000,000,000` atomic units) from operator to `fx-budget.chilliroger-operator.testnet` to act as the automated on-chain settlement liquidity reserve.

### C. Legacy Pre-Callback Settlement Proof (Historical Baseline)
Verified prior to the callback-verified contract upgrade (Order #7 Chunk #2):
1. **Live Strategy Evaluation**:
   - Pair: `USDC/EURe` | Chunk Input: `20.00 USDC` | Quote: `0.8890 EURe/USDC` vs ECB `0.8934` (`-49 bps`, agent-reported) -> `17.780824 EURe`
2. **Legacy Two-Transaction Pattern (Replaced in Section 8)**:
   - `execute_chunk`: [`DSXaxdXchXT2jsiQ5dNRGU37t37T9PRM373w7NuTjLek`](https://testnet.nearblocks.io/txns/DSXaxdXchXT2jsiQ5dNRGU37t37T9PRM373w7NuTjLek)
   - Separate `ft_transfer`: [`EHLGpffWZkrZphKb3BGLst4XTraWPkw2kijwYADrzNMw`](https://testnet.nearblocks.io/txns/EHLGpffWZkrZphKb3BGLst4XTraWPkw2kijwYADrzNMw)

---

## 8. Callback-Verified €1,000 Supplier Invoice & Failure-Safety Proof (Post-Audit Upgrade)

To close the gap between chunk accounting and confirmed token delivery, `FxBudget` (`fx-budget.chilliroger-operator.testnet`) was upgraded & migrated (`migrate` tx [`EKfuns36z7MM6tAUxZYTmHbgP4uYxMGa457zEWXowATD`](https://testnet.nearblocks.io/txns/EKfuns36z7MM6tAUxZYTmHbgP4uYxMGa457zEWXowATD)) so `execute_chunk` dispatches cross-contract `ft_transfer` directly and updates `settled_out` / `remaining_due_out` solely inside `#[private] on_chunk_settled`.

Reproduced end-to-end via `pnpm tsx scripts/near/verify-invoice-settlement.ts`:

- **Restricted Key Isolation Proven**: Agent resolved `chilliroger-agent.testnet`'s `FunctionCall` key (`execute_chunk` on `fx-budget.chilliroger-operator.testnet` only); calling `eure.storage_deposit` with that credential was rejected at protocol level.
- **Invoice Payable**: `Order #8` (`INV-2026-1000`), supplier `supplier-eu.chilliroger-operator.testnet`, target owed **`€1,000.00 EURe`** (`1,500 USDC` budget > `$700` drill auto-cap, approved by Sputnik DAO Proposal #8 2-of-3 vote).
- **Confirmed Payment Reduces Balance**: Chunk #1 (`order-8-seq-1`) transferred `582.760093 EURe` cross-contract; callback set `settled_out = 582.760093 EURe`, reducing remaining due from `€1,000.00` to **`€417.24 EURe`**, and persisted `CONFIRMED` (`is_simulated = false`).
- **Idempotent Replay Pays Zero**: Replaying `order-8-seq-1` transferred `0 EURe` and returned `idempotent_replay: true`.
- **Failed Payment Leaves Balance Unchanged**: Unregistering `supplier-eu` on `eure` caused Chunk #2 (`order-8-seq-2`, attempt 1) cross-contract `ft_transfer` to fail on-chain; `on_chunk_settled` marked `ChunkStatus::Failed`, left `settled_out` at `582.760093` and **remaining due unchanged at `€417.24`**, and `AgentRunner` persisted `FAILED` with **`is_simulated = true`** (never `false`).
- **Retry Completes Without Double-Pay**: Re-registering `supplier-eu` and retrying `order-8-seq-2` (attempt 2) transferred the remaining **`417.239907 EURe`**, settling `Order #8` to **`Completed`** (`€1,000.00` settled, `€0.00` remaining due, `+€1,000.00 EURe` supplier balance). Standard contract limits (`$100` auto-cap / `$20` max-chunk / `60s`) were then restored via DAO Proposal #9.

| Step | Action | On-Chain Result | NEARBlocks Explorer Link |
| :--- | :--- | :--- | :--- |
| Contract Upgrade | `deploy` + `migrate` (`settlement_token`) | 7 orders preserved; invoice state active | [`EKfuns36z7MM6tAUxZYTmHbgP4uYxMGa457zEWXowATD`](https://testnet.nearblocks.io/txns/EKfuns36z7MM6tAUxZYTmHbgP4uYxMGa457zEWXowATD) |
| DAO Drill Limits | Prop #7 2-of-3 approve | Raised drill cap to `$700 / $650 / 5s` | [`DLjMD6Em81gafcfmayBjFYDCDK3aZvWMuhnADkzBCKS4`](https://testnet.nearblocks.io/txns/DLjMD6Em81gafcfmayBjFYDCDK3aZvWMuhnADkzBCKS4) |
| Create Invoice | `create_order` (#8, `INV-2026-1000`) | `Pending` · `€1,000.00` remaining due | [`28AjjbNGGHyYEwWD8sAWoMAQTZGVpGLSDShvNgwBfRze`](https://testnet.nearblocks.io/txns/28AjjbNGGHyYEwWD8sAWoMAQTZGVpGLSDShvNgwBfRze) |
| DAO Approve #8 | Prop #8 2-of-3 approve | Order `#8` transitioned to `Active` | [`9eHYwHCZVPLvECUbJ8E3q9LMgiAXAuEE5SzWgnPxezVq`](https://testnet.nearblocks.io/txns/9eHYwHCZVPLvECUbJ8E3q9LMgiAXAuEE5SzWgnPxezVq) |
| Chunk #1 Confirmed | `execute_chunk` (`order-8-seq-1`) | `+€582.76 EURe` · Due reduced to `€417.24` | [`EATGRqzgJF4Y5KyC7RKQuQ5wC5b21JVYNycGkYyvAC1m`](https://testnet.nearblocks.io/txns/EATGRqzgJF4Y5KyC7RKQuQ5wC5b21JVYNycGkYyvAC1m) |
| Replay `seq-1` | `execute_chunk` (`order-8-seq-1`) | `0 EURe` moved (`idempotent_replay: true`) | [`5aAovDnuWo7gE877m6jb1PYraZWcWm2HpZEbz3ie9z8Y`](https://testnet.nearblocks.io/txns/5aAovDnuWo7gE877m6jb1PYraZWcWm2HpZEbz3ie9z8Y) |
| Chunk #2 Failed | `execute_chunk` (`order-8-seq-2` #1) | `ft_transfer` failed · Due still `€417.24` · `is_simulated=true` | [`Dq2WdyNTou6jFQ2rDHAuXcgwpK4xqTJJFQXy8ZotNSrf`](https://testnet.nearblocks.io/txns/Dq2WdyNTou6jFQ2rDHAuXcgwpK4xqTJJFQXy8ZotNSrf) |
| Chunk #2 Retry | `execute_chunk` (`order-8-seq-2` #2) | `+€417.24 EURe` · `Completed` (`€0.00` due) | [`7D78yZ4FPtqYc4cpsFYid3JKarV1cZj578aFcerbXMoZ`](https://testnet.nearblocks.io/txns/7D78yZ4FPtqYc4cpsFYid3JKarV1cZj578aFcerbXMoZ) |
| Restore Limits | Prop #9 2-of-3 approve | Restored `$100` cap / `$20` chunk / `60s` | [`AgTaV88Mu8s9icJZWhMFJGTgNZoRtdgyYXFhFrgNb1Vb`](https://testnet.nearblocks.io/txns/AgTaV88Mu8s9icJZWhMFJGTgNZoRtdgyYXFhFrgNb1Vb) |

---

## 9. Policy Bounds Rejections & Deadline-Expired Unpaid Remainder Proof

Reproduced live on NEAR testnet (`fx-budget.chilliroger-operator.testnet`) via `pnpm tsx scripts/near/verify-bounds-and-expiry.ts`:

- **Above-Threshold `Pending` Gate (`Order #10`, `INV-PENDING-GATE`)**: Created `120 USDC` order (`> 100 USDC` auto-cap), attempted `execute_chunk` before DAO approval -> rejected on-chain (`settled_out` remained `0`), then cancelled cleanly.
- **Bounds & Deadline Enforcement (`Order #11`, `INV-EXPIRY-DEMO -> supplier-eu.chilliroger-operator.testnet`)**:
  - Approved constraints: `15 USDC` max budget, `10 USDC` max chunk, `€25.00 EURe` invoice target, 65s horizon.
  - Non-agent caller, chunk `> max_chunk_in` (`$12 > $10`), payout `> target_out` (`€26 > €25`), chunk `> remaining budget` (`$10 + $6 > $15`), and post-deadline `execute_chunk` calls were all rejected cleanly on-chain.
- **Confirmed Partial Settlement + Expired Unpaid Remainder**: Chunk #1 (`order-11-seq-1`) transferred **`€8.70 EURe`**, leaving **`€16.30 EURe` remaining due**; after deadline expiry, `expire_order` transitioned `Order #11` to **`Expired`** while preserving the unpaid remainder on-chain (`€8.70 paid`, **`€16.30 unpaid remainder`**).

| Step | Action / Assertion | On-Chain Result | NEARBlocks Explorer Link |
| :--- | :--- | :--- | :--- |
| Create Pending Order #10 | `create_order` (`120 USDC`) | Started `Pending` (`> 100 USDC` auto-cap) | [`G9G8YW9SWDJEzW7N9PTFv6JgQEoXSy5cbLEhtkUtHz9x`](https://testnet.nearblocks.io/txns/G9G8YW9SWDJEzW7N9PTFv6JgQEoXSy5cbLEhtkUtHz9x) |
| Reject Unapproved Execution | `execute_chunk` on Pending #10 | Rejected (`settled_out = 0`) | [`FogZ88dxv1YaPM4H8BDPQaCiFkNpNRJC3fAw2yPKmeov`](https://testnet.nearblocks.io/txns/FogZ88dxv1YaPM4H8BDPQaCiFkNpNRJC3fAw2yPKmeov) |
| Create Invoice Order #11 | `create_order` (`INV-EXPIRY-DEMO`) | `Active` (`€25.00` target, 65s deadline) | [`GXXG9WAtmajEoi1a2L5fyUGGLteB6fCbZSBZYaBq7FgB`](https://testnet.nearblocks.io/txns/GXXG9WAtmajEoi1a2L5fyUGGLteB6fCbZSBZYaBq7FgB) |
| Reject Non-Agent Signer | `execute_chunk` by operator | Rejected (restricted to designated agent) | [`D72DjfBnUndsEd8uojXq2Rxs4J8cMAfWakJp5bpwTNcg`](https://testnet.nearblocks.io/txns/D72DjfBnUndsEd8uojXq2Rxs4J8cMAfWakJp5bpwTNcg) |
| Reject Over Chunk Cap | `execute_chunk` (`$12 > $10`) | Rejected (`max_chunk_in` exceeded) | [`EHaHo7BbwZ9hAz9A5v3BzD5zrRBjFuQYbUJKGvUefrUD`](https://testnet.nearblocks.io/txns/EHaHo7BbwZ9hAz9A5v3BzD5zrRBjFuQYbUJKGvUefrUD) |
| Reject Over Target Due | `execute_chunk` (`€26 > €25`) | Rejected (`target_out` exceeded) | [`9N1nChTVXpkW2Y4Gjnuub4NmZPk1G8rbHaLEQWsKp685`](https://testnet.nearblocks.io/txns/9N1nChTVXpkW2Y4Gjnuub4NmZPk1G8rbHaLEQWsKp685) |
| Partial Chunk #1 Settled | `execute_chunk` (`order-11-seq-1`) | `+€8.70 EURe` paid · `€16.30` due | [`5V8BxTDbR6oF4SJoBMsLjH2X2yRD2d1UY4FwLyLRcWv6`](https://testnet.nearblocks.io/txns/5V8BxTDbR6oF4SJoBMsLjH2X2yRD2d1UY4FwLyLRcWv6) |
| Reject Over Budget | `execute_chunk` (`$10 + $6 > $15`) | Rejected (`total_in` budget exceeded) | [`7jFtktKnY5ptCrhebY37pRyDvP5FWuea1xpCQt8ejkdo`](https://testnet.nearblocks.io/txns/7jFtktKnY5ptCrhebY37pRyDvP5FWuea1xpCQt8ejkdo) |
| Reject Past Deadline | `execute_chunk` after deadline | Rejected (`deadline_ns` elapsed) | [`26SHaenHziV8cUdBMmDKfpQd8mE1x7y8QzkeuoM953Nf`](https://testnet.nearblocks.io/txns/26SHaenHziV8cUdBMmDKfpQd8mE1x7y8QzkeuoM953Nf) |
| Expire With Remainder | `expire_order` (#11) | `Expired` · **`€16.30 EURe` unpaid due** | [`F12SPGcE3fS8GWFuA3qJmL5qSaRn6xEUHzCeJTGPnAUn`](https://testnet.nearblocks.io/txns/F12SPGcE3fS8GWFuA3qJmL5qSaRn6xEUHzCeJTGPnAUn) |





---

## 10. FxBudget V3 Hybrid Circle Native USDC Escrow & End-to-End Testnet Proof

- **Canonical Input Token Configured (`FxBudget::migrate_v3`):**
  - Token: Circle Native NEAR Testnet USDC (`3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`, 6 decimals)
  - Deploy & Migrate V3 Tx: [`AsvHD4dd3U9uALori1hVwd8ihBYunBjrqSRskgBwb7fo`](https://testnet.nearblocks.io/txns/AsvHD4dd3U9uALori1hVwd8ihBYunBjrqSRskgBwb7fo)
  - NEP-145 Storage Registration (`0.00125 NEAR` on `3e2210e...` for `fx-budget.chilliroger-operator.testnet`): [`7pN4LKkQtZQftigvZ1edG2Pu7oZgvxPJyvGxS9QZehZ2`](https://testnet.nearblocks.io/txns/7pN4LKkQtZQftigvZ1edG2Pu7oZgvxPJyvGxS9QZehZ2)
- **Live End-to-End Circle USDC Escrow Verification (`pnpm tsx scripts/near/verify-circle-usdc-escrow.ts` — Order #12 `INV-CIRCLE-15-1794481547`):**
  - **Step 1 — Real Circle USDC Escrow Deposit (`ft_transfer_call`):** Sent `15.00` Circle USDC from `chilliroger-operator.testnet` (`20.00 -> 5.00 USDC`) into `fx-budget.chilliroger-operator.testnet` (`0.00 -> 15.00 USDC`), creating `Order #12` (`Active`, target `€8.00 EURe`, chunk cap `$10.00 USDC`): [`5NnWXU3krRhoezmRtWsbPm23zYmesuDSNwn91gqEvcdZ`](https://testnet.nearblocks.io/txns/5NnWXU3krRhoezmRtWsbPm23zYmesuDSNwn91gqEvcdZ)
  - **Step 2 — Autonomous Chunk #1 Execution & EURe Delivery:** `AgentRunner.tick()` fetched live `1Click` (`0.8964`) & Frankfurter (`0.8987`, `-25 bps`), executed `order-12-seq-1` via restricted `FunctionCall` key, delivered `+€8.00 EURe` to `supplier-eu.chilliroger-operator.testnet` via `#[private] on_chunk_settled`, marked `Order #12` `Completed` with `5.00` Circle USDC remaining unspent in escrow, and saved SQLite fill (`CONFIRMED`, `is_simulated: false`): [`6QV6ZUsCEheaiYhYCXSG5RGEMugAupRift1psAthJphL`](https://testnet.nearblocks.io/txns/6QV6ZUsCEheaiYhYCXSG5RGEMugAupRift1psAthJphL)
  - **Step 3 — Automatic Unspent Escrow Refund (`refund_unused_escrow`):** Returned the remaining `5.00` unspent Circle USDC back to `chilliroger-operator.testnet` via cross-contract `ft_transfer` + `#[private] on_escrow_refunded` (final operator balance: `10.00 USDC`; `fx-budget` vault: `10.00 USDC`): [`nyUHd7uwsfYBq9Nk7sivdHzCNHHatKfQRG9RryE4nU1`](https://testnet.nearblocks.io/txns/nyUHd7uwsfYBq9Nk7sivdHzCNHHatKfQRG9RryE4nU1)

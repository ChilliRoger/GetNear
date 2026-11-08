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
- All fills are tracked locally in SQLite (`apps/agent/data/agent.db`) with `is_simulated = 1`.
- Strategy evaluations and WAIT decisions are logged with granular rationale.
- Observability REST API server is exposed on port `38175` with endpoints:
  - `GET /health` — Agent uptime and service status
  - `GET /status` — Current loop state, order count, and lock status
  - `GET /fills` — Complete list of simulated fills with transaction hashes
  - `GET /decisions` — Complete audit trail of WAIT / EXECUTE decisions
  - `POST /trigger` — Manual tick trigger for ops / testing



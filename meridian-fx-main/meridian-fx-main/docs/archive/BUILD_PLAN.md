# Meridian FX -- Build Plan

**Context:** ETHGlobal Cannes 2026. ~24 hours remaining.
**Goal:** One real Uniswap swap on Base, logged on Arc, shown in a dashboard, orchestrated by CRE.

---

## 1. Architecture Summary

```
                        +---------------------------+
                        |   Frontend Dashboard      |
                        |   (Next.js 14 Mini App)   |
                        |   apps/dashboard/         |
                        +------------+--------------+
                                     |
                                     | reads events + state
                                     |
+------------------------------------+------------------------------------+
|                    CHAINLINK CRE WORKFLOW                                |
|                    (Decentralized Oracle Network)                        |
|                                                                         |
|  TRIGGER A: Cron (60s)                                                  |
|    1. HTTP GET  -> Fynd/Uniswap API (USDC/EURC quote on Base)           |
|    2. EVM Read  -> Arc: TreasuryVault.getPolicy()                       |
|    3. EVM Read  -> Base: SwapExecutor.getBalances()                     |
|    4. Decision  -> EXECUTE / QUEUE_APPROVAL / WAIT                      |
|    5a. EVM Write -> Base: SwapExecutor.executeSwap() [auto]             |
|    5b. EVM Write -> Arc: TreasuryVault.logExecution() [auto]            |
|    5c. EVM Write -> Arc: TreasuryVault.createPendingTrade() [large]     |
|                                                                         |
|  TRIGGER B: HTTP (approval callback)                                    |
|    1. Receive approval + World ID proof                                 |
|    2. HTTP POST -> World ID /v4/verify                                  |
|    3. EVM Write -> Base: SwapExecutor.executeSwap()                     |
|    4. EVM Write -> Arc: TreasuryVault.confirmApproval()                 |
|    5. EVM Write -> Arc: TreasuryVault.logExecution()                    |
+------------------+----------------------------+-------------------------+
                   |                            |
                   v                            v
    +--------------------+        +---------------------------+
    |   BASE (mainnet)   |        |   ARC (testnet)           |
    |                    |        |   chain ID: 5042002       |
    | SwapExecutor.sol   |        |   RPC: rpc.testnet.arc.   |
    |  - CRE consumer    |        |         network           |
    |  - approves USDC   |        |                           |
    |  - calls Uniswap   |        | TreasuryVault.sol         |
    |    V3 SwapRouter02  |        |  - policy engine          |
    |  - real USDC/EURC  |        |  - CFO whitelist          |
    |                    |        |  - pending trade queue     |
    | Real tokens:       |        |  - audit trail (events)   |
    |  USDC 0x8335...    |        |                           |
    |  EURC 0x60a3...    |        | Mock tokens:              |
    |                    |        |  MockUSDC + MockEURC      |
    +--------------------+        +---------------------------+
```

**Key constraint:** Uniswap has no Arc support. Swaps execute on Base (real liquidity). Treasury policy and audit trail live on Arc (stablecoin-native L1). CRE orchestrates both chains.

---

## 2. Decision Gates -- RESOLVED

All critical PoCs have been run. No remaining project-killers.

| # | Question | Verdict | Implication |
|---|----------|---------|-------------|
| 1 | Uniswap USDC/EURC quotes on Base? | **CONFIRMED** | Fynd aggregator returns real quotes. Routes through Uniswap v3 + Aerodrome + PancakeSwap. Real execution path works. |
| 2 | CRE simulation with HTTP + EVM? | **CONFIRMED** | Chainlink booth confirmed: simulation qualifies for bounty. `cre workflow simulate` for local testing; `--broadcast` flag enables real on-chain writes during simulation. Live DON deployment is a stretch goal — Chainlink team offered to deploy for us if simulation works. |
| 3 | Arc mainnet accessible? | **FAIL -- use testnet** | Arc mainnet is not publicly accessible. Deploy TreasuryVault on Arc testnet (RPC: `rpc.testnet.arc.network`, chain ID: `5042002`). Demo narrative unchanged. |
| 4 | CRE supports Base? | **CONFIRMED** | Full mainnet support. EVM Read + Write both work. |
| 5 | CRE supports Arc? | **CONFIRMED (testnet)** | Chain selector available for Arc testnet. CRE can read/write TreasuryVault. |
| 6 | Confidential HTTP in production? | **Simulation only** | Use regular `HTTPClient` for production CRE workflow. Confidential HTTP is simulation-only. This is fine -- simulation qualifies for the bounty. |

**CRE simulation-first approach confirmed.** Chainlink booth says `cre workflow simulate` is all that's needed for bounty qualification. Use `--broadcast` to write real on-chain transactions during simulation. Live DON deployment is optional (stretch goal).

---

## 3. Parallel Tracks

### Track A: Frontend Dashboard (Next.js 14 Mini App)

**Location:** `apps/dashboard/`
**Depends on:** `packages/shared/` (types + constants), contract ABIs from Track C
**Tech:** Next.js 14, TypeScript, Tailwind, ethers.js, viem

| Phase | What | Deliverable |
|-------|------|-------------|
| A1 | Scaffold Next.js 14 app, Tailwind, connect to shared types | App boots, imports from `@meridian/shared` |
| A2 | Dashboard page: treasury balances (USDC/EURC from both chains), live rate tile, recent trades table | Dashboard renders with mock data |
| A3 | Approval page: list pending trades from TreasuryVault, approve/reject buttons | Approval flow works with mock data |
| A4 | Connect to real contracts: read balances from Base + Arc, read events for trade history | Dashboard shows live on-chain data |
| A5 | Polish: loading states, error handling, responsive layout | Demo-ready UI |

**Fallback if behind:** Static dashboard with hardcoded data from one real swap. The swap tx hash IS the demo -- the dashboard just displays it.

### Track B: CRE Workflow (Agent Brain) -- Simulation-First

**Location:** `apps/cre-workflow/` (new)
**Depends on:** `packages/shared/` (types), contract ABIs, CRE CLI login, Uniswap API key
**Tech:** Chainlink CRE TypeScript SDK (`@chainlink/cre-sdk`), CRE CLI v1.9.0
**Approach:** Simulation-first. `cre workflow simulate` for local testing, `--broadcast` for real on-chain writes. Live DON deployment is a stretch goal only.

| Phase | What | Deliverable |
|-------|------|-------------|
| B1 | Init CRE project from template, minimal Cron Trigger + HTTP call + log | `cre workflow simulate` succeeds |
| B2 | Add rate monitoring: HTTP to Fynd/Uniswap, EVM Read from both chains, decision logic | Agent fetches rate, reads policy, decides correctly |
| B3 | Add auto-execute: EVM Write to SwapExecutor on Base + logExecution on Arc via `--broadcast` | **ONE REAL SWAP = THE DEMO** |
| B4 | Add approval flow: createPendingTrade on Arc, HTTP Trigger B for callbacks | Full approval lifecycle |
| B5 | Polish: quote expiry, slippage protection, error recovery | Edge cases handled |
| B6 | **(Stretch)** Live DON deployment -- Chainlink team offered to help deploy if simulation works | CRE running on decentralized network |

**Fallback if CRE fails by Hour 16:** Replace with Node.js cron script that does the same flow. Lose Chainlink bounty ($2K) but keep the product. The CRE workflow code translates almost 1:1 to Node.js.

### Track C: Smart Contracts

**Location:** `contracts/`
**Status:** Already scaffolded. All 4 contracts compile. Deployment scripts exist.
**Depends on:** Funded wallet, Arc testnet RPC, CRE KeystoneForwarder address

| Phase | What | Deliverable |
|-------|------|-------------|
| C0 | Deploy MockUSDC + MockEURC to Arc testnet, mint 500K each | Mock tokens live, visible in wallets |
| C1 | Deploy TreasuryVault to Arc testnet, set initial policy, add deployer as CFO | Vault deployed, policy set, verified on explorer |
| C2 | Deploy SwapExecutor to Base mainnet with real USDC/EURC addresses | Executor deployed, CRE forwarder set |
| C3 | Fund SwapExecutor with real USDC on Base ($5-20 for demo) | Executor has funds to swap |
| C4 | Integration test: CRE simulation sends report, contracts accept it | CRE <-> contracts fully wired |

**Contracts are already written and compile.** This track is deployment + verification, not development.

### Track D: Savings Calculator (Stretch)

**Location:** `apps/dashboard/` (page within dashboard) or standalone
**Depends on:** Nothing -- pure frontend with oracle data

| Phase | What | Deliverable |
|-------|------|-------------|
| D1 | Monthly volume slider ($10K-$500K), bank fee (1.3%) vs Meridian (~0.05%), big green savings number | Compelling savings visualization |

**Cut this entirely if behind on Tracks A-C.** It is pure demo polish.

---

## 4. Hour-by-Hour Timeline

### Phase 1: Foundation (Hours 0-2)

| Hour | Task | Owner | Deliverable | Checkpoint |
|------|------|-------|-------------|------------|
| 0-0.5 | Deploy MockUSDC + MockEURC to Arc testnet | Track C | Token addresses, mint 500K each | `cast call <addr> "name()"` returns correctly |
| 0-0.5 | User authenticates CRE CLI (`cre login` or set `CRE_API_KEY`) | User | CRE CLI authenticated | `cre workflow list` succeeds |
| 0.5-1 | Deploy TreasuryVault to Arc testnet | Track C | Vault address, default policy set | Verified on `testnet.arcscan.app` |
| 0.5-1 | Init CRE project from template | Track B | Scaffold at `apps/cre-workflow/` | `cre workflow build` succeeds |
| 1-2 | Deploy SwapExecutor to Base mainnet | Track C | Executor address, CRE forwarder set | Verified on Basescan |
| 1-2 | Fund SwapExecutor with $5-20 real USDC on Base | User | USDC balance > 0 in executor | `cast call <addr> "getBalances()"` shows USDC |
| 1-2 | Scaffold Next.js 14 dashboard app | Track A | App boots at `localhost:3000` | `pnpm dev` runs clean |

**Phase 1 exit:** All contracts deployed. CRE authenticated. Dashboard scaffold running. SwapExecutor funded.

### Phase 2: Core Build (Hours 2-8)

| Hour | Task | Owner | Deliverable | Checkpoint |
|------|------|-------|-------------|------------|
| 2-4 | CRE: Cron trigger + HTTP to Fynd for USDC/EURC quote | Track B | Workflow fetches real quote | `cre workflow simulate` shows quote data |
| 2-4 | Dashboard: treasury overview (balances from both chains) + rate tile | Track A | Dashboard shows real balances | Page renders with live chain data |
| 4-6 | CRE: EVM Read from both chains (policy + balances) + decision logic | Track B | Agent makes correct EXECUTE/WAIT/QUEUE decisions | Simulate with 3 test cases (in-band, out-of-band, insufficient) |
| 4-6 | Dashboard: recent trades table (reads TradeExecuted events from Arc) | Track A | Trade history renders | Table populated after manual test tx |
| 6-8 | CRE: EVM Write to SwapExecutor (auto-execute path) | Track B | **ONE REAL SWAP ON BASE** | Tx hash on Basescan with real USDC->EURC |
| 6-8 | CRE: EVM Write to TreasuryVault (log execution on Arc) | Track B | Trade logged on Arc | TradeExecuted event visible on Arc explorer |

**Phase 2 exit:** At least one real swap executed on Base and logged on Arc. This is the minimum viable demo.

### Phase 3: Integration (Hours 8-14)

| Hour | Task | Owner | Deliverable | Checkpoint |
|------|------|-------|-------------|------------|
| 8-10 | Connect dashboard to real contract data (SwapExecutor balances, TreasuryVault events) | Track A | Dashboard shows real swap history | Refresh shows the Phase 2 swap |
| 8-10 | CRE: approval flow -- createPendingTrade on Arc for large trades | Track B | Pending trades appear in TreasuryVault state | `getPendingTrade()` returns correct data |
| 10-12 | Dashboard: approval page -- list pending trades, approve/reject UI | Track A | Approval UI functional | Can see pending trade, click approve |
| 10-12 | CRE: HTTP Trigger B -- receive approval callback, re-quote, execute | Track B | Approved trades execute | Full lifecycle: queue -> approve -> swap -> log |
| 12-14 | End-to-end test: CRE cron detects rate, auto-executes small trade, queues large trade | Both | Full agent lifecycle working | Both auto and approval paths demonstrated |

**Phase 3 exit:** Full agent lifecycle working. Dashboard connected to real data. Both auto-execute and approval paths demonstrated.

### Phase 4: Polish (Hours 14-20)

| Hour | Task | Owner | Deliverable | Checkpoint |
|------|------|-------|-------------|------------|
| 14-16 | Dashboard polish: loading states, error boundaries, mobile layout | Track A | Demo-ready UI | Looks good on screen recording |
| 14-16 | CRE: quote expiry handling, slippage protection, balance checks | Track B | Edge cases covered | No crashes on expired quotes or insufficient balance |
| 16-18 | Decision gate: is CRE simulation + `--broadcast` working end-to-end? If NO, pivot to Node.js cron | All | Final CRE decision | Either working simulation or Node.js fallback running |
| 16-18 | Savings calculator (Track D) -- ONLY if ahead of schedule | Track D | Slider + savings number | Renders correctly |
| 18-20 | Execute 2-3 more real swaps for demo reel | All | Multiple tx hashes on Basescan | At least 3 SwapExecuted events |

**Phase 4 exit:** Demo-ready product. Multiple real swaps executed. Polish complete.

### Phase 5: Ship (Hours 20-24)

| Hour | Task | Owner | Deliverable | Checkpoint |
|------|------|-------|-------------|------------|
| 20-21 | Write submission README.md (architecture, setup, tx hashes, screenshots) | All | Complete README | Covers all 3 prize tracks |
| 21-22 | Record demo video (max 3 min): pitch -> live dashboard -> trigger swap -> show tx | All | Demo video uploaded | Under 3 minutes, shows real swap |
| 22-23 | Final submission: ETHGlobal form, select 3 bounty tracks, link repo + video | All | Submission complete | All fields filled, correct tracks selected |
| 23-24 | Uniswap Developer Feedback Form (REQUIRED, easy to forget) | User | Form submitted | `https://developers.uniswap.org/feedback` done |
| 23-24 | Buffer for emergencies | All | -- | -- |

**Phase 5 exit:** Submitted. Done.

---

## 5. Guardrails

### Time-Boxing
- **45-minute rule:** If any task runs >45 minutes over its estimate, stop and use the fallback immediately. Do not negotiate with sunk time.
- **Decision gates are hard deadlines**, not suggestions:
  - **Hour 8:** Can we deploy to Arc (testnet)? YES -> keep Arc. NO -> pivot to World ID 4.0.
  - **Hour 16:** Does CRE simulation work end-to-end? YES -> keep Chainlink. NO -> Node.js cron fallback.
  - **Hour 22:** Do we have a crosschain story (policy on Arc + execution on Base)? YES -> submit Arc "Chain Abstracted USDC Apps". WEAK -> submit Arc "Advanced Stablecoin Logic" instead.

### Commit Discipline
- **Commit at EVERY checkpoint.** No exceptions. Use descriptive messages referencing the phase (e.g., `feat(C1): deploy TreasuryVault to Arc testnet`).
- **Tag real milestones:** `v0.1-first-swap`, `v0.2-cre-working`, `v0.3-dashboard-live`.

### Simplification Ladder

**NEVER CUT (required for ANY prize):**
- CRE workflow with rate monitoring + trade decision
- Uniswap API integration with at least one real on-chain swap
- At least one contract on Arc (TreasuryVault)
- Mock tokens deployed with demo-ready balances
- Demo video + README + GitHub repo

**CUT IF BEHIND (drop in this order):**
1. Bridge Base->Arc (drop first -- it is optional polish)
2. Savings calculator (Track D)
3. Multiple FX rate sources (Chainlink feed comparison)
4. Policy settings UI (hardcode thresholds instead)
5. Push notifications (poll instead)

**CUT IF DESPERATE (last resort):**
6. World ID verification (use wallet signature only for approval)
7. Approval flow entirely (show auto-execute only, mention approval in README)
8. Dashboard (show Basescan tx + Arc explorer as the "dashboard")

---

## 6. Critical Path

The minimum viable demo requires these steps **in order**. Everything else is layered on top.

```
1. Deploy contracts
   MockUSDC + MockEURC  -> Arc testnet
   TreasuryVault        -> Arc testnet
   SwapExecutor         -> Base mainnet (real USDC/EURC addresses)

2. Fund SwapExecutor
   Transfer $5-20 real USDC to SwapExecutor on Base

3. CRE workflow simulates successfully
   Cron -> HTTP quote -> EVM Read policy -> Decision -> log

4. ONE REAL UNISWAP SWAP on Base
   CRE (or script) calls SwapExecutor.executeSwap()
   Real USDC -> real EURC via Uniswap V3 SwapRouter02
   Tx hash on Basescan = proof of execution

5. Trade logged on Arc
   TreasuryVault.logExecution() called with Base tx details
   TradeExecuted event emitted on Arc testnet

6. Dashboard shows it all
   Balances from both chains
   Trade history from Arc events
   Live rate from oracle/Fynd
```

**"One real swap = the entire demo."**

If you have a Basescan tx hash showing a real USDC->EURC swap through your SwapExecutor, and that trade is logged on Arc, you have a submittable project for all three bounties. Everything after that is making it look better.

---

## 7. Contract Addresses (fill in during deployment)

| Contract | Chain | Address | Deployed? |
|----------|-------|---------|-----------|
| MockUSDC | Arc testnet | `TBD` | NO |
| MockEURC | Arc testnet | `TBD` | NO |
| TreasuryVault | Arc testnet | `TBD` | NO |
| SwapExecutor | Base mainnet | `TBD` | NO |

**Known addresses (do not redeploy):**

| Token | Chain | Address |
|-------|-------|---------|
| USDC | Base mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| EURC | Base mainnet | `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42` |
| Uniswap V3 SwapRouter02 | Base mainnet | `0x2626664c2603336E57B271c5C0b26F421741e481` |
| EURC/USD Chainlink Feed | Base mainnet | `0xDAe398520e2B67cd3f27aeF9Cf14D93D927f8250` |

**Arc testnet RPC:** `https://rpc.testnet.arc.network` (chain ID: `5042002`)

---

## 8. Environment Variables Needed

```bash
# Wallet
PRIVATE_KEY=           # Deployer wallet (funded on Base mainnet + Arc testnet)

# CRE
CRE_API_KEY=           # From cre login or Chainlink dashboard

# Uniswap
UNISWAP_API_KEY=       # From developers.uniswap.org

# Contract addresses (fill after deployment)
SWAP_EXECUTOR_BASE=    # SwapExecutor address on Base
TREASURY_VAULT_ARC=    # TreasuryVault address on Arc testnet
CRE_FORWARDER_BASE=    # Chainlink KeystoneForwarder on Base
CRE_FORWARDER_ARC=     # Chainlink KeystoneForwarder on Arc testnet

# RPCs
BASE_RPC_URL=https://mainnet.base.org
ARC_RPC_URL=https://rpc.testnet.arc.network

# Fynd (already configured)
FYND_URL=http://localhost:3000
```

---

## 9. Prize Submission Checklist

### Uniswap -- Best API Integration ($10K pool)
- [ ] Uniswap API integrated with valid API key
- [ ] Real USDC/EURC quotes via API (or Fynd routing through Uniswap pools)
- [ ] At least one real on-chain swap tx hash on Basescan
- [ ] Public GitHub repo with open-source code
- [ ] Demo video (max 3 min)
- [ ] **Uniswap Developer Feedback Form** (`https://developers.uniswap.org/feedback`) -- REQUIRED, easy to forget

### Chainlink -- CRE Workflow ($4K pool, $2K x 2 teams)
- [ ] CRE Workflow written in TypeScript
- [ ] Integrates Base (EVM) with Uniswap API (external API)
- [ ] Successful simulation via CRE CLI (`cre workflow simulate`, with `--broadcast` for real writes). Live DON deployment is stretch goal only.
- [ ] CRE is meaningfully used -- it IS the agent, not a bolt-on
- [ ] Public GitHub repo + demo video

### Arc -- Chain Abstracted USDC Apps ($3K pool)
- [ ] Functional MVP with architecture diagram
- [ ] Base (execution) + Arc (treasury control plane) used together
- [ ] Video demonstration + presentation
- [ ] GitHub repo
- [ ] Clear statement: submitting for "Chain Abstracted USDC Apps"
- [ ] Fallback track if crosschain story is weak: "Best Smart Contracts with Advanced Stablecoin Logic" ($3K)

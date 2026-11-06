# Meridian FX

### An AI treasury agent that saves corporations $625K/yr on FX fees

**AI-powered treasury FX agent for the stablecoin era.** Meridian monitors USDC/EURC exchange rates via Uniswap on Base, auto-executes small conversions at optimal rates, requires World ID-verified human approval for large trades, and logs every action to an immutable audit trail on Arc. The entire decision-making engine runs as a decentralized Chainlink CRE workflow.

Built by **Team Ippo** at ETHGlobal Cannes 2026.

---

## Demo

| | Link |
|---|---|
| Live App | [meridian.omnipass.world](https://meridian.omnipass.world) |
| Dashboard | [meridian.omnipass.world/dashboard](https://meridian.omnipass.world/dashboard) |
| Dev Console | [dev.omnipass.world](https://dev.omnipass.world) |
| Demo Video | *Coming soon* |

---

## Bounty Tracks

Meridian FX is a single product that integrates **5 sponsor technologies** working together as one system, not bolted on separately.

| Sponsor | What We Built | Why It Qualifies |
|---------|--------------|-----------------|
| **Chainlink** | Full CRE workflow with Confidential HTTP + adaptive TWAP strategy engine | The entire agent brain is a CRE workflow: cron trigger, confidential HTTP for strategy hiding, EVM reads/writes across two chains, WASM-compiled, DON-ready |
| **Uniswap** | Real V3 swaps on Base mainnet with on-chain tx proof | Not just quotes — real `exactInputSingle` executions on the USDC/EURC 0.05% pool, driven by an autonomous agent |
| **Arc** | TreasuryVault policy engine + immutable audit trail on Arc testnet | Arc is the treasury control plane: configurable policy, approval queue, CFO whitelist, trade event logging. USDC-as-gas native operations |
| **Unlink** | Full privacy flow — shield/unshield/private swap on Base Sepolia | 3-step ZK privacy: deposit into pool, execute as pool (sender hidden), withdraw. 9+ on-chain txs proving the flow works |
| **World** | Human verification gate for large trade approvals | IDKit integration — only World ID-verified humans can approve trades above the policy threshold. Prevents bot/unauthorized approvals |

---

## On-Chain Proof

Real transactions executed during development and demo — not testnet stubs.

### Base Mainnet — Uniswap V3 Swaps

| Description | Tx Hash | Explorer |
|-------------|---------|----------|
| Approve USDC for Uniswap Router | `0x3c17b6...bcbc62` | [Basescan](https://basescan.org/tx/0x3c17b6c1da74bfc53765da20d6e9eb23f03fafecf3c1356515b71d1becbcbc62) |
| Swap $1.20 USDC to 1.04 EURC (treasury) | `0x64ef19...392a56` | [Basescan](https://basescan.org/tx/0x64ef1982f28240e066244afb0bfa79421e6bdd3340df3e0036fbbbcf29392a56) |
| TWAP Chunk 1: $1.10 USDC to EURC | `0x307f6f...8691b` | [Basescan](https://basescan.org/tx/0x307f6f6eff4295c756f694c8d98db441c6da8c66d765702200e989423df8691b) |
| TWAP Chunk 2: $0.018 USDC to EURC | `0xe9f1ca...471fc` | [Basescan](https://basescan.org/tx/0xe9f1ca10606b03b792714d495426d5c0d08858db35c04ad974b1a565fdf471fc) |
| Transfer $5 USDC to SwapExecutor | `0xf3ed67...e2f2ca` | [Basescan](https://basescan.org/tx/0xf3ed67cc484fbc9bf8e93688bbde9168901c111cf62303d6c7bc80b88ae2f2ca) |

### Base Sepolia — Unlink Privacy Transactions

| Description | Unlink Tx ID | EVM Tx | Explorer |
|-------------|-------------|--------|----------|
| Shield 1,000,067 EURC | `3eab4d38-...` | `0xeb96a2...2b603d` | [Basescan](https://sepolia.basescan.org/tx/0xeb96a29a883cc653dde60cf91900e649c3d2c1011150b5b2c48b55279f2b603d) |
| Shield 420,690 EURC | `d47eae9b-...` | — | — |
| Unshield 500,067.5 EURC | `40771598-...` | — | — |
| Unshield 1,500,000 USDC | `06cf93ed-...` | — | — |
| Private Swap USDC to EURC (420,069) | confirmed | — | — |
| ULNKm Faucet (100 tokens) | — | `0x260151...46e61` | [Basescan](https://sepolia.basescan.org/tx/0x260151b3d41dab614c6596135d2e32c92de14c8b1493aa0be9737c9fba046e61) |

---

## What Makes This Different

1. **Real money.** Actual USDC/EURC swaps on Base mainnet via Uniswap V3 — not testnet mocks.
2. **5 sponsor integrations working together.** Chainlink CRE orchestrates Uniswap swaps on Base, logs to Arc, gates on World ID, and hides identity via Unlink. One product, not five demos.
3. **Confidential compute, end-to-end.** CRE's Confidential HTTP hides the *strategy* (what to trade, when, at what price) from node operators. Unlink hides the *sender* from on-chain observers. No one in the pipeline sees both intent and identity.
4. **Production architecture.** Oracle brain + CRE hands pattern. The oracle decides strategy. CRE executes it as dumb hands — portable, verifiable, DON-ready. The same WASM binary runs in simulation and in a TEE.

---

## The Problem

A user recently swapped ~$50M through a major DeFi frontend. The quote was badly mispriced and they received only ~$37K — a near-total loss. No sanity check. No human approval. No audit trail.

Corporate treasury teams converting between stablecoins face the same risk at scale: mispriced quotes, no oversight for large trades, and bank FX fees of 1-3% eating into margins.

## The Solution

Meridian FX is an autonomous treasury agent that:

1. **Monitors** USDC/EURC rates continuously via Uniswap on Base
2. **Decides** whether to execute based on on-chain policy (rate bands, thresholds)
3. **Auto-executes** small trades at optimal rates (~0.05% fee vs 1.3% bank fee)
4. **Requires human approval** (via World ID) for trades above the configured threshold
5. **Logs everything** to an immutable audit trail on Arc

**Result:** ~96% cost reduction vs traditional banking FX, with safety guardrails that prevent catastrophic mispricing.

---

## Phase 2 Features

### Strategy Decision Engine
Timing score (0-100) combining three weighted signals:
- **Price vs 24h Average (40%)** — scores higher when the current rate beats the rolling average
- **Source Divergence (20%)** — scores higher when Chainlink, Fynd, and Uniswap prices converge
- **Urgency (40%)** — scores higher as the trade deadline approaches

Score thresholds determine execution behavior:
- **>85**: Aggressive execution (2x chunk size)
- **70-85**: Normal execution (1x chunk size)
- **<70**: Wait for better conditions

### Adaptive TWAP
Dynamic chunk sizing with quadratic urgency ramp. The algorithm is conservative early in the order's lifecycle and progressively more aggressive as the deadline approaches, ensuring full execution while minimizing market impact.

### Desired Output Mode
Users can specify a target output amount (e.g., "I want to receive 4,000 EURC"). The system estimates the required input with a 5% buffer and auto-completes the order when the target output is met. Excess input is returned.

### Privacy Mode (Unlink)
Private treasury swaps via the Unlink SDK on Base Sepolia. The sender's identity is hidden from on-chain observers using ZK proofs, enabling confidential corporate FX operations.

### Strategy Decision Log
Every CRE tick decision is recorded in SQLite — score, action, reason, price breakdown, and chunk amounts. The full decision history is visible in the dev-UI Oracle dashboard for debugging and audit.

### Internationalization
Full EN/FR language support via a custom i18n context. All UI strings are translatable, with language detection and manual switching.

### Error Handling
Toast notifications for user-facing errors, React error boundaries for component isolation, and exponential retry backoff for transient network failures.

### Dev-UI Operations Dashboard
Real-time Oracle price readings, CRE run history, timing score display, speed controls for demo mode, and trade order lifecycle tracking. Designed for live demo operation and debugging.

---

## Architecture

```
                    ┌─────────────────────────────┐
                    │     CHAINLINK CRE AGENT     │
                    │  (Decentralized Orchestrator)│
                    │                             │
                    │  Cron ─► HTTP Quote          │
                    │  ─► Read Policy (Arc)        │
                    │  ─► Read Balance (Base)      │
                    │  ─► Decision Logic           │
                    │  ─► Execute Swap (Base)      │
                    │  ─► Log Audit (Arc)          │
                    └──────────┬──────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                                 ▼
   ┌─────────────────────┐          ┌──────────────────────┐
   │  BASE (Chain 8453)  │          │  ARC (Chain 5042002) │
   │                     │          │                      │
   │  SwapExecutor.sol   │          │  TreasuryVault.sol   │
   │  • Uniswap V3 swaps│          │  • Policy engine     │
   │  • Real USDC/EURC   │          │  • Approval queue    │
   │  • ~0.05% fee tier  │          │  • CFO whitelist     │
   │                     │          │  • Audit trail       │
   └─────────────────────┘          └──────────────────────┘
                                              ▲
                                              │
                                    ┌─────────────────┐
                                    │   WORLD ID      │
                                    │  Human approval │
                                    │  for large      │
                                    │  trades         │
                                    └─────────────────┘
```

### Two Chains, Clean Separation

- **Base** = execution layer. Real USDC/EURC swaps via Uniswap V3 SwapRouter02.
- **Arc** = treasury control plane. Policy management, audit trail, pending trade approval queue. Circle's stablecoin-native L1 where USDC is the gas token.
- **Chainlink CRE** = the agent brain. A single workflow orchestrates monitoring, decision-making, and execution across both chains.

### Privacy & Confidential Compute

Meridian provides end-to-end trade privacy by combining two complementary layers:

**Confidential HTTP via CRE** — All Oracle strategy requests (what to trade, when, at what price, how much) run through Chainlink's Confidential HTTP capability. When deployed on a Decentralized Oracle Network (DON), these HTTP calls execute inside a Trusted Execution Environment (TEE). Node operators cannot inspect the Oracle's strategy response — the action, timing score, and recommended chunk size remain encrypted in transit and at rest within the enclave. This prevents front-running of treasury swaps by infrastructure operators who would otherwise see pending trade intent before it reaches the chain.

**Sender Privacy via Unlink** — Private Treasury mode routes swaps through Unlink's ZK privacy pool on Base Sepolia, hiding the treasury wallet's identity from on-chain observers. The flow is three steps: deposit tokens into the privacy pool, execute the swap from the pool, then withdraw output tokens. Amounts remain visible for compliance and auditability, but the sender address is unlinkable — observers see the swap but cannot attribute it to a specific treasury. The integration is live on Base Sepolia with 100+ ULNKm in the privacy pool.

**The combination** — CRE hides the strategy (what to trade, when, at what price) from infrastructure operators. Unlink hides the sender identity from on-chain observers. Together, they provide end-to-end trade privacy: no one in the pipeline — not the DON node operators, not MEV searchers, not on-chain analysts — can both see the intent and attribute it to the treasury.

### Detailed Architecture Diagrams

For deeper technical reference, see the individual architecture diagrams:

- [System Overview](docs/diagrams/01-system-overview.md) — CRE workflow loop and future cross-chain bridging
- [Trade Decision Flow](docs/diagrams/02-trade-decision-flow.md) — full swim-lane from submission to execution
- [System Architecture](docs/diagrams/03-system-architecture.md) — all components and connections
- [API Endpoint Map](docs/diagrams/04-api-endpoint-map.md) — every Oracle endpoint by consumer
- [Multi-Chain Flow](docs/diagrams/05-multi-chain-flow.md) — data/value flow across Base and Arc
- [Sponsor Integration Map](docs/diagrams/06-sponsor-integration-map.md) — sponsor tech integration points
- [CRE Workflow Detail](docs/diagrams/07-cre-workflow-detail.md) — Uniswap price discovery + execution deep-dive
- [Privacy Flow](docs/diagrams/08-privacy-flow.md) — Unlink SDK sender hiding via ZK proofs

See also: [Architecture Diagrams Index](docs/architecture-diagrams.md)

---

## Sponsor Integrations

### Uniswap — Swap Execution Engine
- SwapExecutor.sol calls Uniswap V3 `exactInputSingle` on Base mainnet
- USDC/EURC pool at 0.05% fee tier (500)
- Real-time quotes via Uniswap Trade API
- Bidirectional swaps: USDC→EURC and EURC→USDC

### Chainlink CRE — Decentralized Agent Brain
- Full CRE workflow: `CronTrigger → HTTPClient → EVMClient → Decision → EVMWrite`
- **Confidential HTTP for strategy confidentiality** — Oracle strategy requests (action, timing score, chunk size) execute via CRE's Confidential HTTP capability. On a DON, these run inside a TEE so node operators cannot see trade intent, preventing front-running
- WASM compilation ensures identical execution in simulation and DON TEE — the same compiled binary runs locally during development and inside the enclave in production
- **DON-ready** — the workflow requires zero code changes to move from local simulation to decentralized TEE execution; only config (secrets, DON ID) changes
- Cross-chain orchestration (Base + Arc) from a single workflow
- Simulation with `--broadcast` for real on-chain execution

### Arc — Treasury State Layer
- TreasuryVault.sol deployed on Arc testnet (chain 5042002)
- Policy engine with configurable thresholds and rate bands
- Immutable audit trail via `TradeExecuted` events
- Pending trade queue with approval/rejection flow
- USDC-as-gas for native stablecoin operations

### World ID — Human Verification for Large Trades
- Trades above the auto-execution threshold require World ID proof
- IDKit integration for proof-of-humanity verification
- Prevents unauthorized approvals — only verified humans can approve large trades
- Fallback to CFO wallet signature for demo flexibility

### Base — Execution Chain
- Low-cost, high-throughput L2 for swap execution
- Deep USDC/EURC liquidity via Uniswap V3
- Real mainnet transactions (not testnet)

### Unlink — Sender Privacy for Treasury Swaps
- Working integration on Base Sepolia with 100+ ULNKm in the ZK privacy pool
- **3-step privacy flow**: deposit USDC into the Unlink privacy pool → execute swap from the pool → withdraw output EURC tokens
- **Selective transparency**: swap amounts and token pairs remain visible for compliance and audit, but the sender wallet address is hidden from on-chain observers via ZK proofs
- Enables confidential corporate FX operations — analysts can verify the trade happened but cannot attribute it to a specific treasury

---

## Deployed Contracts

| Contract | Chain | Address | Explorer |
|----------|-------|---------|----------|
| SwapExecutor | Base Mainnet | `0xBcA2be0dCe857a936b4660538A9CCdDcB7aE92fF` | [BaseScan](https://basescan.org/address/0xBcA2be0dCe857a936b4660538A9CCdDcB7aE92fF#code) |
| TreasuryVault | Arc Testnet | `0x75a1ff87d9369fefeb2914bd6cc69296f7ebd997` | [ArcScan](https://testnet.arcscan.app/address/0x75a1ff87d9369fefeb2914bd6cc69296f7ebd997) |
| MockUSDC | Arc Testnet | `0x4Fa3A73189DaC96f6D44cf67f25301E010C78BB7` | [ArcScan](https://testnet.arcscan.app/address/0x4Fa3A73189DaC96f6D44cf67f25301E010C78BB7) |
| MockEURC | Arc Testnet | `0xe022c7abF67DD1C99D679f6C7f5912bb4404D956` | [ArcScan](https://testnet.arcscan.app/address/0xe022c7abF67DD1C99D679f6C7f5912bb4404D956) |

### Base Sepolia (Privacy Mode — Unlink Testing)

| Contract | Address | Explorer |
|----------|---------|----------|
| MockUSDC | `0x4Fa3A73189DaC96f6D44cf67f25301E010C78BB7` | [BaseScan Sepolia](https://sepolia.basescan.org/address/0x4Fa3A73189DaC96f6D44cf67f25301E010C78BB7) |
| MockEURC | `0xe022c7abF67DD1C99D679f6C7f5912bb4404D956` | [BaseScan Sepolia](https://sepolia.basescan.org/address/0xe022c7abF67DD1C99D679f6C7f5912bb4404D956) |
| MockWBTC | `0x96371C8851C6bc00EB3E211c20eb9F02B1Ec8E23` | [BaseScan Sepolia](https://sepolia.basescan.org/address/0x96371C8851C6bc00EB3E211c20eb9F02B1Ec8E23) |
| MockWETH | `0xB261461F7D6F6B7Bcdab8Fb082acD91DFC94F69E` | [BaseScan Sepolia](https://sepolia.basescan.org/address/0xB261461F7D6F6B7Bcdab8Fb082acD91DFC94F69E) |

---

## Cost Comparison

| | Traditional Bank | Meridian FX |
|---|---|---|
| FX Fee | ~1.3% | ~0.05% |
| Settlement Time | 1-3 days | < 1 second |
| Minimum Trade | $10,000+ | $1 |
| Approval Process | Email chains | World ID verified |
| Audit Trail | PDF statements | On-chain, immutable |
| **Annual cost on $50M volume** | **$650,000** | **$25,000** |
| **Annual savings** | — | **$625,000** |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Agent Runtime | Chainlink CRE (TypeScript SDK + WASM) |
| Smart Contracts | Solidity 0.8.20 + OpenZeppelin v5 + Foundry |
| DEX Integration | Uniswap V3 SwapRouter02 on Base |
| Treasury Chain | Arc Testnet (Circle's stablecoin-native L1) |
| Human Verification | World ID (IDKit + backend verification) |
| Privacy | Unlink SDK (ZK proofs on Base Sepolia) |
| Frontend | Next.js 14 + Tailwind CSS + viem |
| Oracle/Strategy | Hono + better-sqlite3 + viem |
| Shared Types | TypeScript monorepo with pnpm workspaces |

---

## Project Structure

```
meridian-fx/
├── packages/shared/          Shared TypeScript types + constants
├── contracts/                Foundry — SwapExecutor, TreasuryVault, mocks
├── meridian-cre/
│   ├── treasury/             CRE workflow — full agent logic
│   ├── por/                  CRE workflow — proof of reserves
│   └── nav/                  CRE workflow — NAV calculation
├── apps/
│   ├── app/                  Next.js 14 submission frontend
│   ├── oracle/               Oracle + strategy engine (Hono + SQLite)
│   ├── privacy/              Unlink privacy sidecar (Base Sepolia)
│   └── dev-ui/               Dev tool — operations dashboard
└── docs/                     Architecture, reference docs, submission artifacts
```

---

## Running Locally

### Prerequisites
- Node.js 20+, pnpm 9+, Foundry, Bun
- Chainlink CRE CLI (`cre` v1.9.0+)

### Setup
```bash
git clone https://github.com/meridian-fx/meridian-fx.git
cd meridian-fx
pnpm install

# Copy env template
cp .env.example .env
# Fill in: BASE_RPC, ARC_RPC, UNISWAP_API_KEY, DEPLOYER_PRIVATE_KEY
# Optional: enable demo mode for speed toggle + seed data
# DEMO_MODE=true
# NEXT_PUBLIC_DEMO_MODE=true
```

### Build & Run
```bash
# Compile contracts
cd contracts && forge build

# Run CRE simulation
cd meridian-cre && cre workflow simulate treasury --broadcast

# Start frontend
cd apps/app && pnpm dev  # http://localhost:3100
```

---

## CRE Workflow Flow

```
Every 60 seconds (configurable):

1. FETCH QUOTE    → HTTP GET Uniswap API for USDC/EURC rate
2. READ POLICY    → EVM Read TreasuryVault.getPolicy() on Arc
3. READ BALANCE   → EVM Read SwapExecutor.getBalances() on Base
4. DECIDE         → Is rate in band? Is balance sufficient? Amount vs threshold?
   ├── WAIT       → Rate outside band or insufficient balance
   ├── EXECUTE    → Amount ≤ threshold, rate in band → auto-swap on Base
   └── QUEUE      → Amount > threshold → create pending trade on Arc
5. EXECUTE SWAP   → EVM Write SwapExecutor.executeSwap() on Base
6. LOG AUDIT      → EVM Write TreasuryVault.logExecution() on Arc
```

---

## Display Multiplier

For demo purposes, all USD amounts in the UI are multiplied by 1,000,000:
- $1 real USDC displays as "$1,000,000"
- This makes small demo amounts look like real treasury operations
- Contracts and CRE always work with raw (real) amounts
- The multiplier is a single constant in `packages/shared/constants.ts`

---

## Team

**Team Ippo** — ETHGlobal Cannes 2026

---

## License

MIT

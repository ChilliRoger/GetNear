# Bounty Submissions — GetNear

** | ETHGlobal Cannes 2026**

A quick-reference guide for judges evaluating each bounty track. Each section explains what we built, where to find the code, on-chain proof, and what to look for in the demo.

---

## Chainlink — CRE Workflow with Confidential HTTP

### What We Built
A full Chainlink CRE workflow that acts as the autonomous agent brain for a corporate treasury FX system. The workflow runs on a cron trigger, fetches live Uniswap quotes via Confidential HTTP (strategy hidden from node operators in a TEE), reads policy from Arc, reads balances from Base, makes a trade decision, executes swaps on Uniswap V3, and logs the audit trail to Arc — all from a single WASM-compiled workflow.

### Where to Find the Code
| Component | Path |
|-----------|------|
| CRE workflow (main agent logic) | `GetNear-cre/treasury/` |
| Workflow YAML config | `GetNear-cre/treasury/workflow.yaml` |
| Compiled WASM binary | `GetNear-cre/treasury/binary.wasm` |
| Oracle strategy engine (HTTP target) | `apps/oracle/` |
| CRE simulation runner | `GetNear-cre/run-simulator.sh` |

### On-Chain Proof
CRE simulation with `--broadcast` executed real swaps on Base mainnet:
- TWAP Chunk 1: [Basescan](https://basescan.org/tx/0x307f6f6eff4295c756f694c8d98db441c6da8c66d765702200e989423df8691b)
- TWAP Chunk 2: [Basescan](https://basescan.org/tx/0xe9f1ca10606b03b792714d495426d5c0d08858db35c04ad974b1a565fdf471fc)

### What to Look for in the Demo
- CRE cron trigger fires every 60 seconds
- Confidential HTTP fetches strategy from oracle (action, timing score, chunk size all hidden from node operators)
- Cross-chain orchestration: reads/writes to both Base (chain 8453) and Arc (chain 5042002) in a single workflow
- Adaptive TWAP: chunk sizing adjusts dynamically based on timing score (urgency + price + divergence)
- The same WASM binary runs in local simulation and in a DON TEE — zero code changes to go from dev to production

---

## Uniswap — Real V3 Swaps on Base Mainnet

### What We Built
An autonomous swap execution engine that calls Uniswap V3 `exactInputSingle` on Base mainnet for USDC/EURC conversions. The system uses the Uniswap Trade API for real-time price quoting and routes all execution through our SwapExecutor contract, which is controlled by the CRE workflow.

### Where to Find the Code
| Component | Path |
|-----------|------|
| SwapExecutor contract | `contracts/src/SwapExecutor.sol` |
| Uniswap quote adapter | `apps/oracle/src/adapters/uniswap-adapter.ts` |
| Frontend trade form | `apps/app/src/app/trade/` |
| Shared Uniswap constants | `packages/shared/src/constants.ts` |

### Deployed Contracts
| Contract | Chain | Address |
|----------|-------|---------|
| SwapExecutor | Base Mainnet | [`0xBcA2be0dCe857a936b4660538A9CCdDcB7aE92fF`](https://basescan.org/address/0xBcA2be0dCe857a936b4660538A9CCdDcB7aE92fF#code) |

### On-Chain Proof
| Description | Explorer |
|-------------|----------|
| Approve USDC for Uniswap Router | [Basescan](https://basescan.org/tx/0x3c17b6c1da74bfc53765da20d6e9eb23f03fafecf3c1356515b71d1becbcbc62) |
| Swap $1.20 USDC to 1.04 EURC | [Basescan](https://basescan.org/tx/0x64ef1982f28240e066244afb0bfa79421e6bdd3340df3e0036fbbbcf29392a56) |
| TWAP Chunk 1: $1.10 USDC to EURC | [Basescan](https://basescan.org/tx/0x307f6f6eff4295c756f694c8d98db441c6da8c66d765702200e989423df8691b) |
| TWAP Chunk 2: $0.018 USDC to EURC | [Basescan](https://basescan.org/tx/0xe9f1ca10606b03b792714d495426d5c0d08858db35c04ad974b1a565fdf471fc) |
| EURC to USDC reverse swap | [Basescan](https://basescan.org/tx/0x90136a1e31c349bf06f117ddd6c779c9aa98d1fe523339e3d4be75c369fc837f) |

### What to Look for in the Demo
- Real money: actual USDC/EURC swaps on Base mainnet, not testnet
- USDC/EURC 0.05% fee tier (pool fee 500) — optimal for stablecoin FX
- Agent-driven execution: the CRE workflow calls SwapExecutor, not a human clicking buttons
- Bidirectional swaps: USDC to EURC and EURC to USDC
- Adaptive TWAP chunking to minimize market impact on large orders

---

## Arc — Treasury Policy Engine + Audit Trail

### What We Built
A TreasuryVault smart contract deployed on Arc testnet that serves as the treasury control plane. It manages configurable policy (auto-execute thresholds, rate bands), a pending trade approval queue, CFO whitelist, and an immutable audit trail via on-chain events. All treasury state lives on Arc, where USDC is the native gas token.

### Where to Find the Code
| Component | Path |
|-----------|------|
| TreasuryVault contract | `contracts/src/TreasuryVault.sol` |
| Mock tokens (Arc) | `contracts/src/MockUSDC.sol`, `contracts/src/MockEURC.sol` |
| Deploy scripts | `contracts/script/` |
| Frontend settings page | `apps/app/src/app/settings/` |
| Frontend approval page | `apps/app/src/app/approve/` |

### Deployed Contracts
| Contract | Chain | Address |
|----------|-------|---------|
| TreasuryVault | Arc Testnet | [`0x75a1ff87d9369fefeb2914bd6cc69296f7ebd997`](https://testnet.arcscan.app/address/0x75a1ff87d9369fefeb2914bd6cc69296f7ebd997) |
| MockUSDC | Arc Testnet | [`0x4Fa3A73189DaC96f6D44cf67f25301E010C78BB7`](https://testnet.arcscan.app/address/0x4Fa3A73189DaC96f6D44cf67f25301E010C78BB7) |
| MockEURC | Arc Testnet | [`0xe022c7abF67DD1C99D679f6C7f5912bb4404D956`](https://testnet.arcscan.app/address/0xe022c7abF67DD1C99D679f6C7f5912bb4404D956) |

### What to Look for in the Demo
- Policy engine: configurable auto-execute threshold, rate band limits, CFO whitelist
- Audit trail: `TradeExecuted` events logged immutably after every swap
- Pending trade queue: large trades get queued for human approval, not auto-executed
- USDC-as-gas: Arc's native stablecoin model means no ETH needed for treasury operations
- Settings page: on-chain policy is readable and configurable from the frontend

---

## Unlink — Full Privacy Flow on Base Sepolia

### What We Built
A privacy mode for treasury swaps that hides the sender's identity using ZK proofs via the Unlink SDK. The 3-step flow — shield tokens into the privacy pool, execute swap as the pool (not the treasury), unshield output tokens — is fully working on Base Sepolia with 9+ verified transactions.

### Where to Find the Code
| Component | Path |
|-----------|------|
| Privacy sidecar server | `apps/privacy/` |
| Privacy frontend tab | `apps/app/src/app/trade/` (Private Treasury tab) |
| Privacy readme (standalone) | `docs/privacy-readme.md` |
| Mock tokens (Base Sepolia) | `contracts/src/MockUSDC.sol`, `contracts/src/MockWBTC.sol`, `contracts/src/MockWETH.sol` |

### Deployed Contracts (Base Sepolia)
| Contract | Address |
|----------|---------|
| Unlink Privacy Pool | `0x647f...0482` |
| MockUSDC | [`0x4Fa3A73189DaC96f6D44cf67f25301E010C78BB7`](https://sepolia.basescan.org/address/0x4Fa3A73189DaC96f6D44cf67f25301E010C78BB7) |
| MockEURC | [`0xe022c7abF67DD1C99D679f6C7f5912bb4404D956`](https://sepolia.basescan.org/address/0xe022c7abF67DD1C99D679f6C7f5912bb4404D956) |

### On-Chain Proof
| Direction | Token | Amount | Unlink Tx ID |
|-----------|-------|--------|-------------|
| Shield | EURC | 1,000,067 | `3eab4d38-08cf-49af-92bb-b294a7e27c12` — [Basescan](https://sepolia.basescan.org/tx/0xeb96a29a883cc653dde60cf91900e649c3d2c1011150b5b2c48b55279f2b603d) |
| Shield | EURC | 420,690 | `d47eae9b-364f-4f1a-abf3-0d6a00e13b10` |
| Unshield | EURC | 500,067.5 | `40771598-92ff-42b6-9109-017ffc3f3e28` |
| Unshield | USDC | 1,500,000 | `06cf93ed-f245-4aec-8b39-a4a34c916c88` |
| Unshield | EURC | 420,690 | `b4041a2d-d7f8-4139-a057-43d9d037ba08` |
| Unshield | WBTC | 0.67 | `9c9ab7ed-df04-44f5-81a2-393d675a11e6` |
| Shield | WBTC | 5 | `810f35ff-d055-414a-9f60-2fec0fb89fe3` |
| Shield | USDC | 1,000,067 | `a8277b2f-538b-47a4-9f7a-daba9cba682e` |
| Unshield | EURC | 420,069 | `a86755a0-dffc-40c6-986e-b70e60ae9edc` |
| Private Swap | USDC to EURC | 420,069 | confirmed |

### What to Look for in the Demo
- "Private Treasury" tab on the trade page — toggle between normal and private mode
- Side-by-side comparison: normal swap shows treasury address, private swap shows pool address `0x647f`
- 3-step progress indicator: deposit, execute, withdraw — each with a verifiable tx hash
- Selective transparency: amounts and tokens stay visible (compliance-friendly), only the sender identity is hidden
- Real use case: $50M/yr corporate treasury where competitors see swaps but cannot identify who

### Sponsor Feedback
We filed detailed developer feedback on the Unlink SDK covering 6 issues encountered during integration. See [sponsor-feedback.md](./sponsor-feedback.md#unlink).

---

## World — Human Verification for Large Trade Approvals

### What We Built
A World ID verification gate that prevents unauthorized approvals of large treasury trades. When the CRE agent detects a trade above the configured policy threshold, it queues the trade on Arc instead of auto-executing. A human CFO must verify their identity via World ID before the trade can be approved.

### Where to Find the Code
| Component | Path |
|-----------|------|
| IDKit frontend integration | `apps/app/src/app/approve/` |
| World ID backend verification | `apps/oracle/src/routes/` |
| Trade approval logic | `contracts/src/TreasuryVault.sol` (approval queue) |

### What to Look for in the Demo
- Approve page at `/approve` shows pending trades queued by the CRE agent
- "Approve with World ID" button triggers the IDKit verification widget
- Only verified humans can approve — prevents bot-driven or unauthorized trade execution
- Backend verification via World ID API v2
- Fallback to CFO wallet signature available for demo flexibility
- The threshold is configurable on-chain via the Settings page

---

## Cross-Cutting: Why 5 Integrations Matter

GetNear is not 5 separate demos. It is one product where all 5 sponsor technologies are load-bearing:

```
Chainlink CRE (brain)
  |
  +-- fetches quote from Uniswap Trade API (via Confidential HTTP)
  +-- reads policy from Arc TreasuryVault
  +-- reads balance from Base SwapExecutor
  +-- decides: auto-execute, queue, or wait
  |
  +-- auto-execute path:
  |     Uniswap V3 swap on Base --> audit log on Arc
  |
  +-- large-trade path:
  |     queue on Arc --> World ID approval --> Uniswap V3 swap on Base --> audit log on Arc
  |
  +-- privacy path:
        Unlink shield --> swap as pool (sender hidden) --> unshield
```

Remove any one sponsor and the system breaks:
- **Without CRE:** No autonomous agent — someone has to click buttons
- **Without Uniswap:** No DEX execution — the agent has nothing to trade
- **Without Arc:** No policy, no audit trail — the agent has no guardrails
- **Without World ID:** No human gate — large trades execute without oversight
- **Without Unlink:** No sender privacy — competitors see every treasury swap

---

*Built by  at ETHGlobal Cannes 2026. Questions? Find us at the demo booth.*

# Meridian FX

An AI treasury agent that monitors USDC/EURC FX rates, auto-executes small conversions through Uniswap on Base, requires human approval for large trades, and logs everything to an Arc treasury vault. Orchestrated by Chainlink CRE. Built for ETHGlobal Cannes 2026.

---

## Architecture Overview

```
Two chains, clean separation:

  BASE (chain 8453)                    ARC TESTNET (chain 5042002)
  +-----------------------+            +----------------------------+
  | SwapExecutor.sol      |            | TreasuryVault.sol          |
  | - CRE consumer        |            | - Policy engine            |
  | - Calls Uniswap V3    |            | - CFO whitelist            |
  | - Real USDC/EURC swaps|            | - Pending trade queue      |
  | - Emits SwapExecuted  |            | - Audit trail (events)     |
  +-----------------------+            | - Mock tokens for display  |
                                       +----------------------------+
            ^                                      ^
            |                                      |
  +---------+--------------------------------------+---------+
  |              CHAINLINK CRE WORKFLOW                      |
  |  Cron trigger -> Confidential HTTP (Uniswap quote)      |
  |  -> EVM Read (policy + balances) -> Decision logic      |
  |  -> EVM Write to Base (swap) + EVM Write to Arc (log)   |
  +----------------------------------------------------------+
```

- **Base** = execution layer. Real USDC/EURC swaps via Uniswap V3 SwapRouter02.
- **Arc** = treasury control plane. Policy, audit trail, pending trade approval queue.
- **CRE** = the agent brain. Monitors rates, reads policy, decides, executes.

---

## Key Constraints

### CRE Simulation-First Development
Chainlink booth confirmed at ETHGlobal Cannes: **simulation qualifies for the CRE bounty**. No live DON deployment required.
- Use `cre workflow simulate` for local testing and development
- Use `cre workflow simulate --broadcast` to execute real on-chain transactions during simulation
- Live DON deployment is a stretch goal only (Chainlink team offered to deploy for us if simulation works)
- This removes CRE deployment complexity from the critical path

### Display Multiplier (x1M)
For demo purposes, all USD amounts shown in the UI are multiplied by 1,000,000.
- $1 real USDC displays as "$1,000,000"
- $10 real USDC displays as "$10,000,000"
- The multiplier is defined in `packages/shared/constants.ts` as `DISPLAY_MULTIPLIER`
- Use `formatDisplayAmount()` and `displayToRaw()` for all conversions
- Never hardcode display logic -- always use the shared helpers

### Real Tokens on Base, Mock on Arc
- **Base**: Real USDC and EURC. Real swaps cost real money.
- **Arc testnet**: MockUSDC and MockEURC (ERC-20, 6 decimals, public mint + faucet).
- Never deploy mock tokens to Base. Never use real tokens on Arc testnet.

### MIN_TRADE_AMOUNT
- Contract constant: `1 * 10**6` (= $1 real USDC = 1_000_000 raw units)
- Defined identically in both SwapExecutor.sol and TreasuryVault.sol
- Also in `packages/shared/constants.ts` as `MIN_TRADE_AMOUNT = 1_000_000n`
- All three MUST stay in sync

### Price Sanity Check
- Never execute a swap unless the quoted price is within 0.1% of the Chainlink oracle price
- If prices diverge beyond threshold, block execution and flag for review

---

## Token Addresses

### Base Mainnet (chain 8453)

| Token | Address | Decimals |
|-------|---------|----------|
| USDC  | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 |
| EURC  | `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42` | 6 |
| WETH  | `0x4200000000000000000000000000000000000006` | 18 |
| DAI   | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` | 18 |
| cbBTC | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` | 8 |

### Arc Testnet (chain 5042002)

| Token | Address | Note |
|-------|---------|------|
| Predeployed USDC | `0x3600000000000000000000000000000000000000` | Native Arc testnet USDC |
| MockUSDC | Deploy via `DeployMockTokens.s.sol` | 6 decimals, public mint |
| MockEURC | Deploy via `DeployMockTokens.s.sol` | 6 decimals, public mint |

### Chainlink Feed Addresses (Base)

| Feed | Address | Decimals |
|------|---------|----------|
| EURC/USD | `0xDAe398520e2B67cd3f27aeF9Cf14D93D927f8250` | 8 |
| ETH/USD  | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` | 8 |
| BTC/USD  | `0xCCADC697c55bbB68dc5bCdf8d3CBe83CdD4E071E` | 8 |
| USDC/USD | `0x7e860098F58bBFC8648a4311b374B1D669a2bc6B` | 8 |

### Uniswap V3 (Base)

| Contract | Address |
|----------|---------|
| SwapRouter02 | `0x2626664c2603336E57B271c5C0b26F421741e481` |
| Pool fee tier | 500 (0.05% -- stablecoin default) |

---

## Chain Config

| Chain | ID | RPC | Explorer |
|-------|----|-----|----------|
| Base mainnet | 8453 | `https://mainnet.base.org` | basescan.org |
| Arc testnet | 5042002 | `rpc.testnet.arc.network` | testnet.arcscan.app |

---

## Package Overview

```
meridian-fx/
+-- packages/
|   +-- shared/          @meridian/shared -- types + constants all tracks import
+-- contracts/           Foundry project -- SwapExecutor, TreasuryVault, mocks
+-- meridian-cre/
|   +-- treasury/        CRE workflow -- full agent logic (oracle-driven)
|   +-- por/             CRE workflow -- proof of reserves
|   +-- nav/             CRE workflow -- NAV calculation
+-- apps/
|   +-- app/             Next.js 14 submission frontend (port 3100)
|   +-- oracle/          Oracle + strategy engine (Hono, port 38174)
|   +-- privacy/         Unlink privacy sidecar (port 38175)
|   +-- dev-ui/          Dev tool -- Vite + React dashboard (port 58173)
+-- docs/
|   +-- references/      Fynd API docs, sponsor tech reference
|   +-- reference/       Architecture decisions, PoC results, prize strategy
|   +-- conventions/     Gitflow, adapter interfaces
|   +-- archive/         Pre-implementation specs, reviews, planning docs
+-- compose.yaml         Fynd DEX aggregator Docker setup
```

### packages/shared (`@meridian/shared`)
Shared TypeScript types and constants. Every other package imports from here.
- `types.ts` -- QuoteSnapshot, TradeDecision, PendingTrade, ExecutionReceipt, ExecutionContext, ApprovalSession, TradeOrder, StrategyResponse, CRERun
- `constants.ts` -- DISPLAY_MULTIPLIER, token addresses, chain IDs, Uniswap config, MIN_TRADE_AMOUNT
- See `packages/shared/AGENTS.md` for rules

### contracts (Foundry)
Solidity 0.8.20 + OpenZeppelin v5. Two main contracts + mock tokens.
- `SwapExecutor.sol` -- CRE consumer on Base, calls Uniswap V3
- `TreasuryVault.sol` -- Policy engine on Arc, audit trail, pending trade queue
- `MockUSDC.sol` / `MockEURC.sol` -- Test tokens for Arc testnet and Base Sepolia
- `MockWBTC.sol` / `MockWETH.sol` -- Additional test tokens for Base Sepolia (Unlink testing)
- Deploy scripts use env vars (PRIVATE_KEY, CRE_FORWARDER, etc.)
- See `contracts/AGENTS.md` for rules

### apps/app (Next.js 14)
Submission frontend. Production build served at port 3100.
- Dashboard with real-time balances, trade history, rate display
- Trade form with TWAP execution, desired output mode
- Approval page with World ID verification
- Private Treasury tab (Unlink integration on Base Sepolia)
- Settings page for on-chain policy management
- i18n support (EN/FR)
- Demo mode with speed toggle (1x/10x)

### apps/oracle
Hono + viem + better-sqlite3. Oracle strategy engine + price recording.
- Records Chainlink feeds + Fynd DEX + Uniswap Trade API quotes every 30 seconds
- Strategy engine: timing score (0-100), adaptive TWAP chunking, trade order management
- REST API for price history, divergence, strategy decisions, trade orders, CRE run logging
- Port 38174, SQLite WAL mode
- See `apps/oracle/AGENTS.md` for rules

### apps/privacy
Unlink SDK privacy sidecar. Proxied through the main app's API routes.
- Wraps Unlink SDK for private treasury swaps on Base Sepolia
- 3-step flow: deposit into privacy pool, execute swap, withdraw output
- Port 38175

### apps/dev-ui
Vite 8 + React 19 + Tailwind v4 dashboard. Dev/ops tool.
- Oracle dashboard: live price readings, CRE run history, timing score display
- Quote tester, price charts, depth curves, trade order tracking
- Speed controls for demo mode
- Port 58173, proxies to Fynd and oracle

### meridian-cre (Chainlink CRE)
CRE workflows compiled to WASM. Oracle-driven execution.
- `treasury/` -- main agent: reads strategy from Oracle, executes swaps on Base, logs to Arc
- `por/` -- proof of reserves workflow
- `nav/` -- NAV calculation workflow
- Simulator loop: `run-simulator.sh` with flock guard and speed mode

### Fynd (Docker)
DEX aggregator by Propeller Heads. Aggregates Uniswap + Aerodrome + PancakeSwap.
- Runs via Docker Compose on Base chain
- API at `localhost:3000`
- Config in `compose.yaml` + `.env`

---

## Cross-Cutting Rules

### 1. All tracks import from @meridian/shared
```typescript
import { QuoteSnapshot, TradeDecision, TOKENS, CHAINS } from '@meridian/shared'
```
Never duplicate types locally. If you need a new shared type, add it to `packages/shared/src/types.ts`.

### 2. Commit at every checkpoint
After completing each phase or significant milestone, commit immediately. Do not batch multiple phases into one commit. Tag format: `track-X/phase-description`.

### 3. >45 min stuck = use fallback
If you are blocked on a primary approach for more than 45 minutes, switch to the documented fallback immediately. Every risky component has a fallback defined in `docs/reference/poc-results.md`.

### 4. Solidity enums and TypeScript types must match
The `TradeStatus` enum in TreasuryVault.sol (`PENDING, APPROVED, EXECUTED, REJECTED`) must match the TypeScript type in shared/types.ts. If one changes, the other must change in the same commit.

### 5. Never commit secrets
- `.env` is gitignored and contains `TYCHO_API_KEY` and other secrets
- `.env.example` is committed with placeholder values
- Deploy scripts read from env vars, never hardcoded

### 6. Adapter pattern for risky components
Every integration with an uncertain external dependency should use the adapter pattern:
- Define a typed interface
- Implement primary + fallback behind the same interface
- Switch via env var, not code change
- See `docs/conventions/adapter-interfaces.md`

### 7. Exchange rates use 18 decimals
All exchange rate values (in contracts and TypeScript) use 18-decimal precision for consistency. Field names end in `X18` in TypeScript (e.g., `exchangeRateX18`). Contracts use `ether` units (1.08 ether = 1.08e18).

---

## Hosting & Deployment

The app is hosted on this VPS (do-box), NOT Vercel. There is no auto-deploy.

```
meridian.omnipass.world → Cloudflare Tunnel → Caddy → localhost:3100 (Next.js)
dev.omnipass.world      → Cloudflare Tunnel → Caddy → localhost:58173 (Dev-UI)
```

**After merging PRs to main, you MUST restart services for the live site to update:**

```bash
# Pull latest code
cd /home/claude/code/meridian-fx && git checkout main && git pull origin main

# Restart app (production build + start)
pnpm app:restart     # kills :3100, builds, starts production server

# Restart Oracle
pnpm oracle:restart  # kills :38174, starts Oracle with latest code

# Restart Privacy sidecar (if needed)
fuser -k 38175/tcp; sleep 1
cd apps/privacy && set -a && source ../../.env && set +a && npx tsx src/index.ts &

# Or restart everything at once:
pnpm start           # kills both, builds app, starts both
```

**Remember:** `source .env` or `set -a && source .env && set +a` before starting services so env vars are loaded (DEMO_MODE, DEPLOYER_PRIVATE_KEY, UNLINK_API_KEY, etc.)

---

## Running the Stack

```bash
# Fynd DEX aggregator
pnpm fynd:up                    # start Docker container
pnpm fynd:down                  # stop
curl localhost:3000/v1/health   # verify

# Oracle server
pnpm oracle:restart             # port 38174
curl localhost:38174/health

# Main app (production)
pnpm app:restart                # port 3100 (build + start)

# Privacy sidecar
cd apps/privacy && npx tsx src/index.ts  # port 38175

# Dev UI
cd apps/dev-ui && pnpm dev      # port 58173

# Contracts
cd contracts && ~/.foundry/bin/forge build     # compile (forge NOT in PATH)
cd contracts && ~/.foundry/bin/forge test       # test
```

---

## Deep Reference

For detailed context beyond this file:

| Topic | File |
|-------|------|
| Architecture decisions | `docs/reference/architecture-decisions.md` |
| PoC results and unknowns | `docs/reference/poc-results.md` |
| Prize strategy | `docs/reference/prize-strategy.md` |
| Adapter interfaces | `docs/conventions/adapter-interfaces.md` |
| Git workflow | `docs/conventions/gitflow.md` |
| Fynd API reference | `docs/references/fynd/` (14 files + llms-full.txt) |
| Privacy (Unlink) readme | `docs/privacy-readme.md` |
| Sponsor feedback | `docs/sponsor-feedback.md` |
| Architecture diagrams | `docs/architecture-diagrams.md` |
| Presentation script | `docs/PRESENTATION_SCRIPT.md` |
| Archived planning docs | `docs/archive/` (specs, build plan, reviews, playbook) |
| Planning PDFs | Root directory (Battle Plan, Tech Spec, Unknowns, etc.) |
| CRE skill reference | `.agents/skills/chainlink-cre-skill/` |
| CCIP skill reference | `.agents/skills/chainlink-ccip-skill/` |

---

## Unknowns Status (All Resolved)

| # | Unknown | Severity | Verdict |
|---|---------|----------|---------|
| 1 | Uniswap USDC/EURC on Base | PROJECT-KILLER | CONFIRMED (via Fynd + direct Uniswap API) |
| 2 | CRE simulation HTTP + EVM | PROJECT-KILLER | CONFIRMED (simulation qualifies for bounty, `--broadcast` for real writes) |
| 3 | Arc mainnet accessible | ARCH-CHANGER | Testnet only (chain 5042002) |
| 4 | CRE supports Base AND Arc | ARCH-CHANGER | CONFIRMED (simulation reads/writes both chains) |
| 5 | World ID verify format | ARCH-CHANGER | CONFIRMED (demo mode working, real verify API ready) |
| 6 | MiniKit walletAuth surface | NICE-TO-HAVE | N/A (not pursued — used standard Next.js app instead) |
| 7 | SwapExecutor real swap | ARCH-CHANGER | CONFIRMED (CRE simulation executes swap on Base) |
| 8 | CRE consumer pattern | NICE-TO-HAVE | CONFIRMED (using simplified onlyCRE modifier) |

See `docs/reference/poc-results.md` for full details and fallback plans.

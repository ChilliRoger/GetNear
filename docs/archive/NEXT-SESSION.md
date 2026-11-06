# Next Session Context

Last updated: 2026-04-03 ~4:00 PM ET (hackathon day 1, evening)

## What Is GetNear

An AI treasury agent for the stablecoin era. It monitors USDC/EURC FX rates, auto-executes small conversions on Uniswap (Base), requires World ID-verified human approval for large trades, and logs everything to Arc. Orchestrated by Chainlink CRE. Target: ETHGlobal Cannes 2026.

**One-liner:** Replace the $120B/year bank FX workflow with an autonomous on-chain agent.

**Prize targets:** Uniswap ($10K), Chainlink CRE ($4K), Arc ($3K). Total realistic EV: $5.5-10K.

## What's Built So Far

### Infrastructure
- **Monorepo**: pnpm workspaces + turborepo at `/home/claude/code/getnear`
- **Fynd DEX aggregator**: Docker container on Base chain at `localhost:3000`. Quotes USDC↔EURC (and all Base tokens) via Uniswap v3, Aerodrome, PancakeSwap etc. Uniswap booth recommended using this.
- **Oracle server** (`apps/oracle/`): Hono + viem + better-sqlite3 on port 38174. Records every 30s:
  - EURC/USD from Chainlink (`0xDAe398520e2B67cd3f27aeF9Cf14D93D927f8250`, 8 decimals)
  - ETH/USD, BTC/USD, USDC/USD from Chainlink
  - EURC/USD from Fynd DEX quote (10K USDC→EURC, inverted)
  - Both Chainlink + Fynd prices stored in same row for EURC/USD — divergence calculated
  - SQLite DB at `apps/oracle/data/prices.db` (gitignored, WAL mode)
  - REST endpoints: `/health`, `/prices/current`, `/prices/history`, `/depth`, `/depth/book`
  - Uses `https://mainnet.base.org` for RPC (separate from Fynd to avoid rate limits)
- **Dev UI** (`apps/dev-ui/`): Vite 8 + React 19 + Tailwind v4 on port 58173. Tabs:
  - **Quote**: swap quote tester (any token pair, Fynd backend)
  - **Prices**: live Chainlink vs Fynd price tiles, history line chart, divergence chart
  - **Depth**: unidirectional liquidity depth curve (6 sizes)
  - **Book**: bidirectional order book depth chart with zoom controls (both sides of the spread)
- **VPS routing**: `` → Cloudflare Tunnel → Caddy → Vite. Vite proxies `/api/fynd/*` → Fynd and `/api/oracle/*` → oracle server.
- **Domain**: `getnear.world` zone in Cloudflare. Only `` has a CNAME so far.

### Key Discovery: EURC/USD Chainlink Feed
Found at `0xDAe398520e2B67cd3f27aeF9Cf14D93D927f8250` on Base (8 decimals). This gives us both a Chainlink oracle price AND a Fynd DEX-derived price for EURC/USD — enabling the sanity check (divergence comparison) that is core to the product narrative.

### Commit History (all post-9pm Cannes)
```
25eac18  Initial monorepo setup
c94ed42  Add Fynd DEX aggregator Docker setup and reference docs
191c509  Add dev-ui app with Fynd swap quote tester
c52a6bb  Add Chainlink price oracle server with SQLite recording
2cf8ed9  Add oracle UI tabs (Prices, Depth) and system readme
b12b05a  feat(ui): setup tailwind
609419d  feat(feeds): new feeds and depth chart
c2ebabb  docs: add planning docs
```

### Uncommitted
- `tech-spec-fixes.txt` — ChatGPT feedback on the tech spec (11 items, mostly World ID payload alignment and Uniswap quote parser issues)
- HUMAN_README.md and TODO.md may be slightly stale vs current state (oracle now records EURC/USD from Chainlink, not just Fynd)
- Latest oracle server code has EURC/USD Chainlink feed + Fynd comparison in same recording cycle, plus `/depth/book` bidirectional endpoint

## What's NOT Built Yet

### Critical Path (Never Cut)
1. **Chainlink CRE workflow** — the agent brain. Cron trigger → fetch rates → read policy → decide → execute/queue. This IS the product. Without it, there's no agent. Fallback: Node.js cron (loses Chainlink bounty).
2. **SwapExecutor.sol on Base** — CRE consumer contract that validates reports, approves USDC, calls Uniswap router. THE money checkpoint — one real swap = entire demo.
3. **TreasuryVault.sol on Arc** — policy engine, CFO whitelist, audit trail, pending trade queue. Arc is the treasury control plane.
4. **shared/types.ts** — `QuoteSnapshot`, `TradeDecision`, `PendingTrade`, `ApprovalResult`, `ExecutionReceipt`, `ExecutionContext`. All tracks import from here. Interfaces defined in battle plan Section 4.
5. **Mock tokens** — MockUSDC.sol + MockEURC.sol (ERC-20, 6 decimals, public mint). Deploy to both Base and Arc.

### Important but Cuttable
6. **World ID approval flow** — human-in-the-loop for large trades via World App + IDKit. Strong for World bounty ($8K pivot).
7. **MiniKit Mini App shell** — turns the dashboard into a World Mini App. Strong narrative.
8. **Savings calculator** — Track D, visual demo of bank fees vs GetNear.
9. **Bridge Base→Arc** — optional, drop first if behind.

## Planning Documents

All 6 planning PDFs are in the repo root (committed in `c2ebabb`):
- `GetNear Battle Plan.pdf` — **READ FIRST**. Prize strategy, architecture, workstreams, demo script, risk assessment, simplification ladder.
- `GetNear Overview.pdf` — pitch doc, architecture diagrams, prize tracks.
- `GetNear Unknowns and PoCs.pdf` — 8 unknowns with severity ratings and PoC plans.
- `GetNear Technical Spec.pdf` — detailed components, code patterns, CRE workflow pseudocode.
- `GetNear Pre Hackathon Setup.pdf` — setup checklist with blocker status.
- `GetNear Submission Plan.pdf` — submission requirements and timeline.
- `tech-spec-fixes.txt` — 11 items of ChatGPT feedback on the tech spec (uncommitted).
- `docs/project-setup-playbook.md` — the wave-by-wave setup process (how this project was bootstrapped).

## Unknowns Status

| # | Unknown | Severity | Status |
|---|---------|----------|--------|
| 1 | Uniswap USDC/EURC quotes on Base | PROJECT-KILLER | **CONFIRMED** (via Fynd, real quotes working) |
| 2 | CRE simulation with HTTP + EVM Write | PROJECT-KILLER (for Chainlink bounty) | **CONFIRMED** — Chainlink booth says simulation qualifies, `--broadcast` for real writes |
| 3 | Arc mainnet accessible | ARCHITECTURE-CHANGER | **NOT TESTED** — try `cast chain-id --rpc-url https://rpc.arc.network` |
| 4 | CRE supports Base AND Arc | ARCHITECTURE-CHANGER | **NOT TESTED** — check CRE supported networks |
| 5 | World ID backend verify format | ARCHITECTURE-CHANGER | **NOT TESTED** — deferred to Track A Phase A3 |
| 6 | MiniKit walletAuth API surface | NICE-TO-HAVE | **NOT TESTED** |
| 7 | SwapExecutor real swap on Base | ARCHITECTURE-CHANGER | **NOT TESTED** — THE money test |
| 8 | CRE consumer contract pattern | NICE-TO-HAVE | **NOT TESTED** |

## Divergences from Original Plan

1. **Fynd instead of raw Uniswap API** — Uniswap booth recommended Fynd. It aggregates Uniswap + Aerodrome + PancakeSwap. Better execution. Still routes through Uniswap pools (strengthens Uniswap submission).
2. **EURC/USD Chainlink feed exists** — original plan assumed it didn't. Found at `0xDAe398520e2B67cd3f27aeF9Cf14D93D927f8250`. Enables the oracle-vs-DEX sanity check.
3. **Oracle server as standalone** — plan assumed CRE does all monitoring. Oracle server is a good dev tool + dashboard backend. CRE should be the decision-maker at submission time.
4. **Tailwind v4** — used for dev-ui styling instead of custom CSS.

## Token Addresses (Base)

| Token | Address | Decimals |
|-------|---------|----------|
| WETH  | `0x4200000000000000000000000000000000000006` | 18 |
| USDC  | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 |
| EURC  | `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42` | 6 |
| DAI   | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` | 18 |
| cbBTC | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` | 8 |

## Chainlink Feed Addresses (Base)

| Feed | Address | Decimals |
|------|---------|----------|
| EURC/USD | `0xDAe398520e2B67cd3f27aeF9Cf14D93D927f8250` | 8 |
| ETH/USD | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` | 8 |
| BTC/USD | `0xCCADC697c55bbB68dc5bCdf8d3CBe83CdD4E071E` | 8 |
| USDC/USD | `0x7e860098F58bBFC8648a4311b374B1D669a2bc6B` | 8 |

## Running Services

These may or may not still be running when you resume:
```bash
# Check/start Fynd
pnpm fynd:up  # or: docker compose up -d fynd
curl localhost:3000/v1/health

# Check/start Oracle
cd apps/oracle && pnpm dev  # port 38174
curl localhost:38174/health

# Check/start Dev UI
cd apps/dev-ui && npx vite --host 127.0.0.1  # port 58173
curl -s -o /dev/null -w "%{http_code}" https:///
```

## Recommended Next Steps

1. **Validate blockers**: CRE CLI + simulation (Unknown 2), Arc mainnet (Unknown 3), CRE network support (Unknown 4)
2. **Create `packages/shared/types.ts`** with interfaces from battle plan Section 4
3. **Scaffold Track C (smart contracts)** — SwapExecutor.sol + TreasuryVault.sol + MockUSDC/EURC. All other tracks need their ABIs.
4. **Scaffold Track B (CRE workflow)** — even just the template for simulation
5. **Ask user**: Do you have CRE CLI installed? Uniswap API key? Funded wallets on Base/Arc?

## Git

- Remote: `git@github.com:getnear/getnear.git` (origin)
- Branch: `main`
- Git user: configured by user (liam@chaintail.xyz)
- Timestamps were rewritten to be post-9pm Cannes (CEST) via filter-branch

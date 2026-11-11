# GetNear — Context

*Sections 1–3 from the GetNear Agent Prompt Pack. Read this before starting any work session.*

## 1. Project description

**GetNear** is an autonomous treasury FX agent for NEAR teams. This prototype is testnet-only.

**Why it exists.** A team holding stablecoins that must convert them before a deadline (for example a USD stablecoin into a euro stablecoin) usually converts manually, converts everything in one trade at whatever rate is live, or hands an agent too much authority. NEAR already has multi-signer treasuries (Trezu, built on Sputnik DAO) and cross-chain swaps through NEAR Intents. To our knowledge (an absence we could not prove), nothing open automates execution timing under limits the agent cannot break.

**What it brings.**

- Goal-based orders: amount, pair, deadline, max chunk size, max price deviation.
- Chunked, timed execution: live quotes compared against a reference FX rate drive a timing score.
- A contract-enforced budget: the agent can only act inside on-chain limits, and larger orders need multi-signer DAO approval.
- A transparent decision log, with a testnet explorer link for every on-chain step.

**What it is NOT (never claim these).**

- Mainnet cross-chain bridge execution. NEAR Intents has no testnet market-maker network, so market quotes are read via 1Click `dry: true` (simulated USDC FX leg). On NEAR testnet, invoice/order payouts use callback-verified cross-contract `ft_transfer` on demo NEP-141 token contracts (`usdc.chilliroger-operator.testnet` & `eure.chilliroger-operator.testnet`) to `order.recipient`.
- Mainnet funds, Confidential Intents, or any privacy claim.
- Savings, alpha, or better-than-bank rates.
- Oracle-verified prices. The price deviation is reported by the agent and is not verified on-chain.
- Trezu integration. The design is compatible with Sputnik-based treasuries; claim Trezu only after testing it.

**The 60–90 second demo.**

1. Open the dashboard: connects with any NEAR wallet (Meteor, Sender, Here, MyNearWallet).
2. Claim 500 Testnet USDC via the 1-click faucet; import tokens into Meteor Wallet.
3. Create a small order ($20 USDC). It is Active at once. The agent evaluates live 1Click and ECB market rates, executes chunks, and transfers real EURe directly into the user's wallet.
4. Create a large order ($250 USDC). It is Pending. A Sputnik DAO proposal appears. Two of three council members vote. The order becomes Active.
5. Show that the agent's key is restricted strictly to `execute_chunk`, and show an over-limit call reverting.
6. Open the explorer links on NEARBlocks for each transaction (order creation, DAO votes, chunk executions, and NEP-141 token transfers).

**Tracks.** Primary: Real-World Money and Autonomous Business. Secondary: AI Security & Defense (contract limits, restricted key, multi-signer approval). Privacy is not claimed.

**Decisions already fixed.** Testnet only. Quotes come from 1Click `dry: true` calls (read-only HTTPS to the mainnet quote API, no funds). The USDC FX conversion is simulated accounting, while demo NEP-141 EURe payouts transfer cross-contract inside `FxBudget::execute_chunk` and reduce invoice balance due only inside `on_chunk_settled` callback confirmation. A Rust contract (`FxBudget`) is owned by a testnet Sputnik DAO. The agent holds a function-call key limited to `execute_chunk`. Trezu, Rhea, OutLayer, Aurora, HOT and Confidential Intents are out of scope. NEAR AI is an optional extra (block P11).

## 2. GetNear: what exists upstream

Source: the upstream README (https://github.com/pulseplay-stack/meridian-fx). Everything below is as described there; it has not been independently verified in code. License: the README says MIT, but the repo root has no LICENSE file. Built by Team Ippo at ETHGlobal Cannes 2026 (Chainlink privacy-standard prize).

**Features.**

- AI treasury FX agent: monitors USDC/EURC rates via Uniswap on Base, auto-executes small conversions, requires World ID-verified approval for large trades, logs actions to an audit trail on Arc.
- Strategy decision engine: timing score 0–100 from price vs 24h average (40%), source divergence among Chainlink, Fynd and Uniswap (20%), and urgency toward the deadline (40%). Score above 85 executes aggressively (2x chunk), 70–85 normally (1x), below 70 waits.
- Adaptive TWAP: chunk size with a quadratic urgency ramp.
- Desired-output mode: target output amount with a 5% input buffer.
- Decision log in SQLite and a dev-UI operations dashboard (oracle readings, run history, demo speed controls).
- Privacy mode via Unlink (ZK pool) and Confidential HTTP via Chainlink CRE.
- EN/FR i18n, toast errors, React error boundaries, exponential retry backoff.
- Marketing artifacts removed: a modeled $625K/yr savings claim, and a display multiplier that showed amounts 1,000,000 times larger in the UI (now set to 1).

**Upstream structure and stack.** Monorepo (pnpm, Turborepo): `packages/shared` (types), `contracts/` (Foundry: SwapExecutor, TreasuryVault — deleted), `meridian-cre/` (Chainlink CRE workflows — deleted), `apps/app` (Next.js 14 + Tailwind + viem), `apps/oracle` (Hono + better-sqlite3 + viem), `apps/privacy` (Unlink sidecar — deleted), `apps/dev-ui`, `docs/` (architecture diagrams 01–08), plus PDFs (deleted), `AGENTS.md`, `CLAUDE.md` (replaced), `.agents/skills`, `.claude/skills` (deleted). Requires Node 20+, pnpm 9+.

**Keep / adapt / replace / delete.**

| Upstream piece | Plan |
| --- | --- |
| `packages/shared` | Keep, extend with GetNear domain types |
| `apps/oracle` strategy engine, decision log (SQLite) | Keep, adapt inputs to 1Click quotes and a reference rate |
| `apps/app` (Next.js) | Keep, replace EVM wallet layer with NEAR testnet wallet |
| `apps/dev-ui` | Keep as the Ops panel |
| `contracts/` (Solidity) | Deleted; replaced by Rust `FxBudget` |
| `meridian-cre/` | Deleted; replaced by an agent runner service |
| `apps/privacy` (Unlink), World ID, Arc, Base, viem | Deleted |
| PDFs, `AGENTS.md`, `CLAUDE.md`, skills folders | Deleted and replaced with GetNear versions |

## 3. Architecture and end-to-end workflow

```
Operator wallet --create_order--> FxBudget contract (testnet) <--execute_chunk (function-call key)-- Agent runner
                                        ^                                                                 |
                                        | approve_order (owner = DAO only)                                |-- 1Click dry quotes (read-only)
                                  Sputnik DAO (council 2-of-3) <-- votes -- Council wallets               |-- Reference FX rate (free API)
Dashboard <-- RPC reads (testnet) + local decision log (SQLite) + explorer links (testnet.nearblocks.io)
```

**Actors.** Operator (requester). Agent (server process plus a NEAR account holding a restricted key). Council (three testnet accounts, voters of the DAO). `FxBudget` contract. Sputnik DAO v2. Quote providers. Dashboard.

**Order states.** Pending (above auto-cap, waiting for DAO) → Active → Completed. Active or Pending can become Expired (deadline passed) or Cancelled.

**Workflow, start to end.**

1. Setup, once: create testnet accounts; create the DAO (council of 3, 2-of-3); deploy `FxBudget` with owner = DAO; through DAO proposals call `set_agent`, `add_requester`, `set_limits`; add the restricted function-call key to the agent account.
2. Intake: the operator enters a goal. The UI signs `create_order`. Amount at or under the auto-cap makes the order Active; above it makes it Pending.
3. Approval path: for a Pending order, a Sputnik FunctionCall proposal calling `approve_order(id)` is created. The council votes. When the threshold is met the DAO calls the contract and the order is Active.
4. Decision loop: every N seconds the agent reads Active orders, fetches dry quotes and the reference rate, computes deviation and timing score, and decides WAIT or EXECUTE. Every tick is logged with reasons.
5. Execution: on EXECUTE the agent signs `execute_chunk(id, amount_in, quote_ref, deviation_bps, simulated_out)` with the restricted key. The contract checks limits and emits an event. The simulated fill is stored.
6. Completion: when the total is reached the order is Completed. If the deadline passes first it is Expired and the remainder is flagged.
7. Observability: the dashboard reads contract views over RPC, shows the decision log, and links every transaction on the testnet explorer.

**Trust table (be honest about this everywhere).**

| Property | Enforced by | Strength |
| --- | --- | --- |
| Only the DAO approves large orders or changes limits | Contract owner check | On-chain, hard |
| Agent can call only `execute_chunk` | Access-key restriction | Protocol, hard |
| Max chunk, total, deadline, minimum interval | Contract | On-chain, hard |
| Price deviation limit | Agent-reported `deviation_bps` policy check | Policy check on agent-reported value |
| Quote authenticity | Nothing | Not verified |
| USDC FX conversion leg | 1Click `dry: true` accounting | Simulated (demo prototype) |
| Invoice balance reduction | Cross-contract `ft_transfer` + `on_chunk_settled` callback | On-chain, hard (testnet demo NEP-141 EURe) |
| Chunk retry double-pay protection | `ChunkRecord` idempotency store (`InFlight \| Settled \| Failed`) | On-chain, hard |


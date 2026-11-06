# Prize Strategy

Submit to exactly 3 bounty tracks. Design integrations with 5+ sponsors. Pick best 3 at submission time.

---

## Primary Trio: Uniswap + Chainlink + Arc

| Track | Sub-Track | Pool | Split | Our EV |
|-------|-----------|------|-------|--------|
| Uniswap | Best API Integration | $10,000 | 1st: $5K, 2nd: $3K, 3rd: $2K | $2,500-$5,000 |
| Chainlink | CRE Workflow | $4,000 | $2K x 2 teams | $1,500-$2,000 |
| Arc | Chain Abstracted USDC Apps | $3,000 | $3K single winner | $1,500-$3,000 |
| **Total** | | | | **$5,500-$10,000** |

### Also qualifies for (no submission slot needed):
- Chainlink Privacy Standard ($1K per team) -- Confidential HTTP for FX API credentials
- World MiniKit 2.0 ($4K) -- if the dashboard ships as a Mini App

---

## Why This Trio

**Uniswap ($10K pool):** Explicitly wants "agent-based systems, automated strategies, new financial primitives." An AI FX agent routing trades through their API is exactly what they are asking for. The Fynd aggregator still routes through Uniswap pools.

**Chainlink CRE ($4K pool):** CRE is the agent's brain. Not a bolt-on -- the entire monitoring -> decision -> execution flow IS a CRE workflow. Cron trigger, Confidential HTTP, EVM Read/Write. Simulation counts for qualification. Chainlink will deploy it for us if simulation works.

**Arc ($3K pool):** "Chain Abstracted USDC Apps" track wants "applications that treat multiple blockchains as one liquidity surface, using Arc to move USDC wherever it's needed." We use Base for execution and Arc for settlement -- chain abstraction with Arc as the hub.

---

## Qualification Requirements

### Uniswap
- Must use Uniswap API or contracts for swap execution
- SwapExecutor.sol calls Uniswap V3 SwapRouter02.exactInputSingle
- Fynd quotes include Uniswap pool routing data
- Show real swap tx on Base mainnet

### Chainlink
- Must use CRE workflow (not just price feeds)
- Successful simulation counts even without live deployment
- CRE runs the full cycle: cron -> HTTP fetch -> EVM read -> decide -> EVM write
- Confidential HTTP qualifies for Privacy Standard bonus

### Arc
- Must deploy contract(s) to Arc
- TreasuryVault.sol on Arc testnet (chain 5042002)
- Show treasury policy management, audit trail, approval queue
- Demonstrate cross-chain interaction (Base swap -> Arc logging)

---

## Pivot Scenarios

| If We Observe... | We Swap... | New Trio | Reasoning |
|------------------|-----------|----------|-----------|
| Everything works | Keep default | Uniswap + Chainlink + Arc | Strongest technical alignment |
| Arc track looks crowded | Arc -> World | Uniswap + Chainlink + World | World's $8K pool, human-in-the-loop |
| CRE too complex to ship | Chainlink -> World | Uniswap + Arc + World | Lose CRE but project works |
| Want maximum pool size | Arc -> Ledger | Uniswap + Chainlink + Ledger | Ledger $6K, "hardware approval" |
| World looks packed | Keep default or add Ledger | Uniswap + Chainlink + Ledger | Ledger AI Agents is natural fit |

### Every Combination Works

| Combo | Narrative | Total Pool |
|-------|-----------|------------|
| Uniswap + Chainlink + Arc | "Decentralized FX agent on chain-abstracted stablecoin rails" | $17K |
| Uniswap + Chainlink + World | "Privacy-preserving FX agent with human oversight" | $21K |
| Uniswap + Chainlink + Ledger | "Hardware-secured autonomous treasury management" | $20K |
| Uniswap + Arc + World | "Human-verified FX trading on stablecoin-native L1" | $23K |
| Uniswap + World + Ledger | "Dual approval FX agent (phone + hardware)" | $24K |

---

## Networking Priority

1. **Uniswap booth (Hour 0):** Already connected. Confirm Fynd setup, get API key working, show FX treasury angle.
2. **Chainlink booth (Hour 1):** "CRE IS our product, not a bolt-on." Ask about CRE template for cron + HTTP + EVM write.
3. **Arc booth (Hour 1):** "Chain-abstracted treasury agent. Swaps on Base, audit trail on Arc."
4. **World booth (Hour 2):** "FX agent pushes approval requests to World App for large trades."
5. **Ledger booth (Hour 3, if time):** "Hardware approval flow for large trades."

---

## Simplification Ladder (What to Cut)

In order of decreasing priority -- cut from bottom first:

1. **NEVER CUT:** SwapExecutor + TreasuryVault + CRE workflow + one real swap
2. **NEVER CUT:** Shared types package (tracks depend on it)
3. **CUT IF BEHIND:** Bridge Base -> Arc (optional, drop first)
4. **CUT IF BEHIND:** Savings calculator (Track D, visual demo)
5. **CUT IF DESPERATE:** World ID verification (fall back to wallet signature only)
6. **CUT IF DESPERATE:** MiniKit Mini App shell (serve as regular web app)
7. **CUT IF DESPERATE:** Full CRE consumer pattern (keep simplified onlyCRE)

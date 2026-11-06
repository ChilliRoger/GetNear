# GetNear — Presentation Script

**Format:** 4-5 minute video demo for ETHGlobal Cannes 2026 submission
**Target:** Judges evaluating for Uniswap, Chainlink CRE, Arc, World ID, and Base bounties

---

## Timeline

| Time | Section | Duration | Screen |
|------|---------|----------|--------|
| 0:00 | Hook + Problem | 30s | Landing page hero |
| 0:30 | Solution overview | 30s | Architecture diagram on landing page |
| 1:00 | Live dashboard walkthrough | 60s | Dashboard with real data |
| 2:00 | CRE workflow demo | 60s | Terminal — CRE simulation |
| 3:00 | Approval flow + World ID | 30s | Approve page |
| 3:30 | Privacy Mode + Unlink SDK | 45s | Dashboard Privacy tab + Basescan |
| 4:15 | Savings + closing | 15s | Savings calculator + sponsors |
| 4:30 | End | — | — |

---

## Script

### 0:00 — Hook + Problem (30s)

**Show:** Landing page at github.com/ChilliRoger/GetNear

> "Last month, someone swapped $50 million through a major DeFi frontend. The quote was mispriced. They got back $37,000. A 99.9% loss, with zero safety checks."
>
> "GetNear is an autonomous treasury agent that makes sure this never happens. It monitors FX rates, executes at optimal prices, requires human approval for large trades, and logs everything on-chain."

**Action:** Scroll to stats strip showing ~0.05% fee, 24/7 operation.

---

### 0:30 — Solution Overview (30s)

**Show:** Architecture section on landing page

> "Here's how it works. GetNear is a Chainlink CRE workflow — a decentralized agent that runs on oracle nodes."
>
> "Every 60 seconds, it fetches a live Uniswap quote, reads the treasury policy from Arc, checks the balance on Base, and makes a decision: auto-execute, queue for approval, or wait."
>
> "Small trades execute automatically. Large trades get routed to a human approver verified by World ID."

**Action:** Point to the execution pipeline diagram (Monitor → Decide → Execute → Log).

---

### 1:00 — Live Dashboard Walkthrough (60s)

**Show:** Dashboard at github.com/ChilliRoger/GetNear/dashboard

> "This is the live dashboard reading directly from deployed contracts on Base and Arc."

**Point to each section:**

> "Here's the real-time USDC/EURC rate from Uniswap — currently around 1.08."
>
> "These are the actual token balances on Base — our execution capital. And here's the treasury ledger on Arc."
>
> "The active policy is enforced on-chain: auto-execute threshold, rate band limits. Everything configurable."
>
> "And here's the trade history showing recent executions — auto-swaps marked in blue, manually approved ones in amber."

**Action:** Navigate to Settings page briefly.

> "Policy settings are managed on-chain on Arc. The CFO sets the threshold and rate bands, and the CRE agent enforces them autonomously."

---

### 2:00 — CRE Workflow Demo (60s)

**Show:** Terminal running CRE simulation

> "Let me show you the CRE agent in action. This is a live simulation with broadcast — real transactions on real chains."

**Run:** `cre workflow simulate treasury --broadcast`

> "Watch what happens: it fetches a quote from Uniswap... reads the policy from Arc... checks the balance on Base... the rate is within band, the amount is below threshold, so it auto-executes."
>
> "There — a real swap just happened on Base mainnet through Uniswap V3. And the audit log was written to Arc. Two chains, one workflow, fully autonomous."

**Point to:** Transaction hashes in the output.

> "Every step is verifiable on-chain. The swap on BaseScan, the audit entry on ArcScan."

---

### 3:00 — Approval Flow + World ID (30s)

**Show:** Approve page at github.com/ChilliRoger/GetNear/approve

> "For trades above the threshold — in our demo that's displayed as $10 million — the agent doesn't auto-execute. It creates a pending trade on Arc and waits for human approval."
>
> "The CFO opens the dashboard, reviews the trade details, and approves with World ID. Only verified humans can approve large trades. No bots. No unauthorized approvals."

**Action:** Click "Approve with World ID" button, show verification flow.

---

### 3:30 — Privacy Mode + Unlink SDK (45s)

**Show:** Trade page Privacy tab at github.com/ChilliRoger/GetNear/trade

> "Now let me show you why privacy matters for treasury FX. Switch to the Private Treasury tab."

**Action:** Click the "Private Treasury" tab.

> "Imagine a corporate treasury doing $50 million a year in stablecoin conversions. Every swap on a public chain reveals your wallet, your timing, your sizing — competitors and MEV bots can front-run you. GetNear integrates the Unlink SDK to solve this."

**Action:** Point to the Privacy Comparison card showing Normal vs. Private side by side.

> "On the left — a normal swap. The sender is your treasury address, fully visible on Basescan. On the right — a private swap through the Unlink pool. The sender is the pool address. Nobody can link it back to you."

**Action:** Click "Request Test Tokens" to show the faucet working.

> "We're on Base Sepolia testnet. Let me request some test tokens from the faucet."

**Action:** Set amount to 100 USDC and click "Execute Private Swap." Walk through the 3-step progress indicator.

> "Now watch the three-step private execution: first, tokens deposit into the Unlink privacy pool. Then the swap executes — but the on-chain sender is the pool contract, not our treasury. Finally, the converted tokens withdraw back to us. Each step shows a transaction hash you can verify on Basescan."

**Action:** Open Basescan in a new tab. Show the swap transaction.

> "Here's the key difference. If I look at this swap on the block explorer, the sender is the Unlink pool — `0x647f`. There's no way to trace this back to our treasury wallet. The trade happened on-chain. The audit trail is on Arc. But the identity link is broken — that's selective transparency."

**Unlink Bounty Talking Points** (hit these for the judges):

> "We use the `@unlink-xyz/sdk` on Base Sepolia. The pool address is `0x647f...0482`. ZK proofs validate that the depositor is authorized to execute without revealing which depositor they are. Amounts and tokens stay visible — this is privacy for identity, not for compliance evasion. The treasury gets the privacy of a traditional bank wire with the auditability of on-chain execution."

---

### 4:15 — Savings + Closing (15s)

**Show:** Savings calculator on landing page

> "The numbers speak for themselves. On $50 million in annual FX volume, a traditional bank charges about $650,000 in fees. GetNear does it for $25,000. That's $625,000 saved, every year."
>
> "GetNear — autonomous treasury management for the stablecoin era. Built with Uniswap, Chainlink CRE, Arc, World ID, and Base."

**Action:** Show sponsor grid at bottom of landing page.

---

## Key Phrases to Hit (for judges)

### Uniswap judges want to hear:
- "Uniswap V3 SwapRouter02 on Base"
- "USDC/EURC 0.05% fee tier"
- "Real swap execution, not just quotes"
- "Agent-based trading system using Uniswap API"

### Chainlink judges want to hear:
- "Full CRE workflow — not a bolt-on"
- "Cron trigger, Confidential HTTP, EVM Read, EVM Write"
- "Cross-chain orchestration from a single workflow"
- "Simulation with --broadcast, real on-chain writes"

### Arc judges want to hear:
- "Chain-abstracted USDC application"
- "Arc as the treasury control plane"
- "Policy, audit trail, approval queue — all on Arc"
- "USDC-as-gas for native stablecoin operations"

### World ID judges want to hear:
- "Proof-of-humanity for trade approval"
- "Prevents bot/unauthorized approvals"
- "IDKit integration with backend verification"
- "Human-in-the-loop for large trades"

### Unlink / Privacy judges want to hear:
- "ZK proofs hide sender identity from on-chain observers"
- "Unlink SDK (`@unlink-xyz/sdk`) for private treasury swaps"
- "Privacy Mode tab on dashboard with live testnet demo"
- "Base Sepolia integration — pool address `0x647f...0482` — production-path ready"
- "Three-step flow: deposit into pool, execute swap as pool (not treasury), withdraw"
- "Selective transparency: amounts and tokens visible for compliance, only identity is hidden"
- "Side-by-side comparison on block explorer: normal swap shows treasury, private swap shows pool"
- "Real use case: $50M/yr treasury — competitors see swaps but can't identify who"

---

## Recording Tips

1. **Use a clean terminal** — dark theme, large font, no personal info visible
2. **Pre-fund the wallet** — make sure there's enough USDC for a demo swap
3. **Clear browser cache** — fresh load of the dashboard
4. **Have the CRE simulation ready** — do a dry run first, then record the real one
5. **Keep energy high** — judges watch hundreds of videos, yours needs to pop in the first 10 seconds
6. **Show real transactions** — the killer moment is seeing a real swap happen on-chain
7. **End with the savings number** — $625K saved is the memorable takeaway

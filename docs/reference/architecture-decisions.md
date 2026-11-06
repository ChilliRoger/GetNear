# Architecture Decisions

Key decisions made for Meridian FX and the reasoning behind each.

---

## 1. Two Chains: Base for Execution, Arc for Treasury

**Decision:** Swaps happen on Base mainnet. Treasury policy, audit trail, and approval queue live on Arc testnet.

**Why:**
- Uniswap has deep USDC/EURC liquidity on Base with low gas costs
- Arc is Circle's stablecoin-native L1 where USDC is the gas token -- natural home for a treasury
- Clean separation makes the Arc submission stronger: "chain-abstracted USDC app using Arc as a liquidity hub where multiple chains form one treasury surface"
- CRE orchestrates both chains from a single workflow

**Alternative considered:** Everything on Base. Rejected because it weakens the Arc bounty narrative and collapses the chain-abstraction story into a single-chain app.

---

## 2. Fynd Instead of Raw Uniswap API

**Decision:** Use Fynd (by Propeller Heads) as the DEX aggregation layer instead of calling Uniswap API directly.

**Why:**
- Uniswap booth recommended it at the hackathon
- Fynd aggregates Uniswap V3 + Aerodrome + PancakeSwap for better execution
- Still routes through Uniswap pools, so it strengthens (not weakens) the Uniswap submission
- Provides a local Docker container with simple REST API
- Eliminates the need for a Uniswap API key for quoting

**For swaps:** SwapExecutor.sol calls Uniswap V3 SwapRouter02 directly on-chain. Fynd is only used for off-chain quoting and price comparison.

---

## 3. Mock Tokens on Arc Only

**Decision:** MockUSDC and MockEURC are deployed only on Arc testnet. Base uses real tokens.

**Why:**
- Arc testnet does not have real EURC
- The demo needs to show balances on both chains
- Mock tokens have public `mint()` and `faucet()` for easy demo setup
- The display multiplier (x1M) makes small real amounts look like treasury-scale operations

---

## 4. Display Multiplier (x1,000,000)

**Decision:** All amounts shown in the UI are multiplied by 1,000,000.

**Why:**
- Real demo uses $1-10 of actual USDC (we are not putting $10M on-chain)
- $1 real displays as "$1,000,000" -- looks like a real treasury operation
- A single constant in shared/constants.ts controls the multiplier
- Judges see a treasury agent managing millions, not pocket change

**Rule:** The multiplier is ONLY in the display layer. Contracts, CRE workflow, and shared types always work with raw amounts. Never multiply at the contract or API level.

---

## 5. Simplified CRE Consumer Pattern

**Decision:** Use a simple `onlyCRE` modifier (`msg.sender == creForwarder`) instead of implementing the full `onReport()` pattern with verified report signatures.

**Why:**
- The full pattern requires KeystoneForwarder ABI integration, report encoding, and registration steps
- The simplified pattern is functionally equivalent for the hackathon -- it trusts a single address
- The security model difference (trusted address vs verified signature) is documented in the submission
- If Unknown 8 (CRE consumer pattern complexity) resolves easily, we can upgrade

**Trade-off:** Less secure in production. Acceptable for hackathon demo with controlled forwarder address.

---

## 6. Confidential HTTP for API Credentials

**Decision:** Use CRE's Confidential HTTP capability for Uniswap API calls so credentials stay private.

**Why:**
- CRE workflows run on decentralized oracle nodes
- Confidential HTTP ensures API keys (Uniswap, Fynd) are never exposed on-chain or in logs
- Qualifies for Chainlink Privacy Standard bounty ($1K per team, no submission slot required)

**Fallback:** If Confidential HTTP fails in simulation, use regular HTTP with a proxy server that holds the API key.

---

## 7. Oracle Server as Dev Tool (Not Production)

**Decision:** The oracle server (`apps/oracle/`) is a development and monitoring tool, not part of the submission-critical path.

**Why:**
- Original plan assumed CRE does all monitoring -- the oracle server emerged as a useful dev tool
- It validates that Chainlink and Fynd prices can be compared (core product thesis)
- The CRE workflow is the real decision-maker at submission time
- Keeping it as a dev tool means we do not need to harden or scale it

---

## 8. CRE Simulation-First Development

**Decision:** Develop and qualify for the Chainlink CRE bounty using `cre workflow simulate` with `--broadcast` for real on-chain writes. Live DON deployment is a stretch goal only.

**Why:**
- Chainlink booth confirmed at ETHGlobal Cannes that simulation qualifies for the bounty
- `--broadcast` flag enables real on-chain transaction writes during simulation, so we get real swap execution without DON deployment complexity
- This removes CRE deployment from the critical path entirely
- Chainlink team offered to deploy our workflow to the DON if simulation works (stretch goal)
- Faster iteration: simulate locally, test with real writes when ready, no DON setup overhead

**Alternative considered:** Full live DON deployment before submission. Rejected because it adds significant complexity (registration, funding, node operator coordination) with no bounty benefit. Chainlink explicitly said simulation is sufficient.

---

## 9. Arc Testnet (Not Mainnet)

**Decision:** Deploy TreasuryVault to Arc testnet (chain 5042002), not Arc mainnet.

**Why:**
- Arc mainnet accessibility was Unknown 3 -- testnet is confirmed available
- RPC: `rpc.testnet.arc.network`, Explorer: `testnet.arcscan.app`
- The demo is identical on testnet vs mainnet
- Weakens the "mainnet" claim slightly but does not affect functionality or prize eligibility

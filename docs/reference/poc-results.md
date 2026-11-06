# PoC Results -- Unknowns Register

Every assumption that was validated (or not) before and during the build. Each unknown has a severity rating, a verdict, and a fallback plan.

**Severity legend:**
- PROJECT-KILLER -- if this fails and fallback also fails, we cannot demo
- ARCHITECTURE-CHANGER -- if this fails, we switch approach but project survives
- NICE-TO-HAVE -- if this fails, we lose a feature but core demo works

---

## Unknown 1: Uniswap USDC/EURC Quotes on Base

**Severity:** PROJECT-KILLER
**Verdict:** CONFIRMED

Fynd (recommended by Uniswap booth) returns valid USDC/EURC quotes on Base mainnet. The oracle server has been recording quotes every 30 seconds since day 1. Real liquidity exists across Uniswap V3, Aerodrome, and PancakeSwap pools.

**Evidence:** Live Fynd quotes at `localhost:3000`, recorded to `apps/oracle/data/prices.db`.

---

## Unknown 2: CRE Simulation with Confidential HTTP + EVM Write

**Severity:** PROJECT-KILLER (for Chainlink bounty)
**Verdict:** CONFIRMED -- Chainlink booth says simulation qualifies for bounty

Chainlink booth at ETHGlobal Cannes confirmed:
- **Simulation is all they require** for the CRE bounty qualification
- `cre workflow simulate` runs workflows locally with real API calls and real blockchain reads
- The `--broadcast` flag during simulation enables real on-chain transaction writes
- Live DON deployment is a stretch goal, not required for the bounty
- Chainlink team offered to deploy our workflow to the DON network if simulation works

**Development approach:**
1. Build and iterate using `cre workflow simulate` (local, no real writes)
2. When ready for real execution, use `cre workflow simulate --broadcast` (writes real on-chain txs)
3. **(Stretch)** Live DON deployment with Chainlink team assistance

**Fallback:** The `--broadcast` flag removes the previous concern about EVM Write not working in simulation. If simulation itself fails entirely, fall back to Node.js cron script. Lose the Chainlink bounty ($2K) but the product works identically.

---

## Unknown 3: Arc Mainnet Accessible

**Severity:** ARCHITECTURE-CHANGER
**Verdict:** TESTNET ONLY

Arc testnet is confirmed: RPC at `rpc.testnet.arc.network`, chain ID 5042002, block explorer at `testnet.arcscan.app`. Arc mainnet was announced but the team is not at the booth and mainnet RPC/chain ID are not confirmed.

**Decision:** Use Arc testnet. Everything works the same. The "mainnet" claim weakens slightly but demo is identical.

---

## Unknown 4: CRE Supports Base AND Arc

**Severity:** ARCHITECTURE-CHANGER
**Verdict:** NOT YET TESTED

CRE docs have a supported networks page. Base is likely supported (major L2). Arc is uncertain (newer, smaller chain).

**What to test:**
1. Check `https://docs.chain.link/cre/supported-networks`
2. Confirm Base mainnet (8453)
3. Check if Arc (mainnet or testnet) is listed
4. Ask Chainlink booth: "Can CRE write to Arc?"

**Fallback:** If CRE cannot write to Arc directly, the CRE workflow outputs an HTTP response after the Base swap, and a simple relay endpoint picks it up and writes to Arc. CRE still orchestrates the core flow.

**Last resort:** Move TreasuryVault to Base alongside SwapExecutor. Lose the Arc chain-abstraction story but keep the product working.

---

## Unknown 5: World ID Backend Verify Format

**Severity:** ARCHITECTURE-CHANGER
**Verdict:** NOT YET TESTED

World docs confirm backend verification exists at `POST /api/v4/verify/{app_id}`. The exact request body format (fields, types, required vs optional) needs verification against actual docs. Our tech spec uses an illustrative format that may not match the real API.

**Known issues from review:**
- Spec uses `nullifier_hash` but current docs show `nullifier`
- `ApprovalSession` fields do not align with frontend POST payload
- `rpContext` is fetched but never used

**Fallback:** Skip World ID entirely and use CFO wallet signature only. Lose the "proof of human" narrative but the approval gate still works. This is the "CUT IF DESPERATE" item.

---

## Unknown 6: MiniKit walletAuth API Surface

**Severity:** NICE-TO-HAVE
**Verdict:** NOT YET TESTED

MiniKit 2.x removed `commandsAsync`. The current API is `MiniKit.walletAuth()` directly. Exact parameters and return values need verification against `https://docs.world.org/mini-apps`.

**Known issue:** Return shape is `{ executedWith, data }`, not `finalPayload.status` as in our spec.

**Fallback:** Use ethers.js BrowserProvider + getSigner for wallet connection. Skip MiniKit auth. Weakens the MiniKit story but does not break the product.

---

## Unknown 7: SwapExecutor Real Swap on Base

**Severity:** ARCHITECTURE-CHANGER
**Verdict:** NOT YET TESTED -- THIS IS THE MONEY TEST

This is the single most important test. SwapExecutor.sol must successfully call Uniswap V3 SwapRouter02 on Base mainnet with real USDC.

**What to test:**
1. Deploy SwapExecutor to Base mainnet
2. Fund it with $5 real USDC
3. Call executeSwap() with amountIn=1000000 ($1), amountOutMinimum=900000 (generous slippage)
4. Verify EURC received

**If it fails, check:**
- Pool fee (500 for stablecoins, try 100 or 3000)
- Router address correctness
- EURC pool existence on Base at this fee tier

**Fallback:** Try different fee tiers. If no USDC/EURC pool works, fall back to USDC/DAI or USDC/USDT and adjust the FX narrative.

---

## Unknown 8: CRE Consumer Contract Pattern

**Severity:** NICE-TO-HAVE
**Verdict:** USING SIMPLIFIED PATTERN

CRE docs describe the full KeystoneForwarder -> onReport() pattern. Implementation complexity was unclear. We chose the simplified `onlyCRE` modifier (check forwarder address) which is functionally equivalent for the hackathon.

**Decision:** Simplified pattern is acceptable. The security model difference (trusted address vs verified report signature) is documented in submission.

**If time permits:** Read the CRE consumer contract template and upgrade to the full pattern. See `https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts`.

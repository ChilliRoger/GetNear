# Sponsor Feedback — ETHGlobal Cannes 2026

 / GetNear — Autonomous Treasury FX Agent

We built a multi-sponsor integration (Chainlink CRE + Uniswap V3 + Arc + World ID + Unlink) and want to share honest developer feedback for each sponsor's tools. We hope this helps improve the hackathon experience for future builders.

---

## Unlink

**What we built:** Private treasury swaps — hide sender identity when executing FX conversions on Uniswap via Unlink's privacy pool.

### Issues Encountered

1. **SDK API surface doesn't match documentation.** The docs reference `unlink.faucet.requestTestTokens()` and `unlink.faucet.requestPrivateTokens()` — neither exists in the published SDK (`@unlink-xyz/sdk@0.0.2-canary.0`). We had to reverse-engineer the SDK source (`dist/index.js`) to discover the actual API.

2. **`execute()` not implemented.** The headline DeFi feature — calling external contracts (like Uniswap) through the privacy pool — is documented but not present in the canary build. This is the core value proposition for the DeFi bounty track. We had to fall back to `withdraw()` + `deposit()` patterns instead.

3. **`unlinkEvm.fromViem()` requires `publicClient` but docs only show `walletClient`.** Without `publicClient`, `ensureErc20Approval()` throws `UnlinkCapabilityError` because `getErc20Allowance()` needs read access. This took significant debugging to discover.

4. **`TransactionResult` shape undocumented.** Our code assumed `.txHash` / `.hash` but the actual field is `.txId`. Had to read SDK source to find this.

5. **Mnemonic validation uses `@scure/bip39@2.x`.** If your project has `@scure/bip39@1.x` elsewhere in the dependency tree, generating a mnemonic with v1 that validates with v2 silently fails. No error message explains the version mismatch.

6. **No way to get test tokens without gas.** The faucet methods don't exist (see #1), and `deposit()` requires an ERC-20 approval transaction which needs Base Sepolia ETH. There's no gasless onboarding path for hackathon participants.

### What Worked Well
- `createUnlink()` client creation is clean and simple once you have the right params
- `getBalances()` and `ensureRegistered()` work as expected
- The `pollTransactionStatus()` pattern is well-designed for async confirmation
- The privacy model (sender hidden, amounts visible) is genuinely useful for corporate treasury use cases

### Suggestions
- Publish SDK with all documented methods before the hackathon
- Add a working quickstart that can be copy-pasted and run in < 5 minutes
- Provide a gasless faucet or airdrop Base Sepolia ETH to registered hackathon wallets
- Add TypeScript type exports so developers can inspect the API without reading dist/index.js

---

## Chainlink CRE (Compute Runtime Environment)

**What we built:** Oracle-driven swap execution — CRE reads strategy decisions from our Oracle server, executes Uniswap swaps, withdraws to treasury, and logs to Arc.

### Issues Encountered

1. **CRE does NOT resolve `${VAR}` environment variables in `config.json`.** Only `workflow.yaml` supports variable substitution. We spent time debugging why our Uniswap API key wasn't being picked up. Had to temporarily hardcode the key for simulation, then restore the placeholder.

2. **`consensus` aggregation with `median` doesn't work with optional fields.** When some fields in the response are `undefined`, the median aggregation throws. Had to use `as any` casts to work around TypeScript strictness in the consensus step.

3. **Limited documentation on `EVMClient` write patterns.** The `runtime.report()` → `prepareReportRequest()` → `evmClient.writeReport()` chain for on-chain writes isn't intuitive. More examples of multi-step EVM write workflows would help.

4. **WASM compilation is slow (~30s).** For rapid iteration during a hackathon, this friction adds up. A watch mode or incremental compilation would be valuable.

5. **`--broadcast` simulation mode is the key for the bounty but it's not prominently documented.** We almost missed that simulation with `--broadcast` qualifies for the bounty.

6. **`callContract` (EVM reads) returns zero/stub data in `--broadcast` mode.** Only `sendTransaction` (EVM writes) actually hits the live chain. This means you cannot read on-chain balances, allowances, or any contract state before deciding whether to execute a write. We had a balance check (`if usdcBalance < chunkAmount`) that always failed because `callContract` returned 0 for the SwapExecutor's USDC balance, even though $5 USDC was on-chain. We had to comment out the balance check entirely. This is a significant limitation — any workflow that needs to read state before writing (which is most DeFi workflows) cannot do pre-flight validation in `--broadcast` simulation mode.

### What Worked Well
- The `HTTPClient` + `EVMClient` capability model is elegant
- Workflow compilation to WASM is impressive — truly portable execution
- The `flock` guard pattern for preventing overlapping ticks works perfectly
- CRE as "dumb hands" that follows an Oracle brain is a powerful architecture pattern

### Suggestions
- Support `${ENV_VAR}` in config.json (or document clearly that it's not supported)
- Add a "hackathon quickstart" showing the minimum viable CRE workflow
- Provide more examples of multi-contract, multi-chain workflows
- Add a watch/dev mode for faster iteration

---

## Uniswap

**What we built:** FX swap execution on Base mainnet via Uniswap V3, with real-time price quoting from the Trade API.

### Issues Encountered

1. **Trade API rate limits aren't documented.** We poll every 30 seconds and haven't hit limits, but we don't know what the ceiling is. For production use we'd need this information.

2. **No Uniswap V3 deployment on Base Sepolia with real liquidity.** For the Unlink privacy track (which requires Base Sepolia), we couldn't find a USDC/EURC pool. This forced us to demo privacy without actual DEX execution.

3. **`exactInputSingle` fee tier discovery.** We had to experiment to find that the USDC/EURC pair uses the 500 (0.05%) fee tier on Base. A fee tier lookup API or documentation of major pair fee tiers would help.

4. **Trade API completely unsupported on Base Sepolia.** We verified this experimentally: even canonical pairs (WETH/USDC) return "No quotes available" (HTTP 404) on chain 84532. The `check_approval` endpoint recognizes the chain, but the routing engine has zero indexed pools. Ethereum Sepolia (11155111) IS supported and returns quotes. This means any hackathon project combining Uniswap with a Base Sepolia-only sponsor (like Unlink) cannot use the Trade API for price discovery on testnet.

5. **Custom/non-canonical tokens return the same generic error as unsupported chains.** "No quotes available" (404) is returned for both "token not recognized" and "no liquidity pool exists" — there's no way to distinguish between the two failure modes. This makes debugging difficult.

### What Worked Well
- The Trade API is fast and reliable — our 30s polling has been 100% uptime during development
- V3 SwapRouter on Base works flawlessly
- The USDC/EURC 0.05% pool has excellent liquidity for our use case
- Using Uniswap as both price source AND execution venue creates a clean architecture

### Suggestions
- Document rate limits for the Trade API
- Index Base Sepolia pools in the routing engine (or document which testnets are supported)
- Differentiate error responses: "token not found" vs "no liquidity" vs "chain not indexed"
- A "supported pairs + fee tiers" reference page would save developers time
- Consider a "hackathon mode" endpoint that returns mock quotes on unsupported testnets

---

## Fynd

**What we built:** DEX aggregation pricing — Fynd quotes used as a cross-check against Chainlink and Uniswap for divergence detection.

### Issues Encountered

1. **Fynd Telegram bot does not accept ENS names.** Only raw Ethereum addresses (0x...) are accepted. Supporting ENS resolution would improve UX significantly — many users know their ENS name but not their hex address.

### What Worked Well
- Quote API is fast and returns detailed routing information
- Good coverage of Base mainnet pools
- Solver-based architecture provides competitive quotes

### Suggestions
- Support ENS name resolution in the Telegram bot
- Add a REST API alongside the Telegram interface for programmatic access

---

## Arc

**What we built:** TreasuryVault smart contract on Arc testnet for policy management, trade approval thresholds, and audit logging.

### Issues Encountered

1. **No built-in `viem` chain definition for Arc testnet (chain ID 5042002).** We had to define a custom chain object manually. This is expected for a new chain but worth noting.

2. **ArcScan explorer was sometimes slow to index new contracts.** After deploying TreasuryVault, verification took several minutes to appear.

3. **USDC as native currency is a novel pattern.** Our code initially assumed ETH for gas, but Arc uses USDC. This required adjusting our mental model and gas estimation.

### What Worked Well
- Deployment via Foundry worked on the first try
- ArcScan contract verification is clean and well-integrated
- The USDC-native gas model is actually great for our treasury use case — no need to hold ETH
- Cross-chain architecture (Arc for state, Base for execution) makes sense for real-world treasury apps

### Suggestions
- Publish a viem chain definition in a package (e.g., `@arc/chains`)
- Add Arc testnet to popular chain lists (chainlist.org, etc.)
- More documentation on cross-chain messaging patterns between Arc and other L2s

---

## World ID (Worldcoin)

**What we built:** Human verification for large trade approvals — World ID gate before executing trades above the policy threshold.

### Issues Encountered

1. **Multiple environment setup in the World ID developer portal is confusing.** We couldn't figure out how to configure staging vs production environments for the same app. Ended up using a single environment.

2. **The verification API endpoint naming changed.** Some docs reference `/api/v1/verify` while the current endpoint is `/api/v2/verify/{app_id}`. We hit a 404 before finding the right URL.

### What Worked Well
- IDKit widget integration is clean and straightforward
- The backend verification API is simple and well-documented
- Demo mode (simulated verification) was invaluable for development
- The "verified human" UX adds genuine trust to the approval flow

### Suggestions
- Simplify the multi-environment setup in the developer portal
- Ensure all documentation references the current API version
- Consider a "hackathon mode" that auto-approves without requiring a real World ID (similar to our demo mode implementation)

---

## General Hackathon Feedback

1. **Multi-sponsor integration is the most rewarding but also the most time-consuming path.** We integrated 5 sponsors and each integration had its own learning curve. A "compatibility matrix" showing which sponsors play well together would help teams plan.

2. **Testnet fragmentation is painful.** Unlink requires Base Sepolia, our main app runs on Base mainnet, Arc has its own testnet. Managing 3 chains with different tokens, faucets, and explorers is significant overhead.

3. **SDK version mismatches between sponsors are common.** Different sponsors pin different versions of `viem`, `ethers`, etc. Dependency resolution in a monorepo with 5+ sponsor SDKs requires careful management.

---

*Generated during ETHGlobal Cannes 2026 by  (GetNear). We're happy to discuss any of these points in detail.*

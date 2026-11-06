# contracts -- Foundry Project

Solidity smart contracts for Meridian FX. Two chains, four contracts.

## Tech Stack

- Solidity 0.8.20
- Foundry (forge, cast, anvil) — installed at `~/.foundry/bin/forge` (NOT in default PATH)
  - To use: `export PATH="$HOME/.foundry/bin:$PATH"` or call directly: `~/.foundry/bin/forge`
  - Version: 1.5.1-stable
  - Install/update: `foundryup`
- OpenZeppelin Contracts v5 (installed via `forge install`)
- Remappings: `@openzeppelin/contracts/` -> `lib/openzeppelin-contracts/contracts/`

## Contracts

### SwapExecutor.sol (Base mainnet)
CRE consumer contract that executes real USDC/EURC swaps via Uniswap V3.
- Receives CRE reports via `onlyCRE` modifier (checks `msg.sender == creForwarder`)
- Calls `exactInputSingle` on Uniswap V3 SwapRouter02
- Uses `forceApprove` (requires OZ v5) for router allowance
- Pool fee: 500 (0.05% stablecoin tier)
- MIN_TRADE_AMOUNT: 1e6 ($1 real USDC)
- Emits `SwapExecuted` events for indexing

### TreasuryVault.sol (Arc testnet)
Policy engine, audit trail, and approval gate.
- Manages treasury policy (auto-execute threshold, target rate band)
- CFO whitelist (`isCFO` mapping)
- Pending trade queue with statuses: PENDING -> APPROVED/REJECTED -> EXECUTED
- `logExecution()` with idempotency guard (prevents double-logging on retry)
- All amounts in raw 6-decimal units; rates in 18-decimal (ether) units
- MIN_TRADE_AMOUNT: 1e6 (must match SwapExecutor)

### MockUSDC.sol / MockEURC.sol (Arc testnet ONLY)
Test ERC-20 tokens with 6 decimals.
- Public `mint(address, uint256)` for arbitrary amounts
- `faucet()` mints 500K tokens to caller
- NEVER deploy these to Base mainnet

## Rules

### 1. CRE consumer pattern is simplified
Both contracts use `modifier onlyCRE() { require(msg.sender == creForwarder, "Not CRE"); }`. This is a simplified pattern that trusts the forwarder address rather than verifying report signatures. Acceptable for hackathon. Document this in submission as a known simplification.

### 2. Deploy scripts use env vars
All deploy scripts read from environment variables:
- `PRIVATE_KEY` -- deployer wallet private key
- `CRE_FORWARDER` -- Chainlink CRE KeystoneForwarder address
- `UNISWAP_ROUTER` -- Uniswap V3 SwapRouter02 (Base only)
- `USDC_ADDRESS` / `EURC_ADDRESS` -- token addresses (Base only)

Never hardcode addresses or keys in scripts.

### 3. TradeStatus enum is canonical
```solidity
enum TradeStatus { PENDING, APPROVED, EXECUTED, REJECTED }
```
This MUST match `packages/shared/src/types.ts`. If you change it here, update TypeScript in the same commit.

### 4. Test directory is empty -- tests needed
The `test/` directory has no tests yet. When adding tests:
- Use Foundry's `forge-std/Test.sol`
- Test against a forked Base mainnet for SwapExecutor (real Uniswap pools)
- Test TreasuryVault with mock CRE forwarder address

### 5. Optimizer is on
`foundry.toml` enables optimizer with 200 runs. Do not disable -- gas cost matters for Base mainnet deployment.

## Commands

```bash
forge build                    # compile all
forge test                     # run tests
forge fmt                      # format Solidity
forge script script/DeploySwapExecutor.s.sol --rpc-url $BASE_RPC --broadcast
forge script script/DeployTreasuryVault.s.sol --rpc-url $ARC_RPC --broadcast
forge script script/DeployMockTokens.s.sol --rpc-url $ARC_RPC --broadcast
```

## Key Addresses (for deploy verification)

| What | Address | Chain |
|------|---------|-------|
| Uniswap V3 SwapRouter02 | `0x2626664c2603336E57B271c5C0b26F421741e481` | Base |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Base |
| EURC | `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42` | Base |
| Arc predeployed USDC | `0x3600000000000000000000000000000000000000` | Arc testnet |

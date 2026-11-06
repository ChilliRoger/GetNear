# Adapter Interfaces

The adapter pattern is how Meridian handles risky external dependencies. Every integration with an uncertain API, SDK, or chain uses this pattern so primary and fallback implementations can be swapped with zero consuming-code changes.

---

## The Pattern

```
Consumer track ──> IServiceAdapter <── Primary implementation
                                   <── Fallback implementation
                                   <── Stub (for dev/mock)
```

### TypeScript template:

```typescript
// 1. THE CONTRACT between tracks
interface IServiceAdapter {
  doThing(input: InputType): Promise<OutputType>
}

// 2. Factory picks implementation from env
function createServiceAdapter(): IServiceAdapter {
  if (process.env.USE_PRIMARY === 'true') return new PrimaryImpl()
  return new FallbackImpl()
}

// 3. Stub for development -- returns realistic mock data
class StubImpl implements IServiceAdapter {
  async doThing(input: InputType): Promise<OutputType> {
    return { /* realistic mock */ verificationMethod: 'stub' }
  }
}
```

### Solidity template:

For contracts, the adapter pattern maps to constructor injection:
```solidity
constructor(address _serviceAddress) {
    serviceAddress = _serviceAddress;
}
```
Swap the address at deploy time to switch implementations.

---

## Where Boundaries Exist in Meridian

### 1. Quote Source: Fynd vs Uniswap API

**Primary:** Fynd Docker container (localhost:3000) -- aggregates multiple DEXes.
**Fallback:** Direct Uniswap Trading API (https://trade-api.gateway.uniswap.org).
**When to switch:** If Fynd container fails or quotes are stale.
**Switch mechanism:** `QUOTE_SOURCE=fynd|uniswap` env var.

### 2. CRE Workflow vs Node.js Cron

**Primary:** Chainlink CRE workflow -- decentralized, Confidential HTTP, EVM Read/Write.
**Fallback:** Node.js cron script -- centralized but functionally identical.
**When to switch:** If CRE simulation fails after 45 minutes of debugging.
**Switch mechanism:** The CRE workflow TypeScript translates almost 1:1 to a Node.js script. The decision logic, rate checking, and swap execution are the same code.
**Cost of switching:** Lose Chainlink bounty ($2K). Product works identically.

### 3. Arc Treasury vs Base-Only

**Primary:** TreasuryVault on Arc testnet -- policy engine, audit trail on stablecoin L1.
**Fallback:** TreasuryVault deployed on Base alongside SwapExecutor.
**When to switch:** If Arc testnet is unreachable or CRE cannot write to Arc.
**Switch mechanism:** Deploy same contract to Base instead. Change RPC URL in deploy script.
**Cost of switching:** Lose Arc bounty and chain-abstraction narrative.

### 4. World ID Verification vs Wallet Signature

**Primary:** World ID proof via IDKit + backend verification at `/api/v4/verify`.
**Fallback:** CFO wallet signature only (ethers.js signMessage).
**When to switch:** If World ID backend verification is too complex or unreliable.
**Switch mechanism:** `APPROVAL_METHOD=worldid|wallet` env var.
**Cost of switching:** Lose "proof of human" narrative. Approval gate still works.

### 5. CRE Consumer: Full Pattern vs Simplified

**Primary (if time):** KeystoneForwarder -> onReport() with verified report signatures.
**Current:** Simplified `onlyCRE` modifier (msg.sender == creForwarder).
**When to upgrade:** If Unknown 8 resolves easily and there is spare time.
**Switch mechanism:** Replace the `onlyCRE` modifier implementation in contracts.

---

## Rules for Adding New Adapters

1. Define the interface in `@meridian/shared` if both TypeScript tracks use it
2. Define it locally if only one track uses it
3. Always create a stub that returns realistic mock data
4. The stub must match the primary implementation's output shape exactly
5. Factory functions live in the consuming package, not in shared
6. Document the env var, switch cost, and trigger condition in this file

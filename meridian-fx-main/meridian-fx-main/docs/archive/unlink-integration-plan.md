# Unlink Integration Plan — Bonus Privacy Track

**Goal:** Add Unlink as a bonus bounty track ($1K "Best Private DeFi Integration") alongside existing Uniswap + Chainlink + Arc submissions. Minimal changes to core architecture.

## What Changes

```
CURRENT FLOW:
  User → Frontend → Oracle → CRE → SwapExecutor (Base mainnet) → Uniswap V3

ENHANCED FLOW (with Unlink):
  User → Frontend → Oracle → CRE → Unlink SDK → SwapExecutor (Base Sepolia) → Uniswap V3
                                      ↑
                                  Privacy layer:
                                  sender identity hidden
                                  from on-chain observers
```

## Architecture: What's Added

**New:** Unlink SDK wraps the swap execution so the treasury's identity is hidden when interacting with Uniswap. The Oracle still decides WHEN and HOW MUCH to swap. CRE still orchestrates. But the actual on-chain execution goes through Unlink's privacy pool.

**Two execution modes:**
- **Normal mode** (Base mainnet): Current flow, no privacy. Real USDC/EURC.
- **Private mode** (Base Sepolia): Swap through Unlink, sender hidden. Testnet tokens.

Both modes use the same Oracle strategy engine and frontend.

## Integration Steps

### Step 1: Get Unlink API Key (2 min)
- Go to https://hackathon-apikey.vercel.app
- Enter team name "Ippo"
- Save API key to .env as UNLINK_API_KEY

### Step 2: Install SDK (5 min)
```bash
cd apps/app && pnpm add @unlink-xyz/sdk
```

### Step 3: Create Unlink Service Module (30 min)
New file: `apps/oracle/src/unlink.ts`

```typescript
import { createUnlink, unlinkAccount, unlinkEvm } from "@unlink-xyz/sdk";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

export function createUnlinkClient() {
  const walletClient = createWalletClient({
    account: privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`),
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC),
  });

  return createUnlink({
    engineUrl: "https://staging-api.unlink.xyz",
    apiKey: process.env.UNLINK_API_KEY!,
    account: unlinkAccount.fromMnemonic({ mnemonic: process.env.UNLINK_MNEMONIC! }),
    evm: unlinkEvm.fromViem({ walletClient }),
  });
}
```

### Step 4: Add Private Swap Endpoint to Oracle (1 hour)
New endpoint: `POST /api/trades/:id/execute-private`

Flow:
1. Read trade order from DB
2. Deposit USDC into Unlink privacy pool: `unlink.deposit({ token: USDC, amount })`
3. Execute swap through Unlink: `unlink.execute({ calls: [uniswapSwapCall], ... })`
4. Withdraw output EURC: `unlink.withdraw({ recipientEvmAddress: treasury, token: EURC, amount })`
5. Update trade order status

### Step 5: Frontend Toggle (30 min)
Add "Private Mode" toggle to the trade form:
- Normal: submits to existing `/api/trades` flow (Base mainnet)
- Private: submits to `/api/trades` with `private: true` flag, Oracle uses Unlink path

Visual: small shield icon + "Private" badge when enabled.

### Step 6: Demo Transaction (15 min)
Execute one private swap on Base Sepolia to satisfy the bounty requirement:
"Working demo with at least one successful private transaction"

## What Does NOT Change

- Oracle strategy engine (same timing scores, same chunk sizing)
- CRE workflow (still orchestrates — Unlink is called from the Oracle, not CRE directly)
- TreasuryVault on Arc (audit logging stays the same)
- Dashboard, settings, approve pages (unchanged)
- Existing Base mainnet swap path (preserved as default)

## Environment Variables Needed

```
UNLINK_API_KEY=<from hackathon-apikey.vercel.app>
UNLINK_MNEMONIC=<generate new 12-word mnemonic for Unlink account>
BASE_SEPOLIA_RPC=https://base-sepolia.g.alchemy.com/v2/<key>
```

## Bounty Requirements Checklist

- [ ] Use @unlink/sdk npm package
- [ ] Working demo on Base Sepolia with at least one successful private transaction
- [ ] Public GitHub repo with README explaining why privacy matters for treasury FX
- [ ] Demo video, max 3 minutes (can be part of main video)

## Privacy Narrative for README

"Corporate treasuries executing FX conversions on public blockchains expose their trading strategy to MEV bots, competitors, and front-runners. Unlink's privacy layer hides the treasury's identity when executing Uniswap swaps — the trade happens on-chain, but nobody can link it back to the treasury wallet. This is selective transparency: the amounts and target DEX are visible (for compliance), but the originating account is private."

## Time Estimate

| Task | Time |
|------|------|
| API key + SDK install | 10 min |
| Unlink service module | 30 min |
| Oracle private swap endpoint | 1 hour |
| Frontend toggle | 30 min |
| Demo transaction | 15 min |
| README section | 15 min |
| **Total** | **~2.5 hours** |

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Unlink SDK issues on Base Sepolia | Can't demo | Fall back to normal mode, drop Unlink track |
| Need testnet USDC on Base Sepolia | No tokens to swap | Use Base Sepolia faucet or deploy mock tokens |
| Unlink execute() with Uniswap fails | No private swap | Use BurnerWallet pattern as fallback |
| Time pressure | Can't finish | Unlink is additive — if we run out of time, existing submission is unaffected |

## Priority

LOW — this is a bonus $1K track. Only pursue after Phase 2A is solid and the main submission (Uniswap $10K + Chainlink $7K + Arc $15K) is locked in. Estimated start: after Phase 2A safety gate passes.

# Unlink.xyz Research — ETHGlobal Cannes 2026

## What Is Unlink

Privacy-as-a-service for EVM blockchains. NOT a chain — it's a smart contract + SDK deployed on existing EVM chains. Wraps ZK proofs behind a simple TypeScript SDK so devs can add private transfers/swaps in ~5 lines of code.

Currently deployed on **Base Sepolia testnet** (chain 84532).

## Core SDK

Package: `@unlink-xyz/sdk`

```ts
import { createUnlink, unlinkAccount, unlinkEvm } from "@unlink-xyz/sdk";

const unlink = createUnlink({
  engineUrl: "https://staging-api.unlink.xyz",
  apiKey: process.env.UNLINK_API_KEY,
  account: unlinkAccount.fromMnemonic({ mnemonic }),
  evm: unlinkEvm.fromViem({ walletClient }),
});
```

**Four core operations:**
- `deposit({ token, amount })` — move ERC-20 into privacy pool (amounts public)
- `transfer({ recipientAddress, token, amount })` — fully private transfer
- `withdraw({ recipientEvmAddress, token, amount })` — exit pool (amounts public)
- `execute({ withdrawals, calls, outputs, deadline })` — call external contracts (sender hidden, amounts visible)

## Privacy Model

| Operation | Amounts | Sender | Recipient | Token |
|-----------|---------|--------|-----------|-------|
| Deposit | Public | Public | Private | Public |
| Transfer | Private | Private | Private | Private |
| Withdraw | Public | Private | Public | Public |
| Execute | Public | **Private** | Public | Public |

Key: `execute()` hides WHO is making the swap, not HOW MUCH. Good for hiding treasury strategy from MEV bots.

## ETHGlobal Cannes Bounty

**$5,000 total, three tracks:**
- Best Private Application: $3,000 (consumer payments)
- Most Creative Privacy Use Case: $1,000 (novel ideas)
- **Best Private DeFi Integration: $1,000** (swaps, lending, yield) ← OUR TARGET

**Requirements:**
1. Use `@unlink/sdk` npm package
2. Working demo on Base Sepolia with at least one successful private transaction
3. Public GitHub repo with README explaining why privacy matters
4. Demo video, max 3 minutes

## Hackathon Integration

API keys: self-service at https://hackathon-apikey.vercel.app (just enter team name)
Pool contract (Base Sepolia): `0x647f9b99af97e4b79DD9Dd6de3b583236352f482`

## How It Fits Our Treasury FX System

1. Treasury deposits USDC into Unlink privacy pool
2. Use `execute()` to call Uniswap V3 router — swap happens but treasury address is hidden
3. Withdraw output tokens back to treasury

**OR use BurnerWallet pattern:** Create temp EOA from private pool, do full DeFi interaction, sweep back. Compatible with any EVM protocol.

**CRE compatibility:** SDK is TypeScript — can be called from CRE workflow or server-side automation.

## Docs

- Main: https://www.unlink.xyz/
- Docs: https://docs.unlink.xyz
- LLM index: https://docs.unlink.xyz/llms.txt
- Quickstart: https://docs.unlink.xyz/quickstart
- DeFi guide: https://docs.unlink.xyz/defi
- Execute ref: https://docs.unlink.xyz/execute
- API key: https://hackathon-apikey.vercel.app

## Strategic Assessment

**Recommend as COMPLEMENTARY, not a full Arc replacement:**
- Unlink $1K DeFi track + Chainlink $7K + Uniswap $10K = multi-sponsor eligible
- Narrative: "Private treasury FX — hide your strategy from MEV bots and competitors"
- Base Sepolia requirement means we'd need testnet infrastructure (but we already have Base mainnet working)
- Arc still stronger for the "chain-abstracted USDC" narrative ($15K pool vs $1K)
- Best play: keep Arc, ADD Unlink as bonus track

# NEAR Testnet Stablecoin Faucet — Vercel Deployment Guide

This document describes how to deploy the standalone **NEAR Testnet Stablecoin Faucet** (`apps/faucet`) to Vercel in under 2 minutes.

---

## 1. Architecture & Multi-Layer Security

The faucet operates as a hardened serverless Web3 application with 6 security defense layers:
- **Zero Native Binaries**: Uses pure `near-api-js` v7 with `KeyPairSigner` to sign transactions strictly in memory.
- **Sybil & Storage Drain Defense**: Queries on-chain RPC `view_account` to verify the recipient account ID actually exists on NEAR testnet before executing any storage deposit. Non-existent accounts are rejected immediately without spending operator NEAR.
- **Serverless Anti-Hoarding Balance Cap**: On-chain token balance check caps faucet claims if a wallet already holds $\ge 2,500$ USDC or EURe. Because this reads live blockchain state, it cannot be bypassed by multi-instance or multi-region serverless concurrency.
- **Fixed Non-Tamperable Quota**: Hardcoded 500 token claim per token type, completely preventing payload manipulation attacks via HTTP body parameters.
- **Operator Gas Safety Margin**: Halts dispensing gracefully with HTTP 503 if operator NEAR drops below 0.05 NEAR, preventing broken partial states.
- **Rate Limiting & Proxy Extraction**: 10-minute sliding window cooldown tracking both account ID and real client IP (`x-real-ip` and `x-forwarded-for`).
- **HTTP Security Headers**: Enforces `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and strict referrer policy in `vercel.json`.
- **Zero Secret Leakage**: Operator private keys are never prefixed with `NEXT_PUBLIC_` and never bundled into client assets. All `.env` files are ignored by git.

---

## 2. Step-by-Step Vercel Deployment

### Step 1: Create a New Project on Vercel
1. Go to [vercel.com/new](https://vercel.com/new).
2. Connect your GitHub account and select repository: **`ChilliRoger/GetNear`**.

### Step 2: Configure Project Settings
In the Vercel project configuration screen:
- **Project Name**: `getnear-faucet` (or your preferred subdomain)
- **Framework Preset**: `Next.js`
- **Root Directory**: Click `Edit` and select **`apps/faucet`**
- **Build Command**: `next build` (default)
- **Output Directory**: `.next` (default)
- **Install Command**: `pnpm install` (default)

### Step 3: Add Environment Variables
Expand the **Environment Variables** section and configure:

| Variable Name | Example Value | Description |
| :--- | :--- | :--- |
| `OPERATOR_ACCOUNT_ID` | `chilliroger-operator.testnet` | The faucet operator account ID |
| `OPERATOR_PRIVATE_KEY` | `ed25519:YOUR_SECRET_KEY` | Private key used to sign `storage_deposit` and `mint` |
| `USDC_CONTRACT_ID` | `usdc.chilliroger-operator.testnet` | Deployed NEP-141 USDC contract |
| `EURE_CONTRACT_ID` | `eure.chilliroger-operator.testnet` | Deployed NEP-141 EURe contract |
| `NEAR_NETWORK_ID` | `testnet` | Network identifier |
| `NEAR_RPC_URL` | `https://rpc.testnet.near.org` | Primary JSON-RPC endpoint |

> [!NOTE]
> To retrieve your `OPERATOR_PRIVATE_KEY`, open your local credentials file at `~/.near-credentials/testnet/chilliroger-operator.testnet.json`. Copy the `private_key` field (e.g. `ed25519:...`).

### Step 4: Click Deploy
Click **Deploy**. Vercel will build and launch your production faucet in ~45 seconds.

---

## 3. Verifying the Deployment

Once deployed:
1. Open your live deployment URL (e.g. `https://getnear-faucet.vercel.app`).
2. Verify the top right pill displays: `RPC: Healthy`.
3. Open the **How to Use & Wallet Setup** guide modal to verify copy buttons and custom token import instructions.
4. Enter any NEAR testnet address (e.g., `alice.testnet`) and click **Dispense 1,000 Testnet Tokens**.
5. Check the returned on-chain transaction receipt links on [NEARBlocks Testnet Explorer](https://testnet.nearblocks.io).

---

## 4. Local Development

To run the faucet locally on port 3200:

```bash
pnpm --filter @getnear/faucet dev
```

Open [http://localhost:3200](http://localhost:3200) in your browser.

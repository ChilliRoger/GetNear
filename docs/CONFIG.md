# GetNear — Configuration Guide

This document describes all environment variables used across GetNear packages (`@getnear/shared`, `@getnear/oracle`, `@getnear/app`, and `apps/agent`).

Configuration is loaded and validated using a typed Zod schema defined in `packages/shared/src/config.ts`.
Any invalid variable causes the process to fail immediately on boot.

---

## Environment Variables

| Variable | Required | Default | Allowed Values | Description |
|---|---|---|---|---|
| `NEAR_NETWORK_ID` | **Yes** | `testnet` | `testnet` (ONLY) | NEAR network ID. Fails fast if anything else is provided. GetNear is **testnet only**. |
| `NEAR_RPC_URLS` | **Yes** | `https://rpc.testnet.near.org,https://test.rpc.fastnear.com` | Comma-separated HTTPS URLs | Ordered list of JSON-RPC endpoints. Client fails over automatically if primary is unresponsive. |
| `NEAR_EXPLORER_BASE` | No | `https://testnet.nearblocks.io` | HTTPS URL | Base URL used to generate clickable transaction and account links. |
| `ONECLICK_BASE_URL` | No | `https://1click.chaindefuser.com` | HTTPS URL | 1Click quote endpoint. Mainnet read-only; only `dry: true` quotes are called. |
| `ONECLICK_JWT` | No | *(none)* | String | Optional partner JWT for 1Click. Dry quotes work without authentication. |
| `FX_BUDGET_CONTRACT_ID`| P7+ | `""` | Valid NEAR account ID | Account where `FxBudget` contract is deployed (e.g. `fx-budget.prefix.testnet`). |
| `DAO_ACCOUNT_ID` | P8+ | `""` | Valid NEAR account ID | Sputnik DAO v2 account owning the budget contract (e.g. `getnear-dao.sputnik-v2.testnet`). |
| `AGENT_ACCOUNT_ID` | P8+ | `""` | Valid NEAR account ID | NEAR testnet account used by the autonomous agent runner. |
| `AGENT_PRIVATE_KEY` | P9+ | *(none)* | `ed25519:...` | **Restricted function-call key** authorizing only `execute_chunk`. **NEVER commit or log this key**. |
| `GETNEAR_MODE` | No | `mock` | `mock`, `testnet` | `mock`: runs with simulated quotes and in-memory state. `testnet`: connects to testnet RPC and live contracts. |
| `DEMO_MODE` | No | `false` | `true`, `false`, `1`, `0` | Enables demo timing (10-minute order horizon, 20s tick interval) and pre-seeded demo orders. |
| `NEAR_AI_API_KEY` | P11 | *(none)* | String | Optional NEAR AI Cloud API key for natural language order intake. |

---

## Setup Instructions

1. Copy `.env.example` to `.env` at repo root:
   ```bash
   cp .env.example .env
   ```

2. Fill in account and contract IDs once deployed in blocks P7/P8.

3. For local development / mock mode, the defaults in `.env.example` work out-of-the-box:
   ```bash
   pnpm dev
   ```

---

## Security Invariants

1. **Testnet Only**: `loadConfig()` asserts `NEAR_NETWORK_ID === 'testnet'`. Setting `mainnet` throws an uncatchable boot error.
2. **Secret Masking**: `configSummary()` masks `AGENT_PRIVATE_KEY` and `NEAR_AI_API_KEY`. Raw key values are never returned to logs or API responses.
3. **Restricted Key Scope**: When configured, `AGENT_PRIVATE_KEY` must only be a function-call access key scoped to receiver `FX_BUDGET_CONTRACT_ID` and method `execute_chunk`. It must never be a full-access key.


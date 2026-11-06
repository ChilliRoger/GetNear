---
name: near-testnet
description: How to interact with NEAR testnet in this project — RPC calls, account checks, contract views, testnet faucet, explorer links.
---

# NEAR Testnet Skill

## Network

- Network ID: `testnet` (always; fail fast if not)
- Primary RPC: `https://rpc.testnet.near.org`
- Fallback RPC: `https://test.rpc.fastnear.com`
- Explorer: `https://testnet.nearblocks.io/`
- Faucet: `https://docs.near.org/getting-started/faucet`

## Explorer Link Patterns

- Transaction: `https://testnet.nearblocks.io/txns/{HASH}`
- Account: `https://testnet.nearblocks.io/address/{ACCOUNT_ID}`

## RPC Usage

Always use `packages/near-client` (written in P4) for all RPC calls. Never call the RPC directly in app code.

## Accounts

Configured via env vars (see `docs/CONFIG.md`):
- `NEAR_AGENT_ACCOUNT_ID` — the agent account
- `NEAR_OPERATOR_ACCOUNT_ID` — the requester
- `NEAR_DAO_ACCOUNT_ID` — the Sputnik DAO
- `FX_BUDGET_CONTRACT_ID` — the FxBudget contract

## Security

Never ask for or print private keys. Always reference env var names (`AGENT_PRIVATE_KEY`). The agent key is a restricted function-call key limited to `execute_chunk` on the FxBudget contract.


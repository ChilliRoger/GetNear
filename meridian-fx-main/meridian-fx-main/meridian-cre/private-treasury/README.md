# Private Treasury CRE Workflow

Automated privacy-preserving treasury swap orchestration using Chainlink CRE and the Unlink privacy server.

## What this workflow does

This CRE workflow automates private treasury operations by orchestrating the Meridian privacy server (Unlink integration) through HTTP-based CRE capabilities:

1. **Check private pool balances** -- queries the privacy server for current token balances in the private pool
2. **Evaluate swap threshold** -- compares the balance against a configurable minimum to decide whether a swap is warranted
3. **Trigger private swap** -- if the balance exceeds the threshold, initiates a privacy-preserving swap via the `/api/privacy/demo` endpoint (deposit, execute, withdraw through Unlink)
4. **Verify transactions** -- fetches recent transaction history to confirm the swap was recorded

## How it differs from the public treasury workflow

| Aspect | Public Treasury (`treasury/`) | Private Treasury (`private-treasury/`) |
|---|---|---|
| **Swap mechanism** | Direct Uniswap V3 on-chain swap via `SwapExecutor` contract | Privacy-preserving swap via Unlink SDK through the privacy server |
| **On-chain interaction** | EVM contract calls (read balances, execute swap, log to Arc) | HTTP calls to the privacy server, which handles on-chain privacy operations |
| **Policy enforcement** | Reads `TreasuryVault` policy on Arc for rate bands and thresholds | Simple balance threshold check; privacy server handles compliance |
| **Transaction visibility** | Fully transparent on-chain swap on Base mainnet | Shielded through Unlink's privacy pool -- amounts and parties are not publicly linked |
| **Dependencies** | `viem` for ABI encoding, Uniswap API for quotes | Only CRE HTTP capability; the privacy server wraps all Unlink SDK calls |

## How to run

### Prerequisites

- The privacy server must be running at the URL specified in `config.json` (default: `http://localhost:38175`)
- CRE CLI installed and available as `cre` or at `~/bin/cre`
- The privacy server requires `UNLINK_API_KEY`, `UNLINK_MNEMONIC`, and `DEPLOYER_PRIVATE_KEY` to be configured

### Single run (compile and simulate)

```bash
cd meridian-cre
cre workflow compile private-treasury
cre workflow simulate private-treasury --broadcast
```

### Continuous loop

```bash
cd meridian-cre
./run-private-simulator.sh
```

The simulator runs on a configurable interval (default 60s) with `flock` guarding against overlapping ticks. Logs are appended to `/tmp/private-cre-loop.log`.

### Configuration

Edit `config.json` to adjust:

- `schedule` -- cron expression for CRE trigger frequency
- `privacyServerUrl` -- URL of the running privacy server
- `minBalanceForSwap` -- minimum token balance (in smallest unit) required to trigger a swap
- `inputToken` / `outputToken` -- token pair for the private swap
- `swapAmount` -- amount to swap per tick

## Design notes

This is a demonstration that CRE can orchestrate privacy-preserving treasury operations. The Unlink SDK's full `execute()` flow runs inside the privacy server; the CRE workflow drives the orchestration loop via HTTP, which is the correct separation of concerns for a production deployment where CRE handles scheduling, consensus, and reliability while the privacy server handles cryptographic proof generation and shielded transaction submission.

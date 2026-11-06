# apps/oracle -- Price Recording Server

Dev tool for monitoring Chainlink oracle prices and Fynd DEX quotes. NOT submission-critical. Do not prioritize this over contracts or CRE workflow.

## What It Does

Hono HTTP server that:
1. Reads Chainlink price feeds on Base every 30 seconds (EURC/USD, ETH/USD, BTC/USD, USDC/USD)
2. Fetches a Fynd DEX quote (10K USDC -> EURC) every 30 seconds
3. Records both to SQLite for historical comparison
4. Serves REST endpoints for the dev-ui dashboard

## Tech Stack

- Hono (HTTP framework)
- viem (Base chain reads)
- better-sqlite3 (WAL mode)
- tsx (TypeScript execution + watch)

## Config

| Setting | Default | Env var |
|---------|---------|---------|
| Port | 38174 | `PORT` |
| RPC URL | `https://mainnet.base.org` | `ORACLE_RPC_URL` |
| Fynd URL | `http://localhost:3000` | `FYND_URL` |
| Record interval | 30 seconds | hardcoded |

## Database

- Location: `apps/oracle/data/prices.db` (gitignored)
- Mode: SQLite WAL (write-ahead logging for concurrent reads)
- Created automatically on first run

## REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Feed count + total recordings |
| GET | `/prices/current` | Latest price per pair with divergence % |
| GET | `/prices/history?pair=EURC/USD&hours=24` | Time series (max 168h) |
| GET | `/depth?sell_token=USDC&buy_token=EURC` | 6-point liquidity curve |
| GET | `/depth/book` | Bidirectional order book depth |

## Rules

### 1. This is a dev tool
Do not invest time polishing this. It exists to validate that Chainlink and Fynd prices can be compared. The CRE workflow will do this in production, not the oracle server.

### 2. Do not add shared types it does not need
The oracle server predates the shared package. It has its own inline types. Converting to @meridian/shared types is a nice-to-have, not a priority.

### 3. Separate RPC from Fynd
The oracle uses `https://mainnet.base.org` for Chainlink reads, separate from the Fynd RPC (`https://base.llamarpc.com`). This avoids rate limiting. Keep them separate.

### 4. Key discovery: EURC/USD Chainlink feed
Found at `0xDAe398520e2B67cd3f27aeF9Cf14D93D927f8250` (8 decimals). This enables the oracle-vs-DEX divergence check that is central to the product narrative.

## Commands

```bash
pnpm dev    # start with watch mode (tsx watch)
pnpm start  # start without watch
```

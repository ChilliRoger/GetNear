# GetNear — System Overview

Last updated: 2026-04-03

Hackathon project on **Base chain** with **Arc**. Goal: sanity-check DEX swap quotes against oracle prices, block swaps that diverge > 0.1%, add human approval for large amounts.

---

## Architecture

```
Browser
  └─ https://
       └─ Cloudflare Tunnel (ae82df3e...)
            └─ Caddy (:18080)
                 └─ Vite dev server (127.0.0.1:58173)
                      ├─ /api/fynd/*  → Fynd container (:3000)
                      └─ /api/oracle/* → Oracle server (:38174)
```

## Apps

### dev-ui (`apps/dev-ui/`)
Vite 8 + React 19 + TypeScript. Served at ``.

Three tabs:
- **Quote** — swap quote tester. Pick tokens, enter amount, get Fynd quote with route/gas/impact.
- **Prices** — live Chainlink + Fynd price tiles, history line chart, divergence chart.
- **Depth** — liquidity depth curve. Fans out quotes at 6 sizes to show price degradation.

Port: `58173` (Vite dev server)

### oracle (`apps/oracle/`)
Hono + viem + better-sqlite3. Reads Chainlink feeds on Base and records to SQLite.

Port: `38174`

**Chainlink feeds recorded (every 30s):**
- ETH/USD (`0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70`)
- BTC/USD (`0xCCADC697c55bbB68dc5bCdf8d3CBe83CdD4E071E`)
- USDC/USD (`0x7e860098F58bBFC8648a4311b374B1D669a2bc6B`)

**Fynd quote recorded (every 30s):**
- USDC/EURC — 10K USDC → EURC quote via Fynd

Note: EUR/USD has no Chainlink feed on Base. We get the EUR rate from the DEX directly.

**DB:** `apps/oracle/data/prices.db` (SQLite, WAL mode, gitignored)

**Endpoints:**
- `GET /health` — feed count + total recordings
- `GET /prices/current` — latest price per pair with divergence %
- `GET /prices/history?pair=ETH/USD&hours=24` — time series (max 168h)
- `GET /depth?sell_token=USDC&buy_token=EURC` — 6-point liquidity curve

### Fynd (Docker)
DEX aggregator by Propeller Heads. Runs in Docker Compose on Base chain.

- API: `http://localhost:3000`
- Metrics: `http://localhost:9898`
- Config: `compose.yaml` + `.env`
- Image: `ghcr.io/propeller-heads/fynd:latest`

## Token Addresses (Base)

| Token | Address | Decimals |
|-------|---------|----------|
| WETH  | `0x4200000000000000000000000000000000000006` | 18 |
| USDC  | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 |
| EURC  | `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42` | 6 |
| DAI   | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` | 18 |
| cbBTC | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` | 8 |

## Commands

```bash
# Fynd
pnpm fynd:up          # start Fynd container
pnpm fynd:down        # stop Fynd container
pnpm fynd:logs        # tail Fynd logs
pnpm fynd:restart     # restart Fynd

# Oracle server
cd apps/oracle && pnpm dev     # start with watch mode
cd apps/oracle && pnpm start   # start without watch

# Dev UI
cd apps/dev-ui && pnpm dev     # start Vite dev server

# Health checks
curl http://localhost:3000/v1/health       # Fynd
curl http://localhost:38174/health          # Oracle
curl http://localhost:58173/api/fynd/v1/health   # Fynd via proxy
curl http://localhost:58173/api/oracle/health     # Oracle via proxy
```

## URLs

- **Dev UI:** https://
- **Fynd API:** http://localhost:3000 (internal only)
- **Oracle API:** http://localhost:38174 (internal only)

## Env Files

`.env` — has real `TYCHO_API_KEY`, do not paste in chat. Other values:
```
RPC_URL=https://base.llamarpc.com
FYND_CHAIN=base
FYND_HTTP_PORT=3000
FYND_METRICS_PORT=9898
```

Oracle uses `https://mainnet.base.org` for Chainlink reads (separate from Fynd RPC to avoid rate limiting).

## VPS Routing

Pattern: Cloudflare DNS CNAME → Tunnel → Caddy → local port

- `` → Caddy → `127.0.0.1:58173` (Vite)
- Caddy config: `/etc/caddy/Caddyfile`
- Tunnel config: `/etc/cloudflared/config.yml`

---

## Changelog

### 2026-04-03
- Initial monorepo setup (pnpm workspaces + turborepo)
- Fynd Docker Compose setup, switched from Ethereum to Base chain
- dev-ui app with swap quote tester (Quote tab)
- Wired `` through Cloudflare Tunnel + Caddy
- Added EURC token, set as default output currency
- Built oracle server: Chainlink feeds + Fynd USDC/EURC recording to SQLite
- Added Prices tab (history charts, divergence) and Depth tab (liquidity curves) to dev-ui
- EUR/USD has no Chainlink feed on Base — using Fynd DEX rate instead

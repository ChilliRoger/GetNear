# Privacy Server API Routes

All request/response shapes are defined in `@meridian/shared/privacy-types`.

## Public Balances

```
GET /api/privacy/balances/public
```

- **Response:** `PublicBalancesResponse`
- Returns on-chain ERC-20 balances for the deployer wallet on Base Sepolia.

## Shielded Balances

```
GET /api/privacy/balances/shielded
```

- **Response:** `ShieldedBalancesResponse`
- Returns token balances held inside the Unlink privacy pool.

## Shield (deposit into Unlink)

```
POST /api/privacy/shield
Content-Type: application/json
```

- **Request body:** `ShieldRequest` — `{ token, amount }`
- **Response:** `ShieldResponse`
- Approves the token, deposits into the Unlink pool, and returns the shield transaction ID.

## Unshield (withdraw from Unlink)

```
POST /api/privacy/unshield
Content-Type: application/json
```

- **Request body:** `UnshieldRequest` — `{ token, amount, recipientAddress? }`
- **Response:** `UnshieldResponse`
- Withdraws tokens from the Unlink pool back to the recipient (defaults to deployer).

## Mint Mock Tokens

```
POST /api/privacy/mint
Content-Type: application/json
```

- **Request body:** `MintRequest` — `{ token, amount }`
- **Response:** `MintResponse`
- Mints testnet tokens on Base Sepolia for demo purposes.

## Private Swap

```
POST /api/privacy/swap
Content-Type: application/json
```

- **Request body:** `PrivateSwapRequest` — `{ tokenIn, tokenOut, amountIn }`
- **Response:** `PrivateSwapResponse`
- Executes a three-step private swap: withdraw from pool, swap on-chain, deposit back.

## Swap Estimate

```
GET /api/privacy/swap/estimate?tokenIn=<addr>&tokenOut=<addr>&amountIn=<raw>
```

- **Query params:** match `SwapEstimateRequest` — `tokenIn`, `tokenOut`, `amountIn`
- **Response:** `SwapEstimateResponse`
- Returns estimated output, rate, and price impact without executing.

## Shield History

```
GET /api/privacy/shield/history?limit=50
```

- **Query params:** `limit` (optional, default 50)
- **Response:** `ShieldHistoryResponse`
- Returns recent shield/unshield transactions from the local DB.

## Health

```
GET /health
```

- **Response:** `{ service: string, status: string, uptime: number, unlink: object }`
- Basic liveness check including Unlink sidecar connectivity.

# API Endpoint Map

Every Oracle endpoint organized by consumer.

### ASCII Art

```
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │                           ORACLE API ENDPOINT MAP                            │
  │                        http://localhost:38174                                 │
  └──────────────────────────────────────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════════════════════════
  FRONTEND CALLS (World Mini App + Dev-UI)
  ═══════════════════════════════════════════════════════════════════════════════

  ┌──────────────────────────────┬──────────────────────────────────────────────┐
  │ Endpoint                     │ Description                                  │
  ├──────────────────────────────┼──────────────────────────────────────────────┤
  │ GET  /api/prices/comparison  │ 3-source prices + divergence bps + 24h avg  │
  │ GET  /api/trades             │ List trade orders (filter by ?status=)       │
  │ POST /api/trades             │ Create new trade order (INPUT or OUTPUT mode)│
  │ GET  /api/trades/:id         │ Single order detail with fill %             │
  │ POST /api/trades/:id/approve │ Mark approved (after World ID verification) │
  │ POST /api/trades/:id/cancel  │ Cancel an order                             │
  │ GET  /api/strategy/next      │ Current timing score + decision + breakdown │
  │ GET  /api/strategy/decisions │ Strategy decision history log (?limit=N,    │
  │                              │   ?order_id=X). Persisted per tick w/ score,│
  │                              │   breakdown, chunk_amount, chunk_multiplier │
  │ GET  /api/demo/speed         │ Read demo speed { speed: 1|10, sleep: 55|5 }│
  │ POST /api/demo/speed         │ Toggle demo speed (DEMO_MODE only)          │
  │ POST /api/demo/seed          │ Seed demo orders (DEMO_MODE only)           │
  │ GET  /api/cre/runs           │ CRE execution history (?limit=N)            │
  │ POST /api/policy             │ Update on-chain policy (writes to Arc)       │
  └──────────────────────────────┴──────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════════════════════════
  CRE CALLS (Simulator workflow -> Oracle)
  ═══════════════════════════════════════════════════════════════════════════════

  ┌──────────────────────────────┬──────────────────────────────────────────────┐
  │ Endpoint                     │ Description                                  │
  ├──────────────────────────────┼──────────────────────────────────────────────┤
  │ GET  /api/strategy/next      │ What should CRE do this tick?               │
  │                              │ Returns: { action, orderId, chunkAmount,    │
  │                              │   minOutput, score, reason, breakdown }     │
  ├──────────────────────────────┼──────────────────────────────────────────────┤
  │ PATCH /api/trades/:id/fill   │ Report fill (idempotent by txHash)          │
  │                              │ Body: { filledAmount, outputReceived,       │
  │                              │   status, txHash }                          │
  ├──────────────────────────────┼──────────────────────────────────────────────┤
  │ POST /api/cre/runs           │ Log tick result                             │
  │                              │ Body: { startedAt, action, orderId,         │
  │                              │   chunkAmount, result, txHash, durationMs } │
  └──────────────────────────────┴──────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════════════════════════
  PRIVACY SIDECAR ENDPOINTS (port 38175)
  ═══════════════════════════════════════════════════════════════════════════════

  ┌──────────────────────────────┬──────────────────────────────────────────────┐
  │ Endpoint                     │ Description                                  │
  ├──────────────────────────────┼──────────────────────────────────────────────┤
  │ GET  /health                 │ Health + Unlink SDK configuration status    │
  │ GET  /api/privacy/balances   │ MockUSDC + MockEURC balances (Base Sepolia) │
  │ POST /api/privacy/faucet     │ Mint test tokens (MockUSDC/MockEURC)        │
  │ POST /api/privacy/deposit    │ Deposit into Unlink privacy pool            │
  │ POST /api/privacy/execute-swap│ Private swap via Unlink                    │
  │ POST /api/privacy/withdraw   │ Withdraw from Unlink privacy pool           │
  │ GET  /api/privacy/transactions│ Private transaction history                │
  │ POST /api/privacy/demo       │ Demo mode operations                        │
  └──────────────────────────────┴──────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════════════════════════
  PRICE POLLERS (Internal, every 30s)
  ═══════════════════════════════════════════════════════════════════════════════

  ┌──────────────────────────────┬──────────────────────────────────────────────┐
  │ Source                       │ Details                                      │
  ├──────────────────────────────┼──────────────────────────────────────────────┤
  │ Chainlink Price Feeds        │ 4 pairs via on-chain reads (Base):          │
  │                              │   EURC/USD  0xDAe3...8250                   │
  │                              │   ETH/USD   0x7104...d3B70                  │
  │                              │   BTC/USD   0xCCAD...92fE                   │
  │                              │   USDC/USD  0x7e86...6B                     │
  ├──────────────────────────────┼──────────────────────────────────────────────┤
  │ Fynd API                     │ DEX aggregator quote (EURC/USD only)        │
  │                              │ POST /v1/quote, 10000 USDC input            │
  ├──────────────────────────────┼──────────────────────────────────────────────┤
  │ Uniswap V3 Trade API        │ Spot price quote (EURC/USD only)            │
  │                              │ POST trade-api.gateway.uniswap.org          │
  │                              │ 1 USDC EXACT_INPUT                          │
  └──────────────────────────────┴──────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════════════════════════
  LEGACY / ADDITIONAL ENDPOINTS
  ═══════════════════════════════════════════════════════════════════════════════

  ┌──────────────────────────────┬──────────────────────────────────────────────┐
  │ Endpoint                     │ Description                                  │
  ├──────────────────────────────┼──────────────────────────────────────────────┤
  │ GET  /health                 │ Health check: feed count + recording count  │
  │ GET  /prices/current         │ Latest price per pair (all feeds)           │
  │ GET  /prices/history         │ Time series (?pair=&hours=)                 │
  │ GET  /depth                  │ Fynd depth curve (?sell_token=&buy_token=)  │
  │ GET  /depth/book             │ Bid/ask order book (?base=&quote=)          │
  └──────────────────────────────┴──────────────────────────────────────────────┘
```

### Mermaid

```mermaid
graph LR
    subgraph Consumers
        App["World Mini App"]
        DevUI["Dev-UI"]
        CRE["CRE Simulator"]
        Internal["Internal Pollers"]
    end

    subgraph Oracle ["Oracle Server :38174"]
        direction TB
        subgraph TradeAPI ["Trade Orders"]
            T1["POST /api/trades<br/>(INPUT + OUTPUT mode)"]
            T2["GET /api/trades"]
            T3["GET /api/trades/:id"]
            T4["POST /api/trades/:id/approve"]
            T5["POST /api/trades/:id/cancel"]
            T6["PATCH /api/trades/:id/fill"]
        end
        subgraph StrategyAPI ["Strategy"]
            S1["GET /api/strategy/next"]
            S2["GET /api/strategy/decisions"]
        end
        subgraph PriceAPI ["Prices"]
            P1["GET /api/prices/comparison"]
            P2["GET /prices/current"]
            P3["GET /prices/history"]
        end
        subgraph DemoAPI ["Demo Mode"]
            D1["GET /api/demo/speed"]
            D2["POST /api/demo/speed"]
            D3["POST /api/demo/seed"]
        end
        subgraph CREAPI ["CRE Logging"]
            C1["POST /api/cre/runs"]
            C2["GET /api/cre/runs"]
        end
        subgraph PolicyAPI ["Policy"]
            PO1["POST /api/policy"]
        end
    end

    subgraph PrivacySidecar ["Privacy Sidecar :38175"]
        direction TB
        subgraph PrivacyAPI ["Privacy Routes"]
            PR1["GET /api/privacy/balances"]
            PR2["POST /api/privacy/faucet"]
            PR3["POST /api/privacy/deposit"]
            PR4["POST /api/privacy/execute-swap"]
            PR5["POST /api/privacy/withdraw"]
            PR6["GET /api/privacy/transactions"]
            PR7["POST /api/privacy/demo"]
        end
    end

    App --> T1 & T2 & T3 & T4 & T5
    App --> P1 & S1 & S2 & D1 & D2
    App --> PR1 & PR2 & PR3 & PR4 & PR5 & PR6
    DevUI --> P1 & P2 & P3 & S1 & S2 & C2 & D1 & D2
    CRE --> S1 & T6 & C1
    Internal --> P2
```

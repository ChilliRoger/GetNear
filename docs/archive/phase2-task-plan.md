# Phase 2 — Task Plan & Dependency Map

## Integration Seams

| Seam | Components | Interface | Scaffold In |
|------|-----------|-----------|-------------|
| S1 | Oracle API ↔ Frontend | REST endpoints (TradeOrder, PriceComparison, DemoSpeed) | Wave 0 |
| S2 | Oracle API ↔ CRE | GET /api/strategy/next, POST /api/fills | Wave 0 |
| S3 | CRE ↔ SwapExecutor | executeSwap() + withdraw() (modified) | Wave 0 |
| S4 | Frontend ↔ SwapExecutor | USDC.transfer() to executor address | Wave 0 (constant) |
| S5 | Oracle ↔ SQLite | trade_orders + cre_runs tables | Wave 0 |
| S6 | Demo Clock ↔ Oracle | GET/POST /api/demo/speed | Wave 0 |

## Wave 0 — Scaffold All Seams (sequential, ~1 hour)

All other work depends on these. Must complete first.

- **0.1** Add shared types to @meridian/shared (TradeOrder, StrategyResponse, PriceComparison, CRERun, DemoSpeed)
- **0.2** Modify SwapExecutor.withdraw() to allow CRE + redeploy to Base
- **0.3** Update constants.ts + config.json with new SwapExecutor address
- **0.4** Create Oracle SQLite migrations (trade_orders, cre_runs tables)
- **0.5** Stub all new Oracle API endpoints (correct shapes, mock responses)

## Wave 1 — Core Implementation (3 parallel tracks, ~3 hours)

### Track 1A: Oracle Backend
- **1A.1** Implement trade CRUD endpoints (POST/GET/PATCH /api/trades)
- **1A.2** Add Uniswap spot price feed to existing 30s poller
- **1A.3** Implement /api/prices/comparison (3-source comparison)
- **1A.4** Implement /api/strategy/next (basic: return oldest pending order)
- **1A.5** Implement /api/fills + /api/cre/runs (fill reporting, run logging)
- **1A.6** Implement /api/demo/speed + /api/demo/seed (DEMO_MODE gated)
- **1A.7** Add SQLite busy_timeout(5000), idempotent fill dedup by tx hash

### Track 1B: Frontend
- **1B.1** Trade form page — currency pair, amount, deadline, preview with 24h range
- **1B.2** Trades list page — open orders, fill %, progress bar, countdown
- **1B.3** Real wallet balances — ERC-20 balanceOf reads for treasury wallet
- **1B.4** Demo clock overlay — ticking clock, 1x/10x speed toggle
- **1B.5** Update nav — add Trade + Trades tabs
- **1B.6** Update dashboard — treasury vs in-execution balance split

### Track 1C: CRE + Contract
- **1C.1** Modify SwapExecutor.withdraw() + redeploy (from Wave 0.2)
- **1C.2** Rewrite CRE workflow — Oracle-driven, try/catch per step
- **1C.3** Create simulator bash loop (flock, speed mode, timeout 90s)
- **1C.4** Test single tick end-to-end

## Wave 2 — Integration (sequential, ~1-2 hours)

- **2.1** Wire frontend submit → Oracle API → verify order created
- **2.2** Wire CRE tick → Oracle strategy → executeSwap → withdraw → fill report
- **2.3** Wire frontend polling → fills update in real-time
- **2.4** Wire demo speed toggle → CRE loop speed change
- **2.5** End-to-end test: submit trade → CRE executes → UI shows fill → balances update

**=== PHASE 2A SAFETY GATE ===**

## Wave 3 — Smart Execution (2 parallel tracks, ~2-3 hours)

### Track 3A: Oracle Intelligence
- **3A.1** Timing score calculator (price vs avg 40%, divergence 20%, urgency 40%)
- **3A.2** Enhanced /api/strategy/next with score-based decisions

### Track 3B: Frontend + Dev-UI
- **3B.1** Price comparison widget on dashboard (3 sources, divergence indicator)
- **3B.2** Trade detail view with timing score + fill timeline
- **3B.3** Cancel trade flow (frontend + Oracle endpoint)
- **3B.4** Dev-UI: Oracle readings + CRE run history dashboard

**=== PHASE 2B SAFETY GATE ===**

## Wave 4 — Stretch (parallel, remaining time)

- **4.1** Adaptive TWAP chunking (urgency * score * depth factors)
- **4.2** Desired output mode ("I want X EURC")
- **4.3** Strategy decision logging + UI timeline
- **4.4** Architecture diagrams (React components + PNG export)

## Dependency Graph

```
Wave 0 (scaffold seams)
  │
  ├── Track 1A (Oracle)  ──┐
  ├── Track 1B (Frontend) ──┼── Wave 2 (integration) ── Wave 3A + 3B ── Wave 4
  └── Track 1C (CRE)     ──┘
```

## Parallel Execution Summary

| Wave | Tracks | Can Parallel? | Estimated Hours |
|------|--------|--------------|-----------------|
| 0 | 1 (scaffold) | No — sequential | 1h |
| 1 | 3 (Oracle, Frontend, CRE) | Yes — all parallel | 3h |
| 2 | 1 (integration) | No — sequential | 1-2h |
| 3 | 2 (Oracle intelligence, Frontend+DevUI) | Yes — parallel | 2-3h |
| 4 | 4 (stretch items) | Yes — all parallel | 2-3h |

Total estimate: 9-12 hours with parallel execution

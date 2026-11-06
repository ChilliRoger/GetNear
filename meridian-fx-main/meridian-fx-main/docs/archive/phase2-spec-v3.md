# Meridian FX — Phase 2 Spec v3: Real Trading System

**Status:** APPROVED — Ready to execute **Context:** ETHGlobal Cannes 2026, ~15 hours remaining
**Prerequisite:** Phase 1 complete. v1.0.0 tagged. All PRs merged.

Changes from v2: Added demo speed mode (clock overlay + 10x CRE), dev-ui oracle/CRE dashboard, flock guard for bash loop, basic error handling in CRE workflow, architecture diagrams track. SwapExecutor redeploy kept in plan (stronger Chainlink demo). Added idempotent fill reporting, SQLite busy_timeout, DEMO_MODE gating per Codex review.

---

## 1. Architecture: Who Does What

```
ORACLE SERVER (Brain)          CRE SIMULATOR (Hands)         CONTRACTS (Tools)
apps/oracle                    meridian-cre/treasury          contracts/

- Trade orders DB (SQLite)     - Bash loop (flock guarded)    SwapExecutor (Base)
- 3 price feeds recording      - Reads speed mode from        - executeSwap()
- Timing score calculator        Oracle (1x or 10x)           - withdraw() [+CRE]
- Strategy decisions           - HTTP GET: what to do?        - getBalances()
- Fill tracking                - EVM Read: balances
- Speed mode control           - EVM Write: swap              TreasuryVault (Arc)
- REST API for frontend        - EVM Write: withdraw          - logExecution()
- REST API for CRE             - EVM Write: log on Arc        - getPolicy()
                               - HTTP POST: report fill
                               - Error handling + retry

DEV-UI DASHBOARD               MAIN APP (User-facing)
apps/dev-ui                    apps/app

- Oracle readings live view    - Trade form + preview
- CRE run history log          - Open trades with fill %
- Next tick countdown          - Real wallet + executor balances
- Price source comparison      - Clock overlay (1x/10x toggle)
- Strategy score display       - i18n EN/FR
- Speed mode toggle            - World ID approval
```

**Key principle:** Oracle = brain (all intelligence + state). CRE = hands (dumb executor). Frontend = eyes. Dev-UI = x-ray vision.

---

## 2. CRE Workflow (Final)

Each tick:

```
0. Trigger: bash loop with flock guard (prevents overlap)
1. HTTP GET Oracle /api/strategy/next
   → { action: "SWAP", orderId, chunkAmount, minOutput }
   → or { action: "WAIT", reason }

2. If WAIT → log reason, exit tick

3. If SWAP:
   a. EVM Read  → SwapExecutor.getBalances() — sanity check
   b. EVM Write → SwapExecutor.executeSwap(orderId, chunkAmount, minOutput)
      - TRY/CATCH: if swap fails, HTTP POST Oracle with error, exit tick
   c. EVM Write → SwapExecutor.withdraw(outputToken, amountReceived)
      - TRY/CATCH: if withdraw fails, log warning, continue (funds safe in executor)
   d. EVM Write → TreasuryVault.logExecution(...) on Arc
      - TRY/CATCH: if log fails, continue (swap already happened, audit is best-effort)
   e. HTTP POST → Oracle /api/fills — report result
      - Always runs, even if d failed
```

### CRE Simulator Loop (with flock)

```bash
#!/bin/bash
# meridian-cre/run-simulator.sh
LOCKFILE="/tmp/meridian-cre.lock"
cd /home/claude/code/meridian-fx/meridian-cre
source ../.env

while true; do
  # Get speed from Oracle (default 1x = 55s sleep, 10x = 5s sleep)
  SPEED=$(curl -sf http://localhost:38174/api/demo/speed | jq -r '.sleep // 55')

  # flock: skip tick if previous is still running
  flock -n "$LOCKFILE" cre workflow simulate treasury --broadcast 2>&1 \
    | tee -a /tmp/cre-loop.log \
    || echo "[$(date)] Skipped: previous tick still running"

  sleep "$SPEED"
done
```

---

## 3. Contract Change: SwapExecutor.withdraw()

```solidity
// Allow CRE to withdraw swapped tokens back to treasury
function withdraw(address token, uint256 amount) external {
    require(msg.sender == owner() || msg.sender == creForwarder, "Not authorized");
    IERC20(token).transfer(owner(), amount);
}
```

Note: `creForwarder` is the Chainlink CRE KeystoneForwarder address, set at deployment. It's trusted Chainlink infrastructure, not an arbitrary address.

Redeploy required → update address in constants.ts + config.json + README.md.

---

## 4. Phase 2A — Real Trading MVP (MUST DO, 5-6 hours)

### Safety Gate
After 2A: users submit trades, CRE executes with real swaps, multi-source pricing validates rates, swapped tokens return to treasury, demo speed mode works for video recording.

### 4.1 SwapExecutor Contract Update
- Modify withdraw() to allow CRE
- Redeploy to Base mainnet
- Update addresses everywhere

### 4.2 Oracle Server: Trade Orders + Price Oracle + Demo Mode

**Extend:** `apps/oracle/src/index.ts`

**New SQLite table:**
```sql
CREATE TABLE trade_orders (
  id TEXT PRIMARY KEY,
  from_token TEXT NOT NULL,
  to_token TEXT NOT NULL,
  input_amount TEXT NOT NULL,
  filled_amount TEXT DEFAULT '0',
  output_received TEXT DEFAULT '0',
  deadline INTEGER NOT NULL,
  status TEXT DEFAULT 'PENDING',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE cre_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  action TEXT NOT NULL,
  order_id TEXT,
  chunk_amount TEXT,
  result TEXT,
  tx_hash TEXT,
  error TEXT,
  duration_ms INTEGER
);
```

**REST endpoints:**
```
Trade Orders:
  POST   /api/trades              Create trade order
  GET    /api/trades              List orders (filter by status)
  GET    /api/trades/:id          Order detail with fill %
  POST   /api/trades/:id/approve  Mark approved (after World ID)
  POST   /api/trades/:id/cancel   Cancel order
  PATCH  /api/trades/:id/fill     Update fill (called by CRE)

Strategy:
  GET    /api/strategy/next       What should CRE do this tick?
  GET    /api/prices/comparison   3-source price comparison

Demo Mode:
  GET    /api/demo/speed          Current speed (returns { speed: 1|10, sleep: 55|5 })
  POST   /api/demo/speed          Set speed (body: { speed: 1|10 })
  POST   /api/demo/seed           Create demo orders at various fill stages

CRE Logging:
  POST   /api/cre/runs            Log a CRE tick result
  GET    /api/cre/runs            List recent CRE runs
```

**Multi-source price oracle:**
- Existing: Chainlink feeds (4) + Fynd quotes (every 30s)
- New: Uniswap Trade API spot price (1 USDC → EURC quote, every 30s)
- Comparison endpoint: all 3 prices, divergence in bps, 24h average

### 4.3 CRE Workflow Rewrite

Replace hardcoded $5 auto-swap with Oracle-driven flow:
1. HTTP GET /api/strategy/next
2. If WAIT → return
3. If SWAP → getBalances, executeSwap, withdraw, logExecution, POST /api/fills
4. Each step wrapped in try/catch with graceful degradation

### 4.4 Frontend: Trade Form + Clock Overlay + Real Balances

**New page:** `apps/app/src/app/(app)/trade/page.tsx`
- From/To toggle (USDC/EURC)
- Amount input with display multiplier preview
- Deadline selector (1h / 4h / 24h)
- Preview: expected output, 24h price range bar (high/low/expected)
- Submit → POST Oracle + transfer to SwapExecutor

**New page:** `apps/app/src/app/(app)/trades/page.tsx`
- Open trades list with fill %, progress bar, deadline countdown
- Status badges (PENDING / FILLING / COMPLETE / CANCELLED)
- Cancel button

**New component:** `apps/app/src/components/demo-clock.tsx`
- Fixed top-right on all app pages
- Ticking clock display
- Speed badge: "1x" (subtle) / "10x" (pulsing green)
- Click to toggle → POST /api/demo/speed
- In 10x: clock ticks visibly faster

**Edit dashboard:**
- Real wallet balances (USDC/EURC balanceOf on deployer address)
- SwapExecutor balances (already have)
- Show both as "Treasury" and "In Execution"

**Edit nav:** Add "Trade" tab

### 4.5 CRE Simulator Service
- `meridian-cre/run-simulator.sh` with flock guard
- Reads speed from Oracle API
- Logs each tick to /tmp/cre-loop.log and POST /api/cre/runs

### 4.6 Devil's Advocate Fixes (from Codex review)

**Idempotent fill reporting:** CRE includes tx hash in POST /api/fills. Oracle deduplicates by tx hash — if CRE crashes and re-reports same fill, no double counting.

**SQLite busy_timeout:** Add `busy_timeout(5000)` to Oracle DB init. Handles concurrent writes from price pollers, CRE fills, and user requests gracefully.

**DEMO_MODE gating:** `/api/demo/seed` and `/api/demo/speed` return 404 unless `DEMO_MODE=true` env var is set. Prevents accidental demo manipulation in non-demo environments.

**Token transfer flow:** User calls `USDC.transfer()` directly to SwapExecutor address from their wallet. No ERC20 approve pattern needed — simplest possible flow for hackathon.

**CRE loop timeouts:** Add `timeout 90` to the CRE simulate command in the bash loop. If a tick hangs, it gets killed and the next tick proceeds.

### 4.7 Fallback Paths

| Component | Fallback |
|-----------|----------|
| Oracle API | Hardcode 2 demo orders, skip DB |
| Uniswap price feed | Fynd + Chainlink only (2 sources) |
| CRE withdraw fails | Funds stay in executor, manual withdrawal |
| Trade form complex | Minimal: amount + submit, skip preview |
| Demo clock | Simple toggle without animated clock |

---

## 5. Phase 2B — Smart Execution (SHOULD DO, 4-5 hours)

### 5.1 Timing Score Calculator

`apps/oracle/src/strategy.ts`

Score (0-100):
- Price vs 24h average (40%): below avg = good time
- Source divergence (20%): low divergence = confident
- Urgency (40%): time_elapsed/total * amount_remaining/total

Score > 70 → SWAP (normal chunk). Score > 85 → SWAP (2x chunk). Score < 70 → WAIT (unless urgency > 80).

### 5.2 Enhanced /api/strategy/next
Uses timing score. Returns score + reason in response so frontend can display.

### 5.3 Trade Detail UI
- Timing score (color coded)
- Strategy reason text
- Fill history timeline
- Cancel with confirmation

### 5.4 Price Comparison Dashboard Widget
3 prices side by side, divergence indicator, 24h overlay.

### 5.5 Fallback
Linear TWAP: split evenly across remaining ticks. No intelligence but still chunked.

---

## 6. Phase 2C — Optimal Strategy + Polish (STRETCH, 3-4 hours)

### 6.1 Adaptive TWAP Chunking
Dynamic chunk sizing: urgency * score * depth factors.

### 6.2 Desired Output Mode
"I want 4,000 EURC" → estimate input, deposit with buffer, swap until target, return excess.

### 6.3 Strategy Decision Logging
SQLite table + expandable timeline in trade detail UI.

### 6.4 Architecture Diagrams
- System architecture (SVG/React component on landing page)
- Trade execution flow (swimlane diagram)
- Sponsor integration map
- Export as PNG for ETHGlobal submission

---

## 7. Dev-UI: Oracle + CRE Dashboard

**New page in:** `apps/dev-ui/` (existing Vite + React app at dev.omnipass.world)

### Oracle Dashboard Panel
- Live price readings: Chainlink, Fynd, Uniswap (auto-refresh)
- Price divergence indicator (real-time)
- 24h average vs current
- Trade orders table (all statuses)

### CRE Simulator Panel
- List of recent CRE runs (from /api/cre/runs)
  - Timestamp, action, order ID, chunk size, result, tx hash, duration
- Countdown to next tick (based on speed mode)
- Speed toggle (1x / 10x) — same as clock overlay
- Live log stream (tail of /tmp/cre-loop.log)

### Why This Matters
- Essential for debugging during development
- Impressive for judges if we show it ("here's our internal operations view")
- Validates that the Oracle brain is making good decisions

---

## 8. Parallel Execution Plan

```
HOUR  AGENT 1 (Backend)         AGENT 2 (Frontend)          AGENT 3 (CRE+Contract)
----  -------------------       --------------------        ----------------------
0     Oracle trade API           Trade form page             SwapExecutor withdraw fix
      (SQLite + endpoints)       Clock overlay component     Redeploy + update addrs

1     Uniswap price feed         Trade list page             CRE workflow rewrite
      Price comparison           Demo seed flow              (Oracle-driven)
      Demo speed endpoints

2     /api/strategy/next         Wire to Oracle API          CRE simulator loop
      CRE run logging            Real wallet balances        (flock + speed mode)
      
3     === INTEGRATION TEST: Submit → CRE executes → UI fills → balances update ===
      === PHASE 2A SAFETY GATE ===

4     Timing score calc          Price comparison widget     (Support/debug)
      Enhanced strategy          Trade detail + score

5     Score-based chunking       Fill timeline               Dev-UI oracle dashboard
                                 Cancel flow                 Dev-UI CRE panel

6     === PHASE 2B SAFETY GATE ===

7+    Strategy logging           Strategy log UI             Architecture diagrams
      Desired output mode        Diagram components          (SVG + PNG export)
      === PHASE 2C ===
```

---

## 9. New Shared Types

Add to `packages/shared/src/types.ts`:

```typescript
export interface TradeOrder {
  id: string
  fromToken: 'USDC' | 'EURC'
  toToken: 'USDC' | 'EURC'
  inputAmount: string
  filledAmount: string
  outputReceived: string
  deadline: number
  status: 'PENDING' | 'PENDING_APPROVAL' | 'APPROVED' | 'FILLING' | 'COMPLETE' | 'CANCELLED'
  createdAt: number
  updatedAt: number
}

export interface StrategyResponse {
  action: 'SWAP' | 'WAIT'
  orderId?: string
  chunkAmount?: string
  minOutput?: string
  score?: number
  reason: string
}

export interface PriceComparison {
  chainlink: { price: number; updatedAt: number }
  fynd: { price: number; updatedAt: number }
  uniswap: { price: number; updatedAt: number }
  divergenceBps: number
  avg24h: number
  currentVsAvgPct: number
}

export interface CRERun {
  id: number
  startedAt: number
  action: string
  orderId?: string
  chunkAmount?: string
  result: string
  txHash?: string
  error?: string
  durationMs: number
}

export interface DemoSpeed {
  speed: 1 | 10
  sleep: number
}
```

---

## 10. Success Criteria

### 2A (MUST) — Working Trade System + Demo Mode
- [ ] SwapExecutor redeployed with CRE withdraw
- [ ] 3 price sources recording
- [ ] User submits trade → CRE executes → withdraws to treasury
- [ ] UI shows real wallet + executor balances
- [ ] Trade list with fill % updating
- [ ] Clock overlay with 1x/10x speed toggle
- [ ] Demo seed creates realistic orders

### 2B (SHOULD) — Smart Execution
- [ ] Timing score affects execution decisions
- [ ] Price comparison visible on dashboard
- [ ] Cancel trade works
- [ ] Dev-UI shows Oracle readings + CRE run history

### 2C (STRETCH) — Optimal Strategy + Diagrams
- [ ] Adaptive chunk sizing
- [ ] Desired output mode
- [ ] Architecture diagrams (React + PNG)
- [ ] Strategy decision log

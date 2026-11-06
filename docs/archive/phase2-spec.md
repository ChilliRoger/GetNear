# GetNear — Phase 2 Spec: Real Trading System

**Status:** Draft v1 **Context:** ETHGlobal Cannes 2026, ~18 hours remaining
**Prerequisite:** Phase 1 complete (contracts deployed, CRE workflow simulated, frontend live with real on-chain reads)

---

## 1. What We're Building

### One-Liner
Upgrade GetNear from a demo dashboard to a working trade execution system — real balances, real trade submission, intelligent swap timing, and live fill tracking.

### Why Now
Phase 1 proved the architecture works. But the dashboard shows mock trades and the CRE workflow executes a single hardcoded amount. Judges will notice. Phase 2 makes GetNear feel like a product you could actually use: submit a trade, watch it fill, see your real positions change.

### Phase 1 vs Phase 2

| | Phase 1 (Done) | Phase 2 (Building) |
|---|---|---|
| Balances | Real SwapExecutor reads | + Wallet balances + fill tracking |
| Trades | CRE auto-executes hardcoded $5 | User submits trades with amount/deadline |
| Pricing | Single Uniswap quote | Multi-source oracle (Fynd + Uniswap + Chainlink) |
| Strategy | Execute if rate in band | Timing score, TWAP chunking, urgency weighting |
| UI | Mock trade history | Real trade list with fill %, countdown, cancel |

---

## 2. Architecture: What Changes

### New Components

```
                    EXISTING                           NEW (Phase 2)
                    --------                           -------------
User               Dashboard (read-only)       -->    Trade Form + Submit
                                                       |
Oracle Server      Price recording (30s)        -->    + Uniswap spot feed
(apps/oracle)      Chainlink + Fynd                    + Price divergence calc
                                                       + Timing score API
                                                       + Trade orders DB (SQLite)
                                                       |
CRE Workflow       Single $5 auto-swap          -->    Read pending orders
(GetNear-cre)     Hardcoded amount                    Pick best chunk size
                                                       Execute with timing score
                                                       Update fill status
                                                       |
SwapExecutor       executeSwap(tradeId,amt,min) -->    No contract changes needed
(contracts)        Already supports any amount         (existing interface works)
```

### Data Flow: New Trade

```
1. User fills trade form (amount, pair, deadline)
2. Frontend POST /api/trades --> Oracle server creates order in SQLite
3. Frontend calls SwapExecutor.deposit() or direct USDC transfer
4. CRE workflow (on next cron tick):
   a. Reads pending orders from Oracle API
   b. For each order: check timing score
   c. If score > threshold: calculate optimal chunk size
   d. Execute chunk via SwapExecutor.executeSwap()
   e. POST fill update to Oracle server
5. Frontend polls /api/trades/:id for fill status
6. When 100% filled or deadline reached: order complete
```

### Integration Seams (What Can Be Parallelized)

| Track | Work | Depends On | Can Parallel With |
|-------|------|-----------|-------------------|
| A: Oracle API | Trade orders DB + REST endpoints | Nothing | Everything |
| B: Frontend | Trade form + submit + fill tracking UI | A (API contract) | C, D |
| C: Price Oracle | Multi-source feeds + timing score | A (to store scores) | B, D |
| D: CRE Updates | Read orders, chunk execution | A (to read orders) | B, C |

**Key insight:** Track A (Oracle API) unblocks everything. Build it first.

---

## 3. Phase 2A — Real Trading MVP (MUST DO, 4-6 hours)

### Safety Gate
After 2A, users can submit a trade and see it execute. Even if 2B/2C don't ship, the demo shows a real working trade system.

### 3.1 Oracle Server: Trade Orders API

**File:** `apps/oracle/src/index.ts` (extend existing Hono server)

**New SQLite table:**
```sql
CREATE TABLE trade_orders (
  id TEXT PRIMARY KEY,          -- UUID
  from_token TEXT NOT NULL,     -- 'USDC' | 'EURC'
  to_token TEXT NOT NULL,       -- 'USDC' | 'EURC'
  input_amount TEXT NOT NULL,   -- Raw 6-decimal string
  filled_amount TEXT DEFAULT '0',
  output_received TEXT DEFAULT '0',
  deadline INTEGER NOT NULL,    -- Unix timestamp
  status TEXT DEFAULT 'PENDING', -- PENDING | FILLING | COMPLETE | CANCELLED
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**New endpoints:**
- `POST /api/trades` — Create trade order
- `GET /api/trades` — List all orders (with status filter)
- `GET /api/trades/:id` — Get order detail with fill %
- `PATCH /api/trades/:id/fill` — Update fill (called by CRE)
- `POST /api/trades/:id/cancel` — Cancel unfilled order

### 3.2 Frontend: Trade Form + Status

**New file:** `apps/app/src/app/(app)/trade/page.tsx`

Trade form:
- Input: from currency (USDC/EURC toggle), amount (slider + input), deadline (1h/4h/24h/custom)
- Preview: expected output based on current rate, with high/low range bar from 24h prices
- Submit button: calls Oracle API to create order

**New file:** `apps/app/src/app/(app)/trades/page.tsx`

Open trades list:
- Each trade shows: pair, input amount, filled %, output received, deadline countdown
- Progress bar for fill %
- Cancel button for unfilled/partial trades

**Edit:** `apps/app/src/components/nav.tsx` — Add "Trade" tab

### 3.3 Real Wallet Balances

**Edit:** `apps/app/src/lib/contracts.ts`

Add reads for wallet (treasury) balances:
- Read USDC balance of deployer wallet on Base (`balanceOf`)
- Read EURC balance of deployer wallet on Base (`balanceOf`)
- These are the "treasury" balances (funds not yet in SwapExecutor)

Dashboard shows:
- Treasury (wallet): USDC/EURC available to deploy
- In Execution (SwapExecutor): USDC/EURC being swapped
- Total: sum of both

### 3.4 Fallback Path
If Oracle API takes too long: skip the DB, hardcode 2-3 demo trades in the frontend with realistic data. The trade form can POST directly to a mock endpoint. Less real, but still shows the UX.

---

## 4. Phase 2B — Smart Execution (SHOULD DO, 4-6 hours)

### Safety Gate
After 2B, the system makes intelligent timing decisions instead of executing immediately. This is the "wow factor" for Chainlink and Uniswap judges.

### 4.1 Multi-Source Price Oracle

**Edit:** `apps/oracle/src/index.ts`

Add Uniswap spot price feed alongside existing Chainlink + Fynd:
- Uniswap: call trade API for a quote every 30s (already have the key)
- Store all three prices in existing SQLite recordings table

**New endpoint:** `GET /api/prices/comparison`
Returns:
```json
{
  "chainlink": { "price": 0.8682, "updated": "..." },
  "fynd": { "price": 0.8679, "updated": "..." },
  "uniswap": { "price": 0.8681, "updated": "..." },
  "divergence_bps": 3,
  "avg_24h": 0.8675,
  "current_vs_avg_pct": 0.08
}
```

### 4.2 Timing Score Calculator

**New file:** `apps/oracle/src/strategy.ts`

Composite score (0-100) based on:
- **Price vs 24h average** (40% weight): below avg = better to buy EURC
- **Source divergence** (20% weight): low divergence = more confident
- **Urgency** (40% weight): `(amount_remaining / total) * (time_elapsed / total_time)`

Score > 60 = execute a chunk. Score > 80 = execute larger chunk.

**New endpoint:** `GET /api/strategy/score`

### 4.3 Open Trade Tracking UI

**Edit:** `apps/app/src/app/(app)/trades/page.tsx`

For each open trade:
- Real-time fill % with animated progress bar
- Deadline countdown timer
- Current timing score (color coded: red < 40, yellow 40-70, green > 70)
- Strategy log: "Waiting for better rate" / "Executing: rate 0.2% below 24h avg"

### 4.4 Cancel Trade

**Edit:** Oracle API + Frontend

Cancel flow:
1. User clicks Cancel on open trade
2. Oracle marks order CANCELLED
3. CRE stops executing chunks for that order
4. Any USDC remaining in SwapExecutor stays there (manual withdrawal later)

### 4.5 Fallback Path
If timing score is too complex: use a simple rule — execute 1 chunk per CRE tick (every 60s), splitting total amount evenly across remaining ticks until deadline. Linear TWAP, no intelligence, but still shows chunked execution.

---

## 5. Phase 2C — Optimal Strategy Engine (STRETCH, 4+ hours)

### 5.1 TWAP Chunking with Urgency

Instead of equal chunks, dynamically size based on:
- Time remaining vs amount remaining
- Current timing score
- Liquidity depth from Fynd

Formula: `chunk_size = base_chunk * (urgency_factor * score_factor * depth_factor)`

Where:
- `urgency_factor` = exponential as deadline approaches (1.0 at start, up to 3.0 near deadline)
- `score_factor` = 0.5 at score 40, 1.0 at score 60, 2.0 at score 90
- `depth_factor` = min(1.0, available_depth / chunk_size) — don't exceed available liquidity

### 5.2 Desired Output Mode

User specifies: "I want 4,000 EURC" instead of "Swap 5,000 USDC"

Implementation:
- Estimate input needed: `desired_output / current_rate * 1.02` (2% buffer)
- Transfer estimated input to SwapExecutor
- Execute chunks until output target reached
- Return excess input to wallet

### 5.3 Depth-Aware Chunk Sizing

Fynd exposes liquidity depth data. Use it to:
- Never swap more than 50% of available depth in one chunk
- If depth is thin, split into smaller chunks across more ticks
- If depth is deep, can execute larger chunks

### 5.4 Strategy Decision Logging

Store every decision in SQLite:
```sql
CREATE TABLE strategy_log (
  id INTEGER PRIMARY KEY,
  order_id TEXT,
  timestamp INTEGER,
  action TEXT,           -- 'EXECUTE' | 'WAIT' | 'SKIP'
  reason TEXT,           -- Human-readable
  score INTEGER,
  chunk_size TEXT,
  price_at_decision TEXT
);
```

Surface in the UI as an expandable timeline per trade.

### 5.5 Fallback Path
Skip entirely. 2A + 2B already deliver a strong demo.

---

## 6. Rollout Timeline

```
Hour 0-1:   Track A — Oracle trade orders API (SQLite + REST)
Hour 0-1:   Track C — Add Uniswap spot feed to oracle (parallel)
Hour 1-3:   Track B — Trade form + preview + submit UI
Hour 1-3:   Track D — CRE workflow reads orders, executes chunks
Hour 3-4:   Integration test: submit trade → CRE executes → UI shows fill
            === PHASE 2A SAFETY GATE ===
Hour 4-6:   Track C — Timing score calculator + comparison endpoint
Hour 4-6:   Track B — Open trades list with fill tracking, cancel
Hour 6-7:   Integration test: timing score affects execution
            === PHASE 2B SAFETY GATE ===
Hour 7-9:   Track D — TWAP chunking, desired output mode
Hour 7-9:   Track B — Strategy log UI, depth display
            === PHASE 2C (if time permits) ===
Hour 9-10:  Final polish, demo prep, README update
```

### Parallel Execution Plan

```
Agent 1 (Backend):  Oracle API → Price feeds → Timing score → Strategy logic
Agent 2 (Frontend): Trade form → Preview → Submit → Trade list → Fill tracking
Agent 3 (CRE):      Order reading → Chunk execution → Fill updates
```

All three agents can start simultaneously after Track A API contract is agreed (just the endpoint shapes).

---

## 7. What Does NOT Change

- SwapExecutor.sol — no contract modifications needed
- TreasuryVault.sol — no changes
- Existing dashboard, approve, settings pages — keep working
- Landing page — keep as-is
- Display multiplier — still x1M for all amounts
- CRE simulation qualification — already confirmed

---

## 8. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Oracle API too slow to build | Blocks everything | LOW | Simple SQLite + 5 Hono routes, ~1 hour |
| CRE can't read external API | Blocks smart execution | MEDIUM | CRE uses HTTP capability, already proven. Fallback: hardcode orders in CRE config |
| Uniswap API rate limit | Blocks price oracle | LOW | We fetch every 30s, well within limits. Fallback: use Fynd only |
| Time runs out before 2B | Lose smart execution | MEDIUM | 2A safety gate ensures working demo regardless |
| Trade form UX takes too long | Delays integration | LOW | Start with minimal form, polish later |

---

## 9. New Shared Types

Add to `packages/shared/src/types.ts`:

```typescript
export interface TradeOrder {
  id: string
  fromToken: 'USDC' | 'EURC'
  toToken: 'USDC' | 'EURC'
  inputAmount: string        // Raw 6-decimal
  filledAmount: string       // Raw 6-decimal
  outputReceived: string     // Raw 6-decimal
  deadline: number           // Unix timestamp
  status: 'PENDING' | 'FILLING' | 'COMPLETE' | 'CANCELLED'
  createdAt: number
  updatedAt: number
}

export interface PriceComparison {
  chainlink: { price: number; updatedAt: number }
  fynd: { price: number; updatedAt: number }
  uniswap: { price: number; updatedAt: number }
  divergenceBps: number
  avg24h: number
  currentVsAvgPct: number
}

export interface TimingScore {
  score: number              // 0-100
  components: {
    priceVsAvg: number       // 0-40
    divergence: number       // 0-20
    urgency: number          // 0-40
  }
  recommendation: 'EXECUTE' | 'WAIT'
  suggestedChunkPct: number  // 0-100, % of remaining to execute
}
```

---

## 10. Success Criteria

### 2A Complete When:
- [ ] User can see real wallet + SwapExecutor balances
- [ ] User can submit a new trade order via the UI
- [ ] CRE picks up the order and executes (at least one chunk)
- [ ] UI shows the trade with fill % updating

### 2B Complete When:
- [ ] Three price sources displayed and compared
- [ ] Timing score visible per trade
- [ ] CRE uses score to decide when/how much to execute
- [ ] User can cancel an open trade

### 2C Complete When:
- [ ] Chunk sizes vary based on score + urgency + depth
- [ ] Desired output mode works end-to-end
- [ ] Strategy decision log visible in UI

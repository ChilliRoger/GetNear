# Meridian FX — Phase 2 Spec v2: Real Trading System

**Status:** Final Draft **Context:** ETHGlobal Cannes 2026, ~17 hours remaining
**Prerequisite:** Phase 1 complete (contracts deployed, CRE simulation proven, frontend live)

Changes from v1: Multi-source oracle moved to 2A. CRE runs as looped simulator with --broadcast. SwapExecutor gets withdraw-to-treasury step. CRE architecture clarified (Oracle = brain, CRE = executor).

---

## 1. Architecture: Who Does What

```
ORACLE SERVER (Brain)          CRE SIMULATOR (Hands)         CONTRACTS (Tools)
apps/oracle                    meridian-cre/treasury          contracts/
                                                              
- Trade orders DB (SQLite)     - Loops every 60s              SwapExecutor (Base)
- Price feeds (3 sources)      - HTTP GET Oracle: "what to    - executeSwap()
- Timing score calculator        do this tick?"               - withdraw() [+CRE]
- Strategy decisions           - EVM Read: balances           - getBalances()
- Fill tracking                - EVM Write: swap              
- REST API for frontend        - EVM Write: withdraw to       TreasuryVault (Arc)
                                 treasury                     - logExecution()
                               - EVM Write: log on Arc        - getPolicy()
                               - HTTP POST Oracle: report     - pending trades
                                 fill result                  
```

**Key principle:** Oracle holds ALL intelligence and state. CRE is a dumb executor that asks "what should I do?" and reports "here's what happened." SwapExecutor is a tool. TreasuryVault is a ledger.

---

## 2. CRE Workflow (Revised)

Each tick (every 60s via bash loop):

```
0. Trigger: bash loop runs `cre workflow simulate treasury --broadcast`
1. HTTP GET Oracle /api/strategy/next
   → Response: { action: "SWAP", orderId, chunkAmount, minOutput }
   → Or: { action: "WAIT", reason: "no orders" | "score too low" | "pending approval" }

2. If WAIT → log reason, exit tick

3. If SWAP:
   a. EVM Read  → SwapExecutor.getBalances() on Base
      - Sanity check: enough input token for chunkAmount
   b. EVM Write → SwapExecutor.executeSwap(orderId, chunkAmount, minOutput) on Base
      - Actual Uniswap V3 swap happens here
   c. EVM Write → SwapExecutor.withdraw(outputToken, amountReceived) on Base
      - Transfer swapped tokens back to treasury wallet
   d. EVM Write → TreasuryVault.logExecution(...) on Arc
      - Immutable audit trail
   e. HTTP POST → Oracle /api/fills
      - Report: orderId, filledAmount, outputReceived, txHash
      - Oracle updates order status + fill %
```

### Human Approval (Between Ticks)

CRE never blocks. Approval happens outside the workflow:

```
1. User submits large trade → Oracle creates order (status: PENDING_APPROVAL)
2. CRE tick → asks Oracle → Oracle says WAIT (needs approval)
3. User opens Approve page → sees pending trade
4. User clicks Approve with World ID → frontend verifies → Oracle marks APPROVED
5. Next CRE tick → asks Oracle → Oracle now says SWAP
```

### CRE Simulator Service

```bash
#!/bin/bash
# meridian-cre-loop.sh
cd /home/claude/code/meridian-fx/meridian-cre
export BASE_RPC="..." ARC_RPC="..." UNISWAP_API_KEY="..."

while true; do
  echo "[$(date)] Running CRE tick..."
  cre workflow simulate treasury --broadcast 2>&1 | tee -a /tmp/cre-loop.log
  echo "[$(date)] Tick complete. Sleeping 55s..."
  sleep 55
done
```

---

## 3. Contract Change: SwapExecutor.withdraw()

**One-line change** — allow CRE to withdraw swapped tokens back to treasury:

```solidity
// Before (line 121):
function withdraw(address token, uint256 amount) external onlyOwner {

// After:
function withdraw(address token, uint256 amount) external {
    require(msg.sender == owner() || msg.sender == creForwarder, "Not authorized");
```

This lets the CRE workflow call withdraw() after each swap to return output tokens to the treasury wallet. Owner can still withdraw manually too.

**Redeploy required:** Yes, but quick — same deploy script, update address in constants.ts + config.json.

---

## 4. Phase 2A — Real Trading MVP (MUST DO, 5-6 hours)

### Safety Gate
After 2A: users submit trades, CRE executes them with real swaps, multi-source pricing validates rates, and swapped tokens return to treasury. Working end-to-end.

### 4.1 SwapExecutor Contract Update
- Modify withdraw() to allow CRE (see Section 3)
- Redeploy to Base mainnet
- Update address in constants.ts, config.json, README.md

### 4.2 Oracle Server: Trade Orders + Price Oracle

**Extend:** `apps/oracle/src/index.ts`

**New SQLite table:**
```sql
CREATE TABLE trade_orders (
  id TEXT PRIMARY KEY,
  from_token TEXT NOT NULL,       -- 'USDC' | 'EURC'
  to_token TEXT NOT NULL,
  input_amount TEXT NOT NULL,     -- Raw 6-decimal string
  filled_amount TEXT DEFAULT '0',
  output_received TEXT DEFAULT '0',
  deadline INTEGER NOT NULL,      -- Unix timestamp
  status TEXT DEFAULT 'PENDING',  -- PENDING | PENDING_APPROVAL | APPROVED | FILLING | COMPLETE | CANCELLED
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**New REST endpoints:**
```
POST   /api/trades              Create trade order
GET    /api/trades              List orders (filter by status)
GET    /api/trades/:id          Order detail with fill %
POST   /api/trades/:id/approve  Mark as approved (after World ID)
POST   /api/trades/:id/cancel   Cancel order
PATCH  /api/trades/:id/fill     Update fill (called by CRE)

GET    /api/strategy/next       CRE calls this: what to do this tick?
                                Returns { action, orderId, chunkAmount, minOutput }

GET    /api/prices/comparison   Multi-source price comparison
                                { chainlink, fynd, uniswap, divergenceBps, avg24h }
```

**Multi-source price oracle (moved from 2B):**
- Already recording: Chainlink feeds (4 feeds) + Fynd quotes (every 30s)
- Add: Uniswap Trade API spot price (GET quote for 1 USDC → EURC)
- New column in recordings table: `source TEXT` (chainlink/fynd/uniswap)
- Comparison endpoint computes divergence + 24h average

### 4.3 CRE Workflow Update

**Edit:** `meridian-cre/treasury/workflow.ts`

Replace the current hardcoded logic with Oracle-driven flow:
1. HTTP GET Oracle /api/strategy/next
2. If action=WAIT → return "WAIT"
3. If action=SWAP → read balances, executeSwap, withdraw, logExecution, POST fill
4. Return "EXECUTED:{orderId}"

### 4.4 Frontend: Trade Form + Real Balances

**New page:** `apps/app/src/app/(app)/trade/page.tsx`

Trade form:
- From/To currency toggle (USDC ↔ EURC)
- Amount input (with display multiplier preview)
- Deadline selector (1h / 4h / 24h / custom)
- Preview panel:
  - Expected output at current rate
  - 24h price range bar (high/low/expected)
  - Estimated number of swap chunks
- Submit button → POST to Oracle API + transfer to SwapExecutor

**New page:** `apps/app/src/app/(app)/trades/page.tsx`

Open trades list:
- Each trade: pair, amount, filled %, output received, deadline countdown
- Fill progress bar (animated)
- Status badge (PENDING / FILLING / COMPLETE)
- Cancel button

**Edit dashboard:** Show real wallet balances (treasury) alongside SwapExecutor balances (in-execution):
- Add ERC-20 balanceOf reads for deployer wallet
- Treasury = wallet balance, In Execution = SwapExecutor balance, Total = sum

**Edit nav:** Add Trade tab (between Dashboard and Approve)

### 4.5 CRE Simulator Service

Create `meridian-cre/run-simulator.sh`:
- Bash loop: simulate --broadcast, sleep 55, repeat
- Logs to /tmp/cre-loop.log
- Can run as background process or systemd service

### 4.6 Fallback Paths

| Component | Fallback |
|-----------|----------|
| Oracle API too slow | Hardcode 2 demo orders, skip DB |
| Uniswap price feed fails | Use Fynd + Chainlink only (2 sources still good) |
| CRE withdraw fails | Skip step 3c, funds stay in executor (manual withdraw later) |
| Trade form too complex | Minimal form: just amount + submit, skip preview |

---

## 5. Phase 2B — Smart Execution (SHOULD DO, 4-5 hours)

### Safety Gate
After 2B: system makes intelligent timing decisions, users see strategy reasoning, can cancel trades.

### 5.1 Timing Score Calculator

**New file:** `apps/oracle/src/strategy.ts`

Composite score (0-100):
- **Price vs 24h average** (40%): current rate below avg = good time to buy EURC
- **Source divergence** (20%): low divergence across 3 sources = high confidence
- **Urgency** (40%): (time_elapsed / total_time) * (amount_remaining / total_amount)

```
score > 70 → SWAP (normal chunk)
score > 85 → SWAP (larger chunk, 2x normal)
score < 70 → WAIT (unless urgency > 80, then force execute)
```

Chunk sizing: `base_chunk = total_remaining / ticks_remaining`
Adjusted: `chunk = base_chunk * score_multiplier`

### 5.2 Enhanced Oracle /api/strategy/next

Now uses timing score instead of simple "has orders?" check:
1. Get all FILLING + APPROVED orders
2. For each: compute timing score
3. Pick highest-score order
4. Calculate chunk size based on score
5. Return { action, orderId, chunkAmount, minOutput, score, reason }

### 5.3 Trade Detail UI

Per-trade view showing:
- Current timing score (color: red/yellow/green)
- Strategy reason: "Waiting — rate 0.3% above 24h avg" / "Executing — favorable rate"
- Fill history timeline (list of executed chunks with timestamps)
- Cancel with confirmation

### 5.4 Price Comparison Dashboard Widget

On the main dashboard, add a price comparison card:
- 3 prices side by side (Chainlink, Fynd, Uniswap)
- Divergence indicator (green if < 5bps, yellow if 5-20bps, red if > 20bps)
- 24h chart overlay (all 3 sources)

### 5.5 Fallback
If timing score too complex: simple linear TWAP — split total evenly across remaining ticks. No intelligence, but still shows chunked execution.

---

## 6. Phase 2C — Optimal Strategy Engine (STRETCH, 3-4 hours)

### 6.1 TWAP Chunking with Dynamic Sizing

Replace linear chunks with adaptive:
```
urgency_factor = 1.0 + 2.0 * (time_elapsed / total_time)^2  // exponential near deadline
score_factor = score / 70  // normalize around threshold
chunk = base_chunk * urgency_factor * score_factor
```

### 6.2 Desired Output Mode

User says "I want 4,000 EURC":
- Estimate input: desired_output / current_rate * 1.02 (2% buffer)
- Transfer estimated input to SwapExecutor
- Execute until output target reached
- Withdraw excess input back to treasury

### 6.3 Strategy Decision Logging

```sql
CREATE TABLE strategy_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT,
  timestamp INTEGER,
  action TEXT,        -- EXECUTE | WAIT | SKIP
  reason TEXT,
  score INTEGER,
  chunk_size TEXT,
  price TEXT
);
```

Surface as expandable timeline in trade detail UI.

### 6.4 Fallback
Skip entirely. 2A + 2B deliver a complete demo.

---

## 7. Parallel Execution Plan

```
HOUR  AGENT 1 (Backend)         AGENT 2 (Frontend)           AGENT 3 (CRE + Contract)
----  -------------------       --------------------         -----------------------
0     Oracle trade API           Trade form page              SwapExecutor withdraw fix
      (SQLite + 6 endpoints)     (form + preview)             Redeploy to Base
                                                              Update addresses
                                                              
1     Add Uniswap price feed     Trade list page              CRE workflow rewrite
      Price comparison endpoint  (fills, countdown, cancel)   (Oracle-driven flow)
                                                              
2     /api/strategy/next         Wire submit to Oracle API    CRE simulator loop script
      (basic: has orders?)       Wire balances (wallet+exec)  Test: end-to-end tick
                                                              
3     === INTEGRATION TEST: Submit trade → CRE executes → UI shows fill ===
      === PHASE 2A SAFETY GATE ===
      
4     Timing score calculator    Price comparison widget      (Support/debug)
      Enhanced strategy/next     Trade detail with score      
      
5     Score-based chunk sizing   Fill history timeline        CRE reads score from Oracle
                                 Cancel trade flow            
                                 
6     === INTEGRATION TEST: Score affects execution timing ===
      === PHASE 2B SAFETY GATE ===
      
7+    Strategy logging           Strategy log UI              Adaptive chunking
      Desired output mode        Output mode form             Excess return flow
      === PHASE 2C (if time) ===
```

### What Can Run in Parallel

All 3 agents can start simultaneously. The only dependency:
- Agent 2 (Frontend) needs API endpoint shapes from Agent 1 — agree on request/response formats before starting
- Agent 3 (CRE) needs /api/strategy/next to exist — can mock it initially

---

## 8. New Shared Types

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
```

---

## 9. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| SwapExecutor redeploy fails | Blocks everything | Same deploy script, tested before. 15 min max. |
| Oracle API takes > 2h | Delays all tracks | It's 6 Hono routes + 1 SQLite table. Very fast. |
| CRE can't call withdraw() | Funds stay in executor | Skip withdraw, manual recovery via owner. Not blocking. |
| Uniswap API rate limited | Lose 1 price source | Still have Fynd + Chainlink. Degrade gracefully. |
| Time runs out at 2A | Lose smart execution | 2A safety gate = working demo. Ship it. |

---

## 10. Success Criteria

### 2A (MUST) — Working Trade System
- [ ] SwapExecutor redeployed with CRE withdraw
- [ ] User submits trade via UI → Oracle creates order
- [ ] CRE simulator picks up order → executes swap → withdraws to treasury
- [ ] 3 price sources recording (Chainlink + Fynd + Uniswap)
- [ ] UI shows real wallet + executor balances
- [ ] UI shows trade with fill % updating

### 2B (SHOULD) — Smart Execution
- [ ] Timing score visible per trade
- [ ] CRE uses score to decide when/how much to swap
- [ ] Price comparison widget on dashboard
- [ ] Cancel trade returns funds

### 2C (STRETCH) — Optimal Strategy
- [ ] Adaptive chunk sizing based on urgency + score
- [ ] Desired output mode works
- [ ] Strategy decision log in UI

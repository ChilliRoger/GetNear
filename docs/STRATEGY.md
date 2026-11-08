# GetNear — Strategy Engine & Adaptive TWAP Specification

## 1. Overview

GetNear is an autonomous corporate treasury FX execution engine designed for teams operating on NEAR Protocol. It automates foreign exchange conversions (primarily USDC &rarr; EURe) through an **Adaptive Time-Weighted Average Price (TWAP)** strategy driven by a dynamic **0–100 Timing Score**.

Rather than splitting an order into uniform mechanical chunks regardless of market conditions, GetNear actively observes real-time cross-chain solver quotes against official macroeconomic reference rates, waiting when market spreads are adverse and scaling up execution sizes when market pricing or urgency dictates.

> [!IMPORTANT]
> **Honest Disclosures & Limitations**:
> - **No Alpha Claims**: The strategy engine is an execution-pacing and slippage-minimization tool, NOT a speculative or predictive trading model. It does not predict future exchange rates.
> - **Testnet & Simulated Accounting**: All quotes are fetched live via 1Click with strict `dry: true`. Fills on NEAR testnet are simulated and recorded for accounting and governance auditability.

---

## 2. Market Inputs

The strategy engine continuously ingests two independent real-time data sources:

1. **Quote Source (`OneClickQuoteSource`)**:
   - Provider: [1Click API](https://1click.chaindefuser.com) by Defuse Protocol.
   - Endpoint: `POST https://1click.chaindefuser.com/v0/quote` with `dry: true`.
   - Asset IDs:
     - Origin: USDC on NEAR (`nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`, 6 decimals)
     - Destination: EURe on Gnosis (`nep141:gnosis-0x420ca0f9b9b604ce0fd9c18ef134c705e5fa3430.omft.near`, 18 decimals)
   - Outputs: Quoted output amount, effective rate, quote expiry, time estimate, correlation ID, and Ed25519 signature.

2. **Reference Rate Source (`FrankfurterReferenceSource`)**:
   - Provider: [Frankfurter API](https://frankfurter.dev) (European Central Bank official daily reference rates).
   - Endpoint: `GET https://api.frankfurter.dev/v1/latest?from=USD&to=EUR`.
   - Provenance: European Central Bank (ECB) daily reference rates.
   - Requirement: **No reference rate = strategy must WAIT**.

---

## 3. Timing Score Formula (40 / 20 / 40)

Every tick (default 30s), the engine evaluates the composite timing score:

$$\text{Total Score} = \text{round}(0.40 \cdot S_{\text{price}} + 0.20 \cdot S_{\text{div}} + 0.40 \cdot S_{\text{urg}})$$

### 3.1 Price vs Rolling Average Score ($S_{\text{price}}$, 40% Weight)

Measures whether the current quote rate is favorable relative to recent historical observations:

$$\text{deviationPct} = \frac{\text{quoteRate} - \text{avg24hRate}}{\text{avg24hRate}} \times 100$$

$$S_{\text{price}} = \text{clamp}\left(50 + \frac{\text{deviationPct}}{0.50} \times 50,\; 0,\; 100\right)$$

- Deviation = $0\% \implies S_{\text{price}} = 50$ (neutral).
- Favorable deviation $\ge +0.50\% \implies S_{\text{price}} = 100$.
- Adverse deviation $\le -0.50\% \implies S_{\text{price}} = 0$.

### 3.2 Divergence Score ($S_{\text{div}}$, 20% Weight)

Measures quote alignment and spread relative to the official ECB reference rate:

$$\text{deviationBps} = \text{round}\left(\frac{\text{quoteRate} - \text{referenceRate}}{\text{referenceRate}} \times 10{,}000\right)$$

- If $\text{deviationBps} \ge 0$ (quote matches or beats reference rate): $S_{\text{div}} = 100$.
- If $\text{deviationBps} < 0$ (paying spread/fees):

$$S_{\text{div}} = \text{clamp}\left(100 - \frac{|\text{deviationBps}|}{\text{maxDeviationBps}} \times 100,\; 0,\; 100\right)$$

*Example: With a 120 bps budget, an observed -90 bps spread yields $S_{\text{div}} = 100 - (90/120 \times 100) = 25$.*

### 3.3 Urgency Score ($S_{\text{urg}}$, 40% Weight)

Accelerates as the order's deadline approaches, ensuring treasury orders do not expire unfilled:

$$\text{timeProgress} = \text{clamp}\left(\frac{\text{now} - \text{createdAt}}{\text{deadline} - \text{createdAt}},\; 0,\; 1\right)$$

$$\text{remainingRatio} = \text{clamp}\left(\frac{\text{inputAmount} - \text{filledAmount}}{\text{inputAmount}},\; 0,\; 1\right)$$

$$S_{\text{urg}} = \text{clamp}\left(\text{timeProgress}^2 \times \text{remainingRatio} \times 100,\; 0,\; 100\right)$$

The quadratic acceleration ($\text{timeProgress}^2$) keeps urgency low in early stages to allow opportunistic price-hunting, while ramping steeply in the final 20% of the window.

---

## 4. Decision Thresholds

| Timing Score Range | Action | Chunk Multiplier | Operational Rationale |
| :--- | :--- | :--- | :--- |
| **Score $\ge 85$** | `EXECUTE` | **2x Chunk** | Exceptional market condition: quote is favorable vs reference and historical average; execute aggressive size while spread is tight. |
| **Score $70 - 84$** | `EXECUTE` | **1x Chunk** | Normal market condition: conditions are within risk tolerance; execute standard TWAP chunk. |
| **Score $< 70$** | `WAIT` | **0x Chunk** | Sub-optimal market conditions: adverse spread or low urgency; hold capital and wait for better liquidity. |
| **Urgency $\ge 85$** | `EXECUTE` | **1x Chunk** | **Urgency Override**: Regardless of raw score, deadline pressure forces execution to prevent order expiry. |

---

## 5. Hard Execution Guards

Before any chunk can execute, the engine evaluates mandatory pre-condition guards. If **any** guard fails, the action immediately defaults to `WAIT`:

1. **Active Order Guard**:
   Order status must be `Active` (or `APPROVED` / `FILLING`). Orders that are `Pending` (awaiting Sputnik DAO council approval), `Expired`, or `Cancelled` are never filled.
2. **Reference Rate Availability Guard**:
   Reference rate must be positive and non-null. If Frankfurter API is offline and no cache is valid, the strategy halts.
3. **Quote Freshness Guard**:
   Quote timestamp must not be expired ($\text{now} \le \text{quote.expiresAt}$).
4. **Max Adverse Deviation Guard**:
   If $\text{deviationBps} < -\text{order.maxDeviationBps}$ (e.g. adverse spread exceeds the order's 120 bps limit), execution is blocked.

---

## 6. Adaptive Chunk Sizing

The chunk size is dynamically computed at each execution tick:

$$\text{baseChunk} = \frac{\text{remainingAmount}}{\text{estimatedTicksRemaining}}$$

$$\text{urgencyMultiplier} = 1.0 + \text{timeProgress}^2$$

$$\text{scoreMultiplier} = \begin{cases} 2.0 & \text{if score} \ge 85 \\ 1.0 & \text{if score} \ge 70 \\ 0.5 & \text{if score} < 70 \end{cases}$$

$$\text{rawChunk} = \text{baseChunk} \times \text{urgencyMultiplier} \times \text{scoreMultiplier}$$

### Clamping Bounds:
1. **Upper Bound**: Clamped to order's `maxChunkIn` (default $20\%$ of total order) to enforce order dispersion.
2. **Remaining Cap**: Clamped to `remainingAmount` so the order is never overfilled.
3. **Route Minimum ($5.00 USDC)**:
   - Probed in Block P5 (`docs/ROUTE_MINIMUMS.md`).
   - If $\text{chunk} < 5{,}000{,}000\text{ atomic}$, clamped up to $5{,}000{,}000\text{ atomic}$.
   - **Dust Sweep Exception**: If $\text{remainingAmount} < 5{,}000{,}000\text{ atomic}$, the entire remaining balance is swept into the final chunk.

---

## 7. Decision Log & API Endpoints

Every tick is recorded in the SQLite database (`prices.db`) in table `strategy_decisions`:

```sql
CREATE TABLE strategy_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  order_id TEXT,
  score INTEGER NOT NULL,
  action TEXT NOT NULL,           -- 'EXECUTE' | 'WAIT'
  reason TEXT NOT NULL,
  price_score INTEGER,
  divergence_score INTEGER,
  urgency_score INTEGER,
  chunk_amount TEXT,
  chunk_multiplier INTEGER,
  quote_id TEXT,
  deviation_bps INTEGER,
  quote_rate REAL,
  reference_rate REAL
);
```

### Exposed Endpoints:
- `GET /api/strategy/next`: Evaluates the current market and next active order, computes score and chunk size, records to SQLite, and returns structured decision.
- `GET /api/strategy/decisions?limit=100`: Returns chronological decision log for dashboard transparency.
- `GET /api/strategy/config` & `PUT /api/strategy/config`: Reads and updates runtime risk thresholds.


---
name: strategy-engine
description: How the GetNear timing score and adaptive TWAP work — inputs, formula, decision thresholds, decision log.
---

# Strategy Engine Skill

Located in `apps/oracle/src/`.

## Timing Score Formula (40/20/40)

- **Price component (40%)**: how much the current quote rate deviates from the 24h rolling average. Closer to average = higher score.
- **Divergence component (20%)**: difference between 1Click quote rate and reference FX rate (basis points). Lower divergence = higher score.
- **Urgency component (40%)**: time elapsed / total deadline duration. More urgent = higher score.
- **Total**: weighted sum, 0–100.

## Decision Thresholds

- Score >= 85: EXECUTE aggressively (2x chunk size)
- Score 70–84: EXECUTE normally (1x chunk size)
- Score < 70: WAIT

## Hard Guards (never execute if any of these fail)

- deviationBps > order.maxDeviationBps -> WAIT
- No reference rate available -> WAIT
- Quote is expired -> WAIT
- Order is not Active -> WAIT
- Contract is paused -> WAIT

## Adaptive TWAP

Chunk size = base chunk x urgency ramp (quadratic). Clamped to:
- Order's maxChunk
- Remaining amount
- Route minimum from P5
- Contract's max_chunk_in limit

## Decision Log

SQLite table, one row per tick. Fields: timestamp, order_id, score (with breakdown), decision (WAIT/EXECUTE), reason, chunk_size, quote_id, deviation_bps.

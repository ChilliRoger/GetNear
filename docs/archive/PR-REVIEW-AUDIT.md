# PR Review Audit: PRs #43–52

**Date:** 2026-04-04
**Scope:** All Gemini Code Assist reviews on merged PRs #43 through #52
**Purpose:** Identify any review feedback that was never addressed before merge

---

## Executive Summary

Across 10 merged PRs, Gemini Code Assist left **31 inline review comments** spanning 11 unique reviews. Of those 31 comments:

- **8 ADDRESSED** — fix commits were pushed and merged before or alongside the PR
- **23 MISSED / NEW-UNADDRESSED** — merged without fixes

PRs #43–46 had automated triage comments posted by `claude-do` and received targeted fix commits. PRs #47–52 had **zero triage and zero fix commits** — every single review comment on those PRs was merged as-is.

---

## Per-PR Breakdown

### PR #43 — `feat: Unlink privacy sidecar` (4 comments)

| # | File | Severity | Status | Detail |
|---|------|----------|--------|--------|
| 1 | `unlink-client.ts` L33 | HIGH | **ADDRESSED** | ESM `require()` replaced with dynamic `import()` in fix commit `897729b` |
| 2 | `routes/demo.ts` L143 | HIGH | **PARTIALLY ADDRESSED** | Empty `calls[]` documented as intentional (no DEX on Sepolia) but the withdraw-same-amount bug was not fixed |
| 3 | `routes/transactions.ts` L7 | MEDIUM | **MISSED** | `Number()` on non-numeric string still produces `NaN` → crashes SQLite. Code still reads `Math.min(Number(c.req.query("limit") || 50), 200)` — the `|| 50` fallback is on the raw string, not the parsed number |
| 4 | `index.ts` L20 | MEDIUM | **MISSED** | CORS origin array still includes `"*"` wildcard alongside specific origins |

### PR #44 — `feat: strategy decision log` (2 comments)

| # | File | Severity | Status | Detail |
|---|------|----------|--------|--------|
| 1 | `dashboard/page.tsx` L45 | MEDIUM | **ADDRESSED** | `setInterval` replaced with `setTimeout` polling in fix commit `4be0faa` |
| 2 | `dashboard/page.tsx` L268 | MEDIUM | **ADDRESSED** | Hardcoded "USDC" label replaced with dynamic `from_token` in fix commit `4be0faa` |

### PR #45 — `feat: privacy mode frontend` (4 comments)

| # | File | Severity | Status | Detail |
|---|------|----------|--------|--------|
| 1 | `privacy-hooks.ts` L43 | HIGH | **ADDRESSED** | Unsafe `json.balances \|\| json` replaced with `Array.isArray()` guard in fix commit `5b1742f` |
| 2 | `privacy-hooks.ts` L73 | HIGH | **ADDRESSED** | Same fix applied to transactions hook in `5b1742f` |
| 3 | `privacy-hooks.ts` L50 | MEDIUM | **MISSED** | No AbortController or mounted flag added — hooks still lack unmount cleanup |
| 4 | `privacy-tx-history.tsx` L59 | MEDIUM | **MISSED** | `toLocaleTimeString()` still used — causes Next.js hydration mismatch |

### PR #46 — `feat: desired output mode` (3 comments)

| # | File | Severity | Status | Detail |
|---|------|----------|--------|--------|
| 1 | `oracle/index.ts` L510 | HIGH | **ADDRESSED** | Hardcoded `0.87` fallback removed in fix commit `aa5876c` — now returns error |
| 2 | `oracle/index.ts` L620 | HIGH | **MISSED** | Strategy still returns `'WAIT'` instead of `'COMPLETE_OUTPUT'` when output target is met. The type in `shared/types.ts` defines the action but oracle never uses it |
| 3 | `trade/page.tsx` L419 | MEDIUM | **MISSED** | TARGET badge still hides actual order status. Code: `trade.mode === "OUTPUT" ? "TARGET" : trade.status` |

### PR #47 — `feat: adaptive TWAP` (3 comments)

| # | File | Severity | Status | Detail |
|---|------|----------|--------|--------|
| 1 | `strategy.ts` L306 | HIGH | **MISSED** | BigInt-to-Number conversion has no `MAX_SAFE_INTEGER` guard — silent precision loss possible on large amounts |
| 2 | `TradeOrdersTable.tsx` L62 | MEDIUM | **MISSED** | `computeChunkPlan` duplicates strategy logic from backend. **Worse: dev-UI uses `TICK_INTERVAL=60` while backend uses `TICK_INTERVAL=30`** — the preview is already wrong |
| 3 | `strategy.ts` L313 | MEDIUM | **MISSED** | Magic numbers `85`, `70`, `2.0`, `1.0`, `0.5` for score multiplier thresholds not extracted to constants |

### PR #48 — `fix: mobile responsiveness polish` (1 comment)

| # | File | Severity | Status | Detail |
|---|------|----------|--------|--------|
| 1 | `hooks.ts` L43 | MEDIUM | **MISSED** | Interval clear/restart on every poll flagged as redundant. Not fixed — and PR #49 made it worse (see below) |

### PR #49 — `fix: error handling` (8 comments)

| # | File | Severity | Status | Detail |
|---|------|----------|--------|--------|
| 1–4 | `hooks.ts` L42,83,131,170 | **CRITICAL** | **MISSED** | All 4 polling hooks use `setInterval` + recursive `startPolling()` — creates overlapping intervals that grow exponentially. Gemini flagged this as CRITICAL on all 4 instances. The pattern: `setInterval → load().then(() → clearInterval → startPolling())` means a new interval is created before the old one fires its callback, leading to request stacking |
| 5 | `dashboard/page.tsx` L48 | MEDIUM | **MISSED** | `oracleOffline` state declared but never set in `useStrategyLatest`. It IS wired in `usePriceData` (line 131) but the strategy hook's offline state is dead code |
| 6–8 | `hooks.ts` L17,58,106,145 | MEDIUM | **MISSED** | `ReturnType<typeof setInterval>` should be `ReturnType<typeof setTimeout>` if switching to setTimeout pattern |

### PR #50 — `fix: polish pass` (1 comment)

| # | File | Severity | Status | Detail |
|---|------|----------|--------|--------|
| 1 | `getnear-logo.tsx` L41 | LOW | **MISSED** | Array destructuring suggestion for center coordinates — cosmetic only |

### PR #51 — `fix: demo-critical polish` (9 comments, 2 review rounds)

| # | File | Severity | Status | Detail |
|---|------|----------|--------|--------|
| 1 | `approve/page.tsx` L161 | HIGH | **MISSED** | Fee basis points `130` and `5` are magic numbers, duplicated between approve and dashboard pages |
| 2 | `dashboard/page.tsx` L413 | HIGH | **MISSED** | Same fee magic numbers defined inside `.map()` callback — redeclared per iteration |
| 3 | `approve/page.tsx` L128 | MEDIUM | **MISSED** | IIFE in JSX could be extracted to variable; comment has logic error about rate direction |
| 4 | `dashboard/page.tsx` L59 | MEDIUM | **MISSED** | Polling interval `10000` is magic number |
| 5 | `settings/page.tsx` L37 | MEDIUM | **MISSED** | Polling interval `30000` is magic number |
| 6 | `settings/page.tsx` L248 | MEDIUM | **MISSED** | Rate band bounds `0.60` and `1.40` are magic numbers used in 4+ places |
| 7 | `dashboard/page.tsx` L409 | **HIGH** | **MISSED** | **effectiveRate calculation ignores different decimal scales** — USDC is 6 decimals, EURC is 18. Dividing raw `Number(filled) / Number(output)` produces nonsensical rates. Currently shows near-zero for cross-decimal trades |
| 8 | `dashboard/page.tsx` L451 | **HIGH** | **MISSED** | `formatDisplayAmountFromString(filledAmt)` called without currency parameter — defaults to 6 decimals (USD). If `from_token` is EURC (18 decimals), amount display is completely wrong |
| 9 | `approve/page.tsx` L127 | MEDIUM | **MISSED** | Trade direction determined by `rate >= 1` — unreliable for stablecoin pairs that fluctuate around 1.0 |

### PR #52 — `fix: final polish` (3 comments)

| # | File | Severity | Status | Detail |
|---|------|----------|--------|--------|
| 1 | `dashboard/page.tsx` L168 | MEDIUM | **MISSED** | `useTickingTimeAgo` duplicates logic from existing `formatTimeAgo` utility |
| 2 | `dashboard/page.tsx` L185 | MEDIUM | **MISSED** | Time formatting only handles seconds and minutes — no hours/days support for stale data |
| 3 | `dashboard/page.tsx` L213 | MEDIUM | **MISSED** | `useTickingTimeAgo` called at top level of `DashboardPage` — triggers full re-render every second across entire component tree |

---

## Severity Summary

| Category | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 4 | Exponential polling interval growth in all 4 data hooks |
| **HIGH — Actually Important** | 5 | Decimal scaling bug, COMPLETE_OUTPUT missing, BigInt overflow risk, wrong amount formatting, fee duplication |
| **HIGH — Acceptable Risk** | 1 | Demo swap withdraw-same-amount (only matters for demo, Sepolia has no DEX) |
| **MEDIUM** | 13 | Magic numbers, missing cleanup, hydration mismatch, cosmetic improvements |
| **LOW** | 1 | Array destructuring style suggestion |

---

## Critical Items Requiring Immediate Action

### 1. CRITICAL: Exponential Polling in `hooks.ts` (PR #49)
**All 4 hooks** (`useBalances`, `usePolicy`, `useRecentTrades`, `usePriceData`) use the dangerous `setInterval` + recursive `startPolling()` pattern. Each poll creates a new interval before the previous one is cleared, causing exponential request growth. This will progressively hammer the API and degrade the browser tab.

**Fix:** Replace `setInterval` with recursive `setTimeout` — schedule next poll only after current one completes.

### 2. HIGH: effectiveRate Decimal Scaling Bug (PR #51)
`const effectiveRate = filled > 0 && output > 0 ? (filled / output) : 0` divides raw bigint-derived numbers without normalizing for different decimal scales (USDC=6, EURC=18). The displayed rate is meaningless for cross-token trades.

**Fix:** Normalize both amounts to their actual decimal scale before dividing.

### 3. HIGH: formatDisplayAmountFromString Missing Currency (PR #51)
`formatDisplayAmountFromString(filledAmt)` defaults to 6 decimals. EURC amounts (18 decimals) will display as astronomically large numbers.

**Fix:** Pass currency parameter based on `trade.from_token`.

### 4. HIGH: COMPLETE_OUTPUT Never Returned (PR #46)
The strategy engine returns `'WAIT'` when output target is met, but the type system defines `'COMPLETE_OUTPUT'`. The execution engine may never know to stop trading.

**Fix:** Return `'COMPLETE_OUTPUT'` when output target is satisfied.

### 5. HIGH: BigInt Precision Loss (PR #47)
`Number(remainingAmount)` silently loses precision above `Number.MAX_SAFE_INTEGER`. For 6-decimal tokens this caps at ~9B tokens (probably fine), but for 18-decimal tokens the raw amounts easily exceed this.

**Fix:** Add safety check before conversion, or use BigInt arithmetic throughout.

---

## Items Safe to Defer (Post-Hackathon)

- Magic number extraction (fees, intervals, rate bands, score thresholds)
- `useTickingTimeAgo` dedup and hours/days support
- AbortController cleanup in privacy hooks
- Hydration mismatch from `toLocaleTimeString()`
- CORS wildcard cleanup (dev-only service)
- dev-UI TICK_INTERVAL desync (dev tool only)
- Trade direction detection reliability
- Full-page re-render from per-second timer

---

## Conclusion

The triage-and-fix workflow worked well for PRs #43–46 (8 of 13 comments addressed). But PRs #47–52 received **zero triage** — all 18 comments were merged unread. The most dangerous finding is the exponential polling bug in `hooks.ts` (4 instances), which will cause visible performance degradation in any sustained browser session. The decimal scaling and `COMPLETE_OUTPUT` bugs affect correctness of displayed data and trade completion logic respectively.

**Recommended priority:** Fix the 5 critical/high items listed above before the hackathon demo. Everything else can wait.

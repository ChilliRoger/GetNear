# Meridian FX Phase 2 — Frontend Design Plan

## Design System Reference

**Existing tokens (tailwind.config.ts):**
- Background: `#0a0a0a` (`bg-background`)
- Surface: `#141414` (`bg-surface`), hover: `#1a1a1a` (`bg-surface-hover`)
- Border: `#262626` (`border-border`)
- Text: `#fafafa` (`text-foreground`), muted: `#a3a3a3` (`text-muted`)
- Accent blue: `#3b82f6`, green: `#22c55e`, amber: `#f59e0b`, red: `#ef4444`

**New token needed in tailwind.config.ts:**
- `accent.teal: "#00d4aa"` — used for the teal accent mentioned in the brief but missing from config. Use for the demo clock and price source indicators.

**Existing reusable pieces:**
- `Card` component (title, subtitle, badge with color, children, className)
- `RateSparkline` (recharts AreaChart, gradient fill, 64px tall)
- `BalanceRow` pattern (token label left, amount right, skeleton loading)
- `PolicyStat` pattern (centered value + label below)
- `DetailRow` pattern (label above, value below, optional color)
- Badge colors: blue/green/amber/red with `bg-accent-X/15 text-accent-X`
- `font-tabular` class for numeric alignment
- `pulse-subtle` animation for pending indicators
- `card-glow` hover effect on cards
- `animate-fade-in` for entry animations
- `Skeleton` pattern (`animate-pulse rounded bg-border`)

**Charting:** recharts is installed. The existing sparkline uses `AreaChart`, `Area`, `ResponsiveContainer`, `YAxis`. The dev-ui PricesPage uses `LineChart`, `Line`, `AreaChart`, `Area`, `XAxis`, `YAxis`, `Tooltip`, `ReferenceLine`. All Phase 2 charts should use recharts.

**Layout constraint:** This is a mobile-first mini-app. Content is constrained to `max-w-lg` (32rem / 512px). Bottom nav is fixed. Header is sticky. Main content has `pb-24 pt-4 px-4`.

---

## 1. Updated Dashboard Page

### Current Layout (top to bottom)
1. Savings banner (green border)
2. Rate card with sparkline
3. Balance cards (2-col grid: Execution Capital | Treasury Ledger)
4. Active policy (3-col grid)
5. Recent trades list

### New Layout (top to bottom)

**Section A: Demo Clock + Savings Banner**
- The demo clock is a fixed overlay (see Section 4), not part of page flow.
- Keep the savings banner but make it dynamic: fetch cumulative savings from Oracle API. Show "Cumulative Savings" label left, animated counter value right. Keep the green border accent.
- If no real savings data yet, show "$0" with a muted "(calculating...)" note.

**Section B: Price Comparison Widget (NEW)**
- A new `Card` with title "Price Sources" and badge "LIVE" in green.
- Three inline rows inside the card, one per source:
  ```
  [Chainlink icon]  Chainlink    1.0823    — (reference)
  [Fynd icon]       Fynd         1.0821    -0.2 bps
  [Uniswap icon]    Uniswap      1.0825    +0.2 bps
  ```
- Each row: `flex items-center justify-between py-2 border-b border-border/50 last:border-0`
- Source name: `text-xs font-medium text-foreground`
- Price: `font-tabular text-sm font-semibold text-foreground`
- Divergence: `font-tabular text-[10px]` — green if <3 bps, amber if 3-10 bps, red if >10 bps
- Icons: small colored dots (8px) — blue for Chainlink, teal for Fynd, purple (#a855f7) for Uniswap. These are just `<span className="h-2 w-2 rounded-full bg-accent-blue" />` etc.
- Below the rows: a mini sparkline overlay chart (48px tall) showing all 3 price lines in the last 1h. Use `LineChart` with 3 `Line` elements, each matching the source dot color. No axes, no labels — just the visual pattern.
- Below chart: `text-[10px] text-muted` showing "Avg divergence: X.X bps" and "vs 24h avg: +X.XX%"

**Section C: Rate Card (enhanced)**
- Keep existing rate card structure.
- Replace mock `currentRate` data with live Oracle data.
- The sparkline now shows real 24h history from Oracle API.
- Add below the sparkline: a thin horizontal bar showing 24h high/low range with current position marker. This reuses the visual pattern from the settings page rate band control:
  ```
  24h Range: 1.0789 ─────●───── 1.0832
  ```
  Implementation: `relative h-1.5 rounded-full bg-border` container, `absolute h-full rounded-full bg-accent-blue/30` for the range fill, and a `h-2.5 w-2.5 rounded-full border-2 border-accent-blue bg-background` dot positioned at current price percentage.

**Section D: Balance Cards (restructured)**
- Change the 2-col grid labels:
  - Left card: "Treasury" (subtitle "Wallet") — shows deployer wallet USDC + EURC balances. These are the real on-chain balances of the treasury wallet.
  - Right card: "In Execution" (subtitle "SwapExecutor") — shows SwapExecutor contract USDC + EURC balances. Badge "ACTIVE" in blue if any funds are in the executor.
- Each card keeps the existing `BalanceRow` pattern.
- Add a thin "Total" row at the bottom of each card: `border-t border-border/50 pt-1.5 mt-1.5`, showing combined USDC + EURC in USD equivalent, muted text.
- Color treatment: Treasury card gets a subtle left border accent `border-l-2 border-l-accent-green/40`. Execution card gets `border-l-2 border-l-accent-blue/40`.

**Section E: Active Trades Summary (NEW — replaces recent trades)**
- Card title "Open Trades" with a count badge (amber if >0, green "0" if none).
- If trades exist: show top 2-3 trades as compact rows:
  ```
  USDC → EURC   $5,000,000   ████████░░ 78%   2h 14m left
  USDC → EURC   $2,000,000   ███░░░░░░░ 30%   5h 45m left
  ```
  Each row: `flex items-center justify-between py-2.5 border-b border-border/50`
  - Left: pair label + amount
  - Center: progress bar (inline, 48px wide). `relative h-1.5 w-12 rounded-full bg-border` container, inner div with `bg-accent-teal` fill width set via style percentage. Color: teal for <80%, green for >=80%, amber for deadline <1h.
  - Right: fill percentage `font-tabular text-xs` + countdown `text-[10px] text-muted`
- Footer link: "View all trades →" in `text-accent-blue text-xs` linking to `/trades`.
- If no active trades: "No open trades" centered message with a "New Trade →" link.

**Section F: Active Policy (keep as-is)**
- No changes to the policy card. It already reads on-chain data.

**Section G: Recent Activity (condensed)**
- Rename from "Recent Trades" to "Recent Activity".
- Keep the existing trade row format but now fed by Oracle API instead of mock data.
- Limit to last 3 entries. Add "View history →" link to `/trades?tab=completed`.

### Components to Create/Modify
- **New:** `PriceComparisonWidget` component
- **New:** `ActiveTradesSummary` component  
- **New:** `usePriceComparison()` hook (polls `GET /api/prices/comparison` every 10s)
- **New:** `useTrades()` hook (polls `GET /api/trades?status=FILLING,PENDING` every 5s)
- **Modify:** `dashboard/page.tsx` — new section ordering
- **Modify:** `useBalances()` — add treasury wallet balances (second address)

---

## 2. New Trade Page (`/trade`)

### Route
`apps/app/src/app/(app)/trade/page.tsx`

### Layout — Top to Bottom, Mobile-First

**Header area:**
- Page title "New Trade" with subtitle "Submit an order for TWAP execution"
- No card wrapper for the header — just `div` with text.

**Section A: Token Direction Toggle**
- A prominent toggle showing the trade direction.
- Full-width rounded container (`rounded-xl border border-border bg-surface p-4`):
  ```
  ┌─────────────────────────────────────────────┐
  │  From                              To        │
  │  ┌──────────────┐    →    ┌──────────────┐  │
  │  │  $ USDC      │         │  € EURC      │  │
  │  └──────────────┘         └──────────────┘  │
  └─────────────────────────────────────────────┘
  ```
- "From" and "To" tokens are shown as pill buttons with currency symbol and token name.
- A swap arrow button between them (using the `↕` pattern from dev-ui but rotated to `↔`): `rounded-lg border border-border bg-background px-2 py-1 text-muted hover:text-accent-blue hover:border-accent-blue transition-colors`. On click, swap the pair.
- Since only USDC/EURC pair exists, this is really a direction toggle. The active "From" token pill gets `border-accent-blue bg-accent-blue/10`.

**Section B: Amount Input**
- Large amount input field inside a Card.
- Card title: "Amount" with the display multiplier context as subtitle: "x1M display multiplier"
- The input:
  ```
  ┌─────────────────────────────────────────────┐
  │  $ [          5          ]  USDC             │
  │    ↳ Displays as $5,000,000                  │
  └─────────────────────────────────────────────┘
  ```
- Input: `w-full rounded-lg border border-border bg-background px-3 py-3 font-tabular text-xl text-foreground text-center outline-none focus:border-accent-blue transition-colors`
- Below input: display multiplier preview in `text-[10px] text-accent-blue font-tabular` showing the formatted display amount.
- Quick-pick buttons row: `$1M`, `$5M`, `$10M`, `$50M` as small pill buttons. Each is `rounded-full border border-border bg-background px-3 py-1.5 text-[10px] font-medium text-muted hover:border-accent-blue hover:text-accent-blue transition-colors`. On click, set the raw amount.
- The quick picks use display amounts but set the corresponding raw values.

**Section C: Deadline Selector**
- Card title: "Execution Window"
- Three option buttons in a row (segmented control pattern):
  ```
  [ 1 hour ] [ 4 hours ] [ 24 hours ]
  ```
- Implementation: `flex gap-2` with each button `flex-1 rounded-lg border py-2.5 text-center text-xs font-medium transition-colors`.
- Selected: `border-accent-blue bg-accent-blue/10 text-accent-blue`
- Unselected: `border-border bg-background text-muted hover:text-foreground`
- Below the selector: helper text `text-[10px] text-muted` — "Order will be split into chunks and executed over this window"

**Section D: Price Preview**
- Card title: "Execution Preview" with badge "ESTIMATE" in blue.
- **Price range bar** (most important visual):
  ```
  24h Price Range
  Low 1.0789 ────────●──── 1.0832 High
                   1.0823 (current)
  Expected output: ~€4,618,000
  ```
  The bar: `relative h-2 rounded-full bg-border` with a gradient fill from green-left to amber-right. A white dot marker at the current price position. Labels at extremes in `text-[10px] text-muted font-tabular`.

- **Output estimate row:**
  ```
  You send        $5,000,000 USDC
  You receive     ~€4,618,000 EURC
  Rate            1.0823 USDC/EURC
  Est. chunks     ~6 swaps over 4h
  ```
  Four rows using `DetailRow` pattern (already exists in approve page). Grid of 2 columns on larger displays: `grid grid-cols-2 gap-3`.

- **Estimated chunks visualization** (nice-to-have, skip if tight on time):
  A tiny timeline showing expected execution points:
  ```
  Now─────●─────●─────●─────●─────●─────●──4h
  ```
  Dots represent estimated chunk executions. Use `flex items-center gap-1` with small dots and a thin line behind them.

**Section E: Submit Button + Confirmation**
- Primary action button, full width:
  `flex w-full items-center justify-center gap-2 rounded-xl bg-accent-blue py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-blue/90 active:scale-[0.98] disabled:opacity-50`
  Label: "Submit Trade Order"

- On click: show a confirmation overlay (not a separate page). This is a modal-like panel that slides up:
  ```
  ┌─────────────────────────────────────────────┐
  │  Confirm Trade Order                        │
  │                                              │
  │  Send    $5,000,000 USDC                    │
  │  Expect  ~€4,618,000 EURC                   │
  │  Window  4 hours                             │
  │  Rate    1.0823 (±0.5% slippage)             │
  │                                              │
  │  ⚠ Funds will be transferred to the          │
  │  SwapExecutor contract for TWAP execution.   │
  │                                              │
  │  [  Cancel  ]  [  Confirm & Transfer  ]      │
  └─────────────────────────────────────────────┘
  ```
  Background: `fixed inset-0 z-50 bg-background/80 backdrop-blur-sm`. Panel: `absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-border bg-surface p-6 animate-slide-up`.
  
  Need to add `@keyframes slide-up` to globals.css:
  ```css
  @keyframes slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
  .animate-slide-up { animation: slide-up 0.2s ease-out; }
  ```

  Cancel button: `flex-1 rounded-xl border border-border py-3 text-sm font-medium text-muted`
  Confirm button: `flex-1 rounded-xl bg-accent-blue py-3 text-sm font-semibold text-white`

- After confirm: show loading state on button, then redirect to `/trades` on success or show error inline.

### Components to Create
- **New:** `trade/page.tsx`
- **New:** `TokenDirectionToggle` component (or inline)
- **New:** `PriceRangeBar` component (reusable — also used on dashboard)
- **New:** `TradeConfirmSheet` component (bottom sheet overlay)
- **New:** `useCreateTrade()` hook (POST /api/trades + token transfer)
- **New:** `usePricePreview()` hook (GET /api/prices/comparison for current rate + range)

---

## 3. Trades List Page (`/trades`)

### Route
`apps/app/src/app/(app)/trades/page.tsx`

### Layout

**Header:**
- Page title "Trades" with subtitle "Track your open and completed orders"
- Tab toggle: `[ Open ]  [ Completed ]` — segmented control, same style as deadline selector.
  Selected: `border-accent-blue bg-accent-blue/10 text-accent-blue`
  Unselected: `border-border text-muted`

**Open Trades Tab:**
Each trade is a Card component with the following internal structure:

```
┌──────────────────────────────────────────────────┐
│  USDC → EURC                     ● FILLING       │
│  TRD-a1b2c3                                      │
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │████████████████████░░░░░░░░░░│ 68%          │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
│  Input        $5,000,000    Filled    $3,400,000  │
│  Output       ~€3,138,000   Rate avg  1.0822      │
│                                                    │
│  ⏱ 2h 14m remaining                    [Cancel]   │
│                                                    │
│  ▼ View details                                    │
└──────────────────────────────────────────────────┘
```

**Progress bar:** This is the centerpiece visual element.
- Container: `relative h-3 w-full rounded-full bg-border overflow-hidden`
- Fill: `absolute left-0 top-0 h-full rounded-full transition-all duration-500`
- Fill color logic:
  - `bg-accent-teal` (or `bg-[#00d4aa]` since teal may not be in config yet) for normal progress
  - `bg-accent-green` when fill >= 90%
  - `bg-accent-amber` when deadline < 1 hour and fill < 80%
  - `bg-accent-red` when deadline expired and not complete
- Fill width: `style={{ width: \`${fillPct}%\` }}`
- Percentage label: `font-tabular text-xs font-semibold text-foreground` to the right of the bar.
- Subtle animation: the fill bar uses `transition-all duration-500 ease-out` so it smoothly grows as fills come in.

**Status badges:**
- `PENDING`: amber badge — `bg-accent-amber/15 text-accent-amber`
- `FILLING`: blue badge — `bg-accent-blue/15 text-accent-blue` with a subtle pulse animation
- `COMPLETE`: green badge — `bg-accent-green/15 text-accent-green`
- `CANCELLED`: red badge — `bg-accent-red/15 text-accent-red`
- Badge format: `rounded-full px-2 py-0.5 text-[10px] font-medium` (matches existing Card badge pattern)

**Deadline countdown:**
- Shows as `⏱ Xh Ym remaining` in `text-xs text-muted`
- When < 1 hour: `text-accent-amber`
- When expired: `text-accent-red` showing "Expired"
- Uses the existing `formatTimeRemaining` helper pattern from mock-data.ts

**Cancel button:**
- Only shown for PENDING and FILLING status
- Small text button: `rounded-lg border border-accent-red/30 px-3 py-1.5 text-[10px] font-medium text-accent-red hover:bg-accent-red/10 transition-colors`
- On click: confirmation dialog (reuse the bottom sheet pattern from trade page). "Are you sure? X% has been filled. Remaining funds will be returned."

**Expandable detail view (click "View details"):**
- Toggle chevron `▼` / `▲`
- Expanded section slides in with `animate-fade-in`:
  ```
  Fill History
  ─────────────────────────────────
  #1  $850,000  @ 1.0821  2:14 PM    tx: 0xabc...
  #2  $850,000  @ 1.0823  2:24 PM    tx: 0xdef...
  #3  $850,000  @ 1.0819  2:34 PM    tx: 0x123...
  #4  $850,000  @ 1.0825  2:44 PM    tx: 0x456...
  ─────────────────────────────────
  Timing Score: 78/100 (if Phase 2B)
  Strategy: "Price below 24h avg, low divergence"
  ```
- Fill history rows: `flex items-center justify-between py-1.5 border-b border-border/30 text-[10px]`
- Chunk number: `text-muted w-6`
- Amount: `font-tabular text-foreground`
- Rate: `font-tabular text-muted`
- Time: `text-muted`
- Tx link: `text-accent-blue hover:underline` (links to BaseScan)

**Timing Score display (Phase 2B):**
- Circular score badge: small circle (28px) with the number inside
- Color coding: green (>70), amber (50-70), red (<50)
- Implementation: `flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold`
  - Score > 70: `bg-accent-green/15 text-accent-green`
  - Score 50-70: `bg-accent-amber/15 text-accent-amber`
  - Score < 50: `bg-accent-red/15 text-accent-red`

**Completed Trades Tab:**
- Same card layout but without progress bar, cancel button, or countdown.
- Show final fill amount, average rate achieved, total savings in bps.
- Green checkmark icon replacing the status badge.
- Completed trades are sorted newest first.

### Components to Create
- **New:** `trades/page.tsx`
- **New:** `TradeCard` component (the full trade card with progress bar)
- **New:** `FillProgressBar` component (reusable progress bar)
- **New:** `TradeDetailExpander` component (expandable fill history)
- **New:** `StatusBadge` component (reusable status pill — actually extend existing Card badge)
- **New:** `useTrades()` hook if not already created for dashboard (shared hook, polls Oracle API)

---

## 4. Demo Clock Overlay

### Component
`apps/app/src/components/demo-clock.tsx`

### Position and Layout
- Fixed position: `fixed top-3 right-3 z-50` (sits in the top-right, outside the main content flow but inside the viewport)
- Sits visually on top of the header. Since the header is `z-40`, the clock at `z-50` overlays correctly.
- Small pill shape: `flex items-center gap-2 rounded-full border bg-surface/95 backdrop-blur-md px-3 py-1.5 shadow-lg`

### Visual Design

**1x Speed (normal — subtle):**
```
┌─────────────────────────┐
│  🕐 14:32:07   1x       │
└─────────────────────────┘
```
- Clock icon: a small SVG clock face (14px), `text-muted`
- Time: `font-tabular text-xs text-muted` — ticks every second via `setInterval(1000)`
- Speed badge: `text-[10px] font-medium text-muted bg-border rounded px-1 py-0.5`
- Border: `border-border` (default, subtle)
- The whole element is intentionally understated at 1x. It should not steal attention.

**10x Speed (fast forward — attention-grabbing):**
```
┌─────────────────────────┐
│  ⚡ 14:32:07  10x       │
└─────────────────────────┘
```
- Lightning icon replaces clock: `text-accent-green`
- Time: `font-tabular text-xs text-accent-green` — still ticks every second but the displayed time advances 10x faster (Oracle controls the "demo time", frontend just shows it)
- Speed badge: `text-[10px] font-bold text-accent-green bg-accent-green/15 rounded px-1 py-0.5` with `pulse-subtle` animation
- Border: `border-accent-green/40` — green glow
- Add a subtle box shadow: `shadow-[0_0_12px_rgba(34,197,94,0.15)]`
- The entire pill has `animate-pulse` at a very slow rate (3s cycle) to draw attention to the speed-up.

### Interaction
- Click on the pill to toggle speed.
- On click: POST `/api/demo/speed` with `{ speed: currentSpeed === 1 ? 10 : 1 }`
- While the POST is in flight, show a brief opacity transition: `opacity-70` then back to `opacity-100`.
- No hover tooltip needed — the badge makes the current state clear.

### Animation for Speed Switch
- When switching from 1x to 10x: brief scale-up effect `transform scale-110` for 200ms, then settle back. Use a CSS transition triggered by a state change.
- When switching from 10x to 1x: brief fade-dim `opacity-50` for 200ms, then settle.
- The border color transitions smoothly: `transition-all duration-300`.

### Data Source
- New hook: `useDemoSpeed()` — polls `GET /api/demo/speed` every 5s.
- The hook returns `{ speed: 1 | 10, sleep: number }` and a `toggle()` function.
- The clock time comes from the demo mode API. If the Oracle provides a "demo time" field, use that. Otherwise, use real local time.

### Placement in Layout
- Add `<DemoClock />` to `apps/app/src/app/(app)/layout.tsx`, right after the `<header>` element but before `<main>`.
- It renders as a fixed-position element, so it doesn't affect page flow.
- Only renders if `DEMO_MODE=true` (check via an env variable or an API endpoint).

---

## 5. Price Comparison Widget (Detailed)

This was described in Section 1 (dashboard), but here is the full standalone spec since it may appear on both the dashboard and trade page.

### Component
`apps/app/src/components/price-comparison.tsx`

### Two Variants

**Compact (dashboard):**
- Used in the dashboard as Section B.
- Card wrapper with title "Price Sources" and "LIVE" green badge.
- Three source rows + mini sparkline overlay (48px) + avg divergence text.
- Total height: ~180px.

**Expanded (trade page preview):**
- Used inside the trade page's "Execution Preview" section.
- Same three rows but with additional context:
  - Each row also shows "last updated Xs ago"
  - Below the rows: current best price highlighted with a green border accent
- No mini sparkline (the trade page has its own price range bar).

### Source Row Pattern
```tsx
<div className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
  {/* Source indicator dot */}
  <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
  {/* Source name */}
  <span className="text-xs font-medium text-foreground w-20">{name}</span>
  {/* Price */}
  <span className="font-tabular text-sm font-semibold text-foreground flex-1 text-right">
    {price.toFixed(4)}
  </span>
  {/* Divergence from reference */}
  <span className={`font-tabular text-[10px] w-16 text-right ${divColor}`}>
    {divergence > 0 ? '+' : ''}{divergence.toFixed(1)} bps
  </span>
</div>
```

Dot colors:
- Chainlink: `bg-accent-blue` (blue, #3b82f6)
- Fynd: `bg-[#00d4aa]` (teal)
- Uniswap: `bg-[#a855f7]` (purple — add to config as `accent.purple` or use inline)

Divergence text colors:
- |bps| < 3: `text-accent-green`
- |bps| 3-10: `text-accent-amber`
- |bps| > 10: `text-accent-red`

The first source (Chainlink) shows "ref" instead of a bps number since it is the reference price. Use `text-muted text-[10px]` for "ref".

### Mini Overlay Chart (compact variant only)
- 48px tall recharts `LineChart` with `ResponsiveContainer`.
- Three `Line` elements, each `dot={false}`, `strokeWidth={1.5}`:
  - Chainlink: `stroke="#3b82f6"`
  - Fynd: `stroke="#00d4aa"`
  - Uniswap: `stroke="#a855f7"`
- No axes, no tooltip. Purely visual comparison of the three lines.
- Y-axis domain: auto with tight padding so small divergences are visible.
- Data: last 1 hour of readings, fetched from `/api/prices/comparison` history (or interpolated from the Oracle price history).

### Placement
- **Dashboard:** Section B, always visible.
- **Trade page:** Inside the "Execution Preview" card, expanded variant.
- **Dev-UI:** A more detailed version lives in the dev-ui (see Section 7).

---

## 6. Updated Navigation

### Current State
3 tabs: Dashboard, Approve, Settings. The `tabs` array in `nav.tsx` drives the bottom bar. Each tab gets equal `flex-1` width.

### New State
5 tabs: Dashboard, Trade, Trades, Approve, Settings.

### Fitting 5 Tabs
At 512px max width, 5 equal tabs = ~102px each. This is tight but workable for mobile. The key is to use short labels and compact icons.

**Tab definitions:**
```typescript
const tabs = [
  { labelKey: "nav.dashboard", href: "/dashboard", icon: DashboardIcon },
  { labelKey: "nav.trade",     href: "/trade",     icon: TradeIcon },
  { labelKey: "nav.trades",    href: "/trades",    icon: TradesIcon },
  { labelKey: "nav.approve",   href: "/approve",   icon: ApproveIcon },
  { labelKey: "nav.settings",  href: "/settings",  icon: SettingsIcon },
];
```

**Label text (EN):**
- Dashboard → "Home" (shorter)
- Trade → "Trade"
- Trades → "Orders" (avoids confusion with "Trade")
- Approve → "Approve"
- Settings → "Settings"

**Why not combine Trade + Trades?**
They serve fundamentally different purposes: Trade is a form (create), Trades is a list (monitor). Combining them would create awkward UX with a tab-within-a-tab. Separate pages are cleaner.

**Nav bar adjustments:**
- Reduce padding: change `py-3` to `py-2` on each tab link.
- Label font: keep `text-xs` but consider `text-[10px]` if 5 labels feel cramped. Test both.
- Icon size: keep 20x20 SVGs.
- The active indicator bar (`h-0.5 w-12 rounded-b bg-accent-blue`) narrows to `w-8` to not overlap adjacent tabs.

### New Icons

**TradeIcon (create new trade — a "+" with arrows):**
```tsx
function TradeIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
         className={active ? "text-accent-blue" : "text-muted"}>
      {/* Swap arrows forming a circular pattern */}
      <path d="M6 7l3-3 3 3" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 4v8" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" />
      <path d="M14 13l-3 3-3-3" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 16V8" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" />
    </svg>
  );
}
```
This creates two vertical arrows (up and down) suggesting a swap/exchange action.

**TradesIcon (list of orders — stacked lines with progress):**
```tsx
function TradesIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
         className={active ? "text-accent-blue" : "text-muted"}>
      {/* Three horizontal bars suggesting a list with varying fill */}
      <rect x="3" y="4" width="14" height="2.5" rx="1" stroke="currentColor"
            strokeWidth="1.5" />
      <rect x="3" y="9" width="10" height="2.5" rx="1" stroke="currentColor"
            strokeWidth="1.5" />
      <rect x="3" y="14" width="7" height="2.5" rx="1" stroke="currentColor"
            strokeWidth="1.5" />
    </svg>
  );
}
```
This creates three bars of decreasing width, suggesting a list of orders with varying fill levels — a visual metaphor for the order progress bars.

### i18n Keys to Add
```json
{
  "nav.dashboard": "Home",
  "nav.trade": "Trade",
  "nav.trades": "Orders",
  "nav.approve": "Approve",
  "nav.settings": "Settings"
}
```

---

## 7. Dev-UI Dashboard

### Context
The dev-ui is a separate Vite + React app at `apps/dev-ui/`. It currently has tabs: Quote, Prices, Depth, Book. Phase 2 adds two new tabs: Oracle and CRE.

### New Tab: "Oracle"

**Oracle Readings Panel:**
```
┌─────────────────────────────────────────────────┐
│  ORACLE READINGS                      [LIVE ●]  │
│                                                   │
│  Pair        Chainlink   Fynd      Uniswap  Div  │
│  ─────────────────────────────────────────────── │
│  EURC/USD    1.0823     1.0821    1.0825   0.04% │
│  ETH/USD     3,421.50   3,420.80    —      0.02% │
│  BTC/USD     68,450.00     —        —        —   │
│                                                   │
│  Last updated: 3s ago                             │
└─────────────────────────────────────────────────┘
```
- Use a `<table>` with `text-sm`. Dev-UI can be more utilitarian.
- Header row: `text-[0.65rem] uppercase tracking-wide text-muted`
- Data cells: `font-semibold text-text` for prices, colored divergence.
- "LIVE" indicator: green dot + text, pulses.
- Auto-refresh every 10s via polling `/api/oracle/prices/current` (same endpoint as existing PricesPage).

**Trade Orders Table:**
```
┌───────────────────────────────────────────────────────────────┐
│  TRADE ORDERS                                    [Seed Demo]  │
│                                                                │
│  ID          Pair         Amount      Fill%  Status    Deadline │
│  ─────────────────────────────────────────────────────────── │
│  a1b2c3d4    USDC→EURC   $5,000,000   68%   FILLING   2h 14m  │
│  e5f6g7h8    USDC→EURC   $2,000,000   30%   FILLING   5h 45m  │
│  i9j0k1l2    EURC→USDC   $1,000,000   100%  COMPLETE  —       │
│  m3n4o5p6    USDC→EURC   $10,000,000  0%    PENDING   23h 59m │
│                                                                │
│  Total open: 3   Total volume: $18M   Avg fill: 49%          │
└───────────────────────────────────────────────────────────────┘
```
- Standard table. Status uses inline colored text (no badge pill needed for dev-UI).
- Fill% uses a thin inline progress bar (2px high) below the percentage text.
- "Seed Demo" button: calls `POST /api/demo/seed` — styled as a `bg-accent border-accent` button.
- Clicking a row shows the raw JSON in a `<pre>` block below.

**Strategy Score Panel (Phase 2B):**
```
┌─────────────────────────────────────────────────┐
│  CURRENT STRATEGY STATE                          │
│                                                   │
│  Timing Score:  [====78====]  78/100              │
│  Breakdown:                                       │
│    Price vs 24h avg  ███████░  32/40 (below avg) │
│    Source divergence ████████░ 17/20 (low div)   │
│    Urgency          █████░░░░ 29/40 (moderate)   │
│                                                   │
│  Next action: SWAP                                │
│  Chunk size: $850,000 (normal)                   │
│  Reason: "Price 0.12% below 24h avg, 3 sources   │
│          agree within 4bps"                       │
└─────────────────────────────────────────────────┘
```
- Horizontal bar charts for each score component.
- Bars use `bg-ok` fill on `bg-border` track.
- Raw JSON toggle for the full strategy response.

### New Tab: "CRE"

**CRE Run History:**
```
┌────────────────────────────────────────────────────────────────────┐
│  CRE RUNS                                          [10x ⚡] [1x] │
│                                                                     │
│  #    Time       Action  Order     Chunk      Result  Dur    Tx     │
│  ──────────────────────────────────────────────────────────────── │
│  47   14:32:07   SWAP    a1b2c3   $850,000   OK      2.1s   0xab.. │
│  46   14:31:12   SWAP    a1b2c3   $850,000   OK      1.8s   0xcd.. │
│  45   14:30:17   WAIT    —        —          —       0.1s   —      │
│  44   14:29:22   SWAP    e5f6g7   $400,000   OK      2.3s   0xef.. │
│  43   14:28:27   SWAP    a1b2c3   $850,000   FAIL    0.5s   —      │
│  ...                                                                │
│                                                                     │
│  Next tick in: 47s  [████████████░░░░░░░] 47/55                    │
└────────────────────────────────────────────────────────────────────┘
```
- Table layout. Rows alternate very subtly (`odd:bg-bg/50`).
- Result column: "OK" in green, "FAIL" in red, "SKIP" in amber.
- Tx hash: clickable link to BaseScan in blue.
- Speed toggle buttons in the top-right: two buttons, active one highlighted with `bg-accent`.
- Errors: if `error` field is present, the row has `border-l-2 border-l-danger`. Click to expand and see the error text.

**Countdown Timer:**
- Prominent bar below the table header.
- Shows: "Next tick in: Xs" with a horizontal progress bar that depletes.
- Bar: `h-1.5 rounded-full bg-accent` that shrinks from right to left.
- Width: `style={{ width: \`${(remaining/total)*100}%\` }}`
- At 1x speed: total=55s. At 10x: total=5s.
- When the tick fires: brief green flash on the bar, then reset.
- Timer uses a `setInterval(1000)` that decrements a counter. When the CRE runs table refreshes with a new entry, reset the timer.

**Live Log Stream (optional, nice-to-have):**
- A terminal-style panel at the bottom.
- Dark background `bg-bg`, monospace font, scrollable.
- Polls `/tmp/cre-loop.log` tail via a dev endpoint, or subscribes to CRE run events.
- Each line color-coded: green for success, red for error, gray for WAIT.
- Max height 200px with overflow-y scroll.
- This is a stretch goal for the dev-UI. If time is tight, skip it.

### Tab Configuration Update
```typescript
type Tab = 'quote' | 'prices' | 'depth' | 'book' | 'oracle' | 'cre'
```
That is 6 tabs. On mobile (480px), this gets tight. Options:
1. Wrap to 2 rows of 3 (simple, recommended)
2. Make tabs scrollable horizontally
3. Group: combine oracle + cre into one "ops" tab with sub-panels

**Recommendation:** Use a 2-row grid for the dev-UI tabs since it is a developer tool and compactness is not as critical:
```
[ Quote ] [ Prices ] [ Depth ]
[ Book  ] [ Oracle ] [  CRE  ]
```
Implementation: `grid grid-cols-3 gap-1 mb-4` instead of `flex gap-1`.

---

## 8. New CSS Additions for globals.css

```css
/* Bottom sheet slide-up animation */
@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.animate-slide-up {
  animation: slide-up 0.2s ease-out;
}

/* Speed mode glow for demo clock */
@keyframes speed-glow {
  0%, 100% { box-shadow: 0 0 8px rgba(34, 197, 94, 0.2); }
  50% { box-shadow: 0 0 16px rgba(34, 197, 94, 0.4); }
}
.animate-speed-glow {
  animation: speed-glow 2s ease-in-out infinite;
}

/* Progress bar fill animation */
.progress-fill {
  transition: width 0.5s ease-out;
}

/* Countdown bar depletion */
.countdown-bar {
  transition: width 1s linear;
}
```

## 9. New Tailwind Config Additions

```typescript
// In theme.extend.colors.accent:
teal: "#00d4aa",
purple: "#a855f7",
```

These are needed for the Uniswap and Fynd source indicators, and for the trade progress bars.

---

## 10. Formatting Conventions

**All monetary amounts:**
- Use `formatDisplayAmount()` from `@meridian/shared` — this handles the x1M multiplier.
- Raw amounts in the input fields show the actual on-chain value (e.g., "5").
- Display amounts show the multiplied value (e.g., "$5,000,000").
- Always use `font-tabular` class for numeric values.

**Rates:**
- 4 decimal places: `1.0823`
- Use `font-tabular` class.
- Change indicators: green for positive, red for negative, with `+`/`-` prefix.

**Basis points:**
- Show as `X.X bps` for small values, or `X.XX%` for percentage display.
- Color: green < 3bps, amber 3-10bps, red > 10bps.

**Time:**
- Countdowns: "Xh Ym" or "Xm" format.
- Timestamps: relative ("2h ago") for recent, absolute time for older.
- All times in user's timezone (Eastern Time per CLAUDE.md).

**Token amounts:**
- USD amounts: `$X,XXX,XXX` format with dollar sign.
- EUR amounts: `€X,XXX,XXX` format with euro sign.
- No decimal places for display amounts (they're in millions).

---

## 11. Component Inventory Summary

### New Components
| Component | File | Used By |
|-----------|------|---------|
| `DemoClock` | `components/demo-clock.tsx` | Layout (all pages) |
| `PriceComparison` | `components/price-comparison.tsx` | Dashboard, Trade page |
| `PriceRangeBar` | `components/price-range-bar.tsx` | Dashboard, Trade page |
| `FillProgressBar` | `components/fill-progress-bar.tsx` | Trades page, Dashboard |
| `TradeCard` | `components/trade-card.tsx` | Trades page |
| `TradeConfirmSheet` | `components/trade-confirm-sheet.tsx` | Trade page |
| `StatusBadge` | (extend Card badge) | Trades page |

### New Pages
| Page | File |
|------|------|
| Trade form | `app/(app)/trade/page.tsx` |
| Trades list | `app/(app)/trades/page.tsx` |

### New Hooks
| Hook | File | Polls |
|------|------|-------|
| `usePriceComparison` | `lib/hooks.ts` | `GET /api/prices/comparison` every 10s |
| `useTrades` | `lib/hooks.ts` | `GET /api/trades` every 5s |
| `useDemoSpeed` | `lib/hooks.ts` | `GET /api/demo/speed` every 5s |
| `useCreateTrade` | `lib/hooks.ts` | `POST /api/trades` (on demand) |

### Modified Files
| File | Changes |
|------|---------|
| `nav.tsx` | Add Trade + Trades tabs, new icons, 5-tab layout |
| `layout.tsx` | Add `<DemoClock />` |
| `dashboard/page.tsx` | Reorganize sections, wire to Oracle API |
| `globals.css` | Add slide-up, speed-glow, progress animations |
| `tailwind.config.ts` | Add teal + purple accent colors |
| `lib/hooks.ts` | Add new hooks |

### Dev-UI Changes
| File | Changes |
|------|---------|
| `App.tsx` | Add Oracle + CRE tabs, 2-row grid layout |
| `OraclePage.tsx` (new) | Oracle readings + trade orders + strategy |
| `CREPage.tsx` (new) | CRE run history + countdown + speed toggle |

---

## 12. Implementation Priority Order

Given this is a hackathon with ~15 hours:

**Hour 0-1 (Foundation):**
1. `tailwind.config.ts` — add teal/purple colors
2. `globals.css` — add new animations
3. `nav.tsx` — 5-tab layout with new icons
4. `demo-clock.tsx` — clock overlay component
5. New hooks skeleton (`usePriceComparison`, `useTrades`, `useDemoSpeed`)

**Hour 1-3 (Core Pages):**
6. `trade/page.tsx` — trade form with all sections
7. `TradeConfirmSheet` — bottom sheet confirmation
8. `trades/page.tsx` — trade list with progress bars
9. `FillProgressBar` component
10. `TradeCard` component

**Hour 3-4 (Dashboard Upgrade):**
11. `PriceComparison` component
12. `PriceRangeBar` component  
13. `dashboard/page.tsx` — reorganize with new components
14. Wire dashboard to Oracle API (replace mock data)

**Hour 4-5 (Dev-UI):**
15. `OraclePage.tsx` for dev-UI
16. `CREPage.tsx` for dev-UI
17. Update dev-UI `App.tsx` with new tabs

**Hour 5+ (Polish):**
18. Expanded trade detail view
19. Cancel confirmation flow
20. Timing score display (Phase 2B)
21. Animations and transitions polish

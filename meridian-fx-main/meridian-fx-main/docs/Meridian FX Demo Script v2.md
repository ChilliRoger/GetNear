# Meridian FX — Demo Video Script v2 (4 Minutes)

> **Format:** Creatively edited demo video, 4 minutes  
> **Target tracks:** Unlink ($3K Best Private App + $1K Most Creative Privacy), Uniswap ($10K Best API Integration), Chainlink CRE ($4K Best Workflow)  
> **Tone:** Conversational. You're walking someone through a live demo, not reading a teleprompter.

---

## VISUAL LANGUAGE KEY

Throughout this script, visual direction is tagged inline:

- **`[STATIC]`** — Pre-made overlay: diagram, slide, screenshot, headline. Shown while VO continues.
- **`[DEMO]`** — Live app walkthrough. Split-screen: app on left, dev dashboard on right.
- **`[TRANSITION]`** — Screen change between sections.

---

## [0:00–0:40] THE HOOK — TWO FAILURES, ONE DISASTER

**`[STATIC: Black screen. Silence. White text fades in slowly: "March 12, 2026." Hold for 2 beats.]`**

> Three weeks ago, someone swapped fifty million dollars of USDT for AAVE tokens.

**`[STATIC: CZ tweet screenshot slides in from right — "@cz_binance: Sad to see this. Liquidity is the best user protection." The quote tweet from @CryptoKaleo visible underneath: "20 days ago a fresh wallet received $50.4M USDT from Binance. Just a bit ago, they swapped the entire amount for 327 AAVE worth ~$36K routed through CoW Protocol via Sushiswap." Hold on this for the next line.]`**

> They got back thirty-six thousand dollars. Fifty million in. Thirty-six thousand out.

**`[STATIC: Crossfade to FinTech Weekly headline screenshot. Slow zoom into the subheading. Highlight — with a subtle box or underline animation — the words: "The Protocol Said It Worked Exactly as Designed."]`**

> And the protocol said it worked exactly as designed.

**`[STATIC: Hold on the headline for 2 beats of silence. Let the absurdity land.]`**

> How does fifty million become thirty-six thousand? Two failures at the same time.

**`[STATIC: Clean two-panel graphic slides in — left panel: "No Execution Strategy" / right panel: "No Privacy". Both panels visible throughout the next lines.]`**

> No execution strategy. The entire fifty million went into one swap, into a pool that couldn't handle it. No chunking, no timing, no slippage protection. Just one massive dump.

> And no privacy. That transaction was visible in the mempool before it even confirmed. MEV bots saw it coming, sandwiched it, and extracted millions in profit.

**`[STATIC: Sandwich attack diagram — three clean steps: "1. Attacker buys before" → "2. Victim's $50M swap" → "3. Attacker sells after". Simple arrows, no clutter.]`**

> If nobody knows you're about to move fifty million, nobody can position against you. This person had neither protection. And both of those failures are solvable.

---

## [0:40–1:00] THE PIVOT — ENTER MERIDIAN

**`[TRANSITION: Screen wipes to Meridian FX logo on clean background.]`**

> We built Meridian FX. It's an autonomous treasury agent for companies converting between stablecoins — think a European startup receiving USD from American customers and needing to pay suppliers in euros.

> It solves both of those failures. It checks three independent price sources before every trade. It splits large orders into timed chunks so you never blow up a pool. It hides your identity on-chain so nobody can front-run you. And when the amount is big enough, a real human still has to approve it.

**`[STATIC: High-level architecture diagram — Oracle (3 price feeds) → Chainlink CRE (labeled "Confidential Compute — strategy logic encrypted from node operators") → two execution paths: standard path to SwapExecutor (Uniswap V3, Base) and private path through Unlink Privacy Pool → SwapExecutor (Uniswap V3, Base Sepolia). Clean, three-column layout: Intelligence | Orchestration | Execution.]`**

> Let me show you how it actually works.

---

## [1:00–2:50] THE DEMO — LAYERED USER JOURNEYS

> *Presenter note: This is the core of the video. You're walking through a single end-to-end scenario that naturally hits every sponsor integration. The app is on the left, the dev dashboard is on the right showing logs and backend state in real time. You have flexibility to freestyle the technical explanation, but stay within the time boxes below.*

### Part A: Setting Up a Trade Order (~25 seconds) [1:00–1:25]

**`[DEMO: App — trade form. Dev dashboard — Oracle price panel showing live rates.]`**

> So I'm the treasury manager at a company that just received a hundred thousand USDC and needs to convert it to EURC. I open the trade form, and right away you can see the Oracle is already running — on the dev dashboard, it's pulling prices from three independent sources every thirty seconds.

> *(Point to dev dashboard: Chainlink price feed, Uniswap Trade API quote, Fynd DEX aggregator rate. Highlight divergence score.)*

> These three prices are being compared in real time. If they disagree by more than a few basis points, the agent won't trade — it waits until the sources converge. That's how you avoid executing into a mispriced pool.

> I'll set this up as a hundred-thousand USDC order with a 48-hour deadline. *(Submit the order.)*

### Part B: The CRE Engine + Adaptive TWAP (~35 seconds) [1:25–2:00]

**`[DEMO: App — order now active, showing chunk breakdown and strategy view. Dev dashboard — CRE tick logs streaming in real time.]`**

> Now watch the dev dashboard. The Chainlink CRE workflow just picked up this order. Every sixty seconds, it wakes up, calls our Oracle, and asks: should I trade right now?

> *(Point to CRE tick log: GET /api/strategy/next → response with timing score, action, chunk amount.)*

> The Oracle computes a timing score from zero to a hundred. It factors in rate deviation from the target, price momentum, and how close we are to the deadline. Right now the score is — *(read live score)* — so the agent is *(trading / waiting)*.

> And here's the key thing — this entire strategy computation runs through Chainlink's confidential compute. No node operator can see the trade parameters, the timing logic, or the API credentials. The strategy is private even from the infrastructure running it.

**`[STATIC: Quick overlay — "Confidential Compute: Strategy logic, API keys, and trade details are encrypted. No CRE node operator can inspect them." — show for ~4 seconds, then back to demo.]`**

> Because this is a hundred-thousand-dollar order, the TWAP engine split it into chunks. The early chunks are small and patient — the agent waits for good conditions. As the deadline approaches, the urgency ramp kicks in and the chunks get bigger. It's a quadratic function — never panic-dumps, but always meets the deadline.

> *(Point to chunk breakdown on app: chunk sizes, individual timing scores, urgency curve.)*

### Part C: Swap Execution + Privacy Mode (~40 seconds) [2:00–2:40]

**`[DEMO: App — first chunk ready to execute. Dev dashboard — CRE about to fire an execution.]`**

> The score just crossed the threshold. Watch the CRE log — it's reading the balance on the SwapExecutor contract on Base, confirming there's enough USDC, and now it's calling Uniswap's V3 router. *(Swap fires.)*

> *(Point to dev dashboard: executeSwap() call, tx hash appearing.)* There it is — real USDC swapped for EURC through Uniswap on Base. You can verify that transaction hash on Basescan right now.

> But here's the problem. *(Point to app or overlay.)* That swap is fully visible on-chain. Anyone watching the SwapExecutor address knows exactly which wallet just converted, how much, and when. If you're a company doing this every week, your competitors now know your cash flow schedule. And MEV bots can position against your next trade.

**`[DEMO: App — toggle Privacy Mode on. Dev dashboard — shows Unlink SDK initializing.]`**

> So we turn on privacy mode. Now instead of going straight to Uniswap, the agent routes through Unlink's privacy pool. Three steps.

> *(Walk through as it happens on the dev dashboard:)*

> Step one — deposit USDC into the Unlink pool. The blockchain sees funds entering the pool, but not which treasury sent them. Step two — execute the swap through Uniswap. The sender on-chain is the Unlink pool address, not our treasury. ZK proofs verify the transaction is valid without revealing who's behind it. Step three — withdraw the EURC back.

> An on-chain observer sees: *someone* withdrew from a privacy pool, swapped on Uniswap, deposited back. They don't know who. They can't front-run the next trade because they don't even know there will be one.

> *(Point to dev dashboard: commitment hash, Unlink pool address as sender, no treasury address visible.)*

### Part D: Large Trade Approval (~10 seconds) [2:40–2:50]

**`[DEMO: App — show the approval tab with a queued large trade awaiting manual sign-off.]`**

> And for trades above the policy threshold, the agent doesn't just execute. It queues the trade and the treasury manager reviews it right here — the amount, the rate, the timing score, the projected savings — and manually approves. Autonomous execution for routine trades. Human sign-off for the ones that matter.

---

## [2:50–3:25] THE ARCHITECTURE + NUMBERS

**`[STATIC: Full architecture diagram — polished version. Three pillars: Chainlink CRE (the brain, confidential compute), Uniswap V3 on Base (the execution venue), Unlink (the privacy layer). Oracle with 3 price feeds feeding into CRE. Show the private execution path clearly: CRE → Unlink Pool → Uniswap → Unlink Pool → Treasury.]`**

> So what's under the hood? Chainlink CRE is the brain — it's the decentralized workflow engine orchestrating everything. Every sixty seconds it wakes up, evaluates market conditions, and decides whether to trade. It runs in confidential compute, so the strategy logic, API keys, and trade details are encrypted even from the node operators running the infrastructure. Nobody can front-run the agent because nobody can see what it's about to do.

> Uniswap V3 on Base is the execution venue — deep USDC/EURC liquidity, zero-point-zero-five percent pool fees. And Unlink wraps the execution in privacy so the treasury's identity never touches the public chain.

**`[STATIC: Savings comparison table — clean slide.]`**

> The numbers. A company converting fifty thousand a month saves about seventy-five hundred a year versus bank rates. At five million a month, that's seventy-five thousand. At fifty million — the scale of that AAVE trade — over seven hundred thousand a year. And you're not losing forty-nine million to MEV bots, because nobody knows it's you.

---

## [3:25–3:55] THE CLOSE

**`[STATIC: Three sponsor logos side by side — Unlink, Uniswap, Chainlink CRE. Clean layout.]`**

> Three weeks ago, someone lost fifty million dollars because they had no execution strategy and no privacy. Everything was in one trade, and the whole market could see it coming.

> Meridian is the answer to that.

> Chainlink CRE is the brain — decentralized orchestration running in confidential compute, where not even the node operators can see your strategy.

> Uniswap is the execution — real liquidity, real settlement, zero-point-zero-five percent fees instead of one-point-three percent bank rates.

> And Unlink is the shield — your treasury's identity is hidden from the market. No front-running. No sandwich attacks. No competitors watching your cash flow.

**`[STATIC: Meridian FX logo. Clean. Confident.]`**

> Private. Autonomous. Human-verified when it matters. The treasury agent that would have saved fifty million dollars.

> Meridian FX. Team Ippo. ETHGlobal Cannes 2026.

**`[STATIC: URLs — app, dev console, GitHub. Hold for 3 seconds.]`**

---

## TIMING BUDGET

| Section | Duration | Content |
|---------|----------|---------|
| The Hook | 0:00–0:40 (40s) | Horror story, CZ tweet, FinTech Weekly headline, sandwich diagram |
| The Pivot | 0:40–1:00 (20s) | Meridian intro + architecture overview |
| Demo A: Trade Setup | 1:00–1:25 (25s) | Trade form + 3-source Oracle on dev dashboard |
| Demo B: CRE + TWAP | 1:25–2:00 (35s) | CRE ticks, timing scores, confidential compute, chunk breakdown |
| Demo C: Execution + Privacy | 2:00–2:40 (40s) | Live swap → privacy toggle → Unlink flow |
| Demo D: Approval | 2:40–2:50 (10s) | Approval tab for large trades |
| Architecture + Numbers | 2:50–3:25 (35s) | Polished diagrams + savings table |
| The Close | 3:25–3:55 (30s) | Callback to hook, sponsor summary, sign-off |
| URLs + buffer | 3:55–4:00 (5s) | End card |

---

## SPONSOR INTEGRATION CHECKLIST (for judges)

### Unlink Privacy Flow
- [ ] Privacy mode toggle shown in live demo
- [ ] Deposit into Unlink pool (commitment hash visible on dev dashboard)
- [ ] Swap executes with Unlink pool address as sender, not treasury
- [ ] Withdraw EURC back to treasury
- [ ] Dev dashboard confirms sender anonymity
- [ ] Narrative: privacy prevents MEV/sandwich attacks on treasury FX (core problem, not bolt-on)
- [ ] Base Sepolia testnet with at least one successful private transaction

### Uniswap API Integration
- [ ] Three-source price comparison shown on dev dashboard (Chainlink vs Fynd vs Uniswap Trade API)
- [ ] Live swap execution through Uniswap V3 with tx hash on Basescan
- [ ] Uniswap Trade API used for executable quote discovery (visible in dev dashboard logs)
- [ ] Real on-chain settlement shown
- [ ] Uniswap Developer Feedback Form completed

### Chainlink CRE Workflow
- [ ] CRE tick logs streaming on dev dashboard in real time
- [ ] Strategy decision shown: timing score, action, chunk amount
- [ ] CRE integrating Base (EVM reads/writes) with Oracle API (HTTP calls)
- [ ] Confidential compute highlighted — strategy logic and API keys encrypted from node operators
- [ ] CRE is the orchestration layer, not a bolt-on

### Approval Flow
- [ ] Large trade queued in approval tab
- [ ] Manual human sign-off shown
- [ ] Framed as safety layer preventing autonomous disaster

### Adaptive TWAP
- [ ] Chunk breakdown visible in app
- [ ] Urgency ramp explained (quadratic, never panic-dumps)
- [ ] Tied to the hook: "this is what prevents dumping $50M into one pool"

---

## EDITING + PRODUCTION NOTES

**Pacing:** The hook should be slow. No rush. Let the CZ tweet sit on screen while you deliver the numbers. Let "the protocol said it worked exactly as designed" hang in silence for a beat before moving on. The pivot picks up energy. The demo should feel natural — a person walking you through their product, occasionally pointing at the dev dashboard. The close brings it back down to confident and deliberate.

**No music.** This is dialogue and visuals only. The silence during the hook makes it hit harder.

**Split-screen during demo:** App takes ~60% of the screen width, dev dashboard takes ~40%. The dev dashboard should feel like "peeking behind the curtain" — it adds credibility without overwhelming.

**Screenshots for the hook (already captured):**
- CZ's tweet with the @CryptoKaleo quote tweet (Screenshot_2026-04-05_at_4_34_12_AM.png)
- FinTech Weekly headline: "The Protocol Said It Worked Exactly as Designed" (Screenshot_2026-04-05_at_4_32_30_AM.png)
- Sandwich attack diagram (pre-made, clean)

**Sponsor logo flashes:** Brief lower-third logo flash each time a sponsor integration fires during the demo. Uniswap logo when the swap executes. Chainlink logo when CRE ticks. Unlink logo when privacy mode activates. Subtle, not distracting.

**The callback:** Opens with the $50M story. Closes with "the treasury agent that would have saved fifty million dollars." Judges remember the first and last thing they hear.

**Freestyle zones:** During the demo sections (Parts A–D), the speaker should feel free to narrate naturally based on what's happening on screen. The script provides the beats to hit and the time box, but the exact words should feel unrehearsed. *Don't* read the script verbatim during demo sections — it'll sound stiff. *Do* rehearse the hook and close word-for-word — those are the polish moments.

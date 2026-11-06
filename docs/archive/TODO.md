# TODO

## Product Direction

### Price Sanity Check System
- Use Fynd quotes as a backup/sanity check against Chainlink price feeds
- Do NOT execute a swap unless the quoted price is within 0.1% of the Chainlink oracle price
- If prices diverge beyond threshold, block execution and flag for review

### Human Approval for Large Swaps
- Add a human-in-the-loop approval step before executing swaps above a configurable threshold
- Prevents catastrophic misquotes from going through unchecked

### Narrative / Why This Matters
A user swapped ~$50M through the Aave frontend, which routed through CoW Swap. The quote was badly mispriced and they received only ~$37K USD — a near-total loss. A two-layer sanity check (oracle cross-reference + human approval for large amounts) would have caught this before execution.

## Infrastructure

- [ ] Wire `app.omnipass.world` and `app-dev.omnipass.world` through Cloudflare Tunnel + Caddy
- [ ] Keep Fynd internal-only (no public hostname)

## App Scaffold

- [ ] Scaffold first TypeScript app in `apps/`
- [ ] App talks to Fynd at `http://localhost:3000` for quotes
- [ ] Integrate Chainlink price feed reads (on-chain or via API)
- [ ] Implement price comparison logic (Fynd quote vs Chainlink, 0.1% threshold)
- [ ] Add human approval workflow for swaps above configurable USD threshold
- [ ] Minimal quote smoke test against local Fynd

## Chainlink Booth Feedback (tell them in person)

- [ ] **CRE API key creation page needs mobile support** — the "Create API Key" button on cre.chain.link doesn't work on mobile browsers. Can't create a key from my phone at the hackathon.
- [ ] **CRE CLI needs headless login** — `cre login` requires a localhost redirect URI, which doesn't work from a phone or remote server. Need a device-code flow or API key auth path that works without a local browser.
- Good excuse to talk to the Chainlink devs and give real developer feedback from the hackathon floor.

## Later / Optional

- [ ] Narrow Fynd to Uniswap-only protocols (`--protocols uniswap_v2,uniswap_v3`)
- [ ] Custom worker pool tuning for Fynd
- [ ] `ops.omnipass.world` for dashboards/admin

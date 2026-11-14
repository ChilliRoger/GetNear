# Pre-deployment audit (2026-11-14)

Scope: whole repository, before deploying the dashboard with the Vercel CLI. Result: CI green locally
(lint, typecheck, all test suites, production build), legacy and mock code removed, deployment constraints documented.

## 1. CI failures on GitHub (fixed)

| Job | Cause | Fix |
| :--- | :--- | :--- |
| `ci / node 20 / 22 / 24` | `pnpm lint` failed on 4 ESLint errors in `apps/app` (unused imports `Clock`, `ShieldCheck`; unused variable `badgeTone`; an `any` in a component that was later deleted) plus 2 hook-dependency warnings | Removed the unused code; stabilised `events` in `live-feed.tsx` with `useMemo`; added the missing dependency in `i18n.tsx` |
| `ci / rust` | passing | none |

Verified locally: `next lint` clean, `tsc --noEmit` clean in every workspace, all test suites pass, `next build` succeeds.

## 2. Removed

**Mock / simulated code**
- `MockQuoteSource`, `MockReferenceRateSource`, `MockExecutor`, `MockApprovalGate` (`packages/shared`).
- The `GETNEAR_MODE=mock` default and `DEMO_MODE` flag (config, tests, `.env.example`, docs).
- The oracle's fake order engine: simulated `trade_orders`, the 15 s "dynamic fill" loop, mock approvals, `cre_runs`, demo speed, and the unauthenticated strategy-config writer. The oracle is now a read-only market recorder.
- `apps/app/src/lib/mock-data.ts`, `contracts.ts`, `hooks.ts` (mock contract state, never imported).

**Dead code**
- 13 unused modules in `apps/app` (old recharts analytics components, demo clock, scramble text, sparkline, helper libs).
- Unused exports in `packages/shared`: all of `types.ts` (Base/Arc transaction receipts, "savings vs bank" fields, World ID session) and `constants.ts`; five dead helpers in `utils.ts`.
- Unused dependencies: `recharts`, `d3-geo`, `animejs`, `@types/d3-geo`, `@playwright/test`; stale Playwright e2e specs that asserted the old UI.
- `apps/dev-ui` (Vite console built around the removed simulated engine and Chainlink-era naming).

**Duplicates and legacy documents**
- `docs/GetNear — Agent Prompt Pack (testnet-only).md` (byte-identical copy of `GETNEAR_PROMPT_PACK.md`).
- Previous-hackathon material (ETHGlobal Cannes: Unlink, Uniswap, Chainlink CRE, Arc, World ID, Fynd, Base): `docs/archive/`, `docs/reference/`, `docs/references/fynd/` (170 KB), `docs/diagrams/`, `docs/conventions/`, `docs/privacy-readme.md`, both demo scripts, `sponsor-feedback.md`, `BOUNTY_SUBMISSIONS.md`, `cre-simulation-output.txt`.
- `.agents/` (stale upstream agent skills; `AGENTS.md` / `CLAUDE.md` at the root remain).
- `frontend/` 18 MB GIF and MP4 (reference renders; the PNG, script and logo are kept).
- `apps/app/.env.example` was entirely EVM variables (Base RPC, Arc, World ID); rewritten with the variables the app reads.

## 3. Deliberately kept (and why)

- **"Simulated" labels.** The USDC to EUR conversion really is simulated: 1Click is only called with `dry: true` and nothing is executed. Removing the labels would make the product claim something false, which the project rules forbid. The `simulated_out` / `is_simulated` fields in the agent and contract record exactly that fact.
- Test doubles named "mock" in unit tests (fetch stubs, RPC fixtures) are normal test code.
- `contracts/fx-budget/res/fx_budget.next.wasm`: the upgrade-target artifact checked by `verify:readonly`.

## 4. Changes made for deployability

- The dashboard no longer opens the agent's SQLite file (`better-sqlite3` in a serverless route); it reads fills/decisions from the agent's read-only HTTP API (`AGENT_API_URL`).
- The oracle proxy route is GET-only.
- `apps/app/vercel.json` with security headers; `docs/DEPLOYMENT.md` documents what can and cannot run on Vercel.

## 5. Findings still open

| Severity | Item | Recommendation |
| :--- | :--- | :--- |
| High | `FullAccess` keys remain on `fx-budget` and `chilliroger-agent.testnet` (see `docs/SECURITY.md`) | Remove before anything beyond a testnet demo |
| Medium | Oracle and agent are long-running services; they cannot run on Vercel | Host on an always-on service (see `docs/DEPLOYMENT.md`) |
| Medium | `apps/faucet/vercel.json` sets `Access-Control-Allow-Origin: *` on `/api/*` | Restrict to the dashboard origin |
| Medium | The agent API serves read-only routes unauthenticated; only loopback by default | Keep it private; expose only through a proxy if the dashboard is hosted elsewhere |
| Low | `/api/near/tx` and `/api/faucet` shell out to local `near-cli` (opt-in demo signer) | Keep `GETNEAR_DEMO_SIGNER` unset on public hosts |
| Low | Retained input USDC has no withdrawal path; Pending escrow orders are not auto-expired | See `docs/TODO.md` |
| Info | Space Mono / Google Fonts are fetched at build time; the Gridbox wordmark is an image because the font is licensed | Confirm the Gridbox licence covers logo use |

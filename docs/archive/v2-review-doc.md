# Meridian FX v2 Review

Consolidated code review built from a three-wave sub-agent pass plus local validation across contracts, shared types/constants, the app, the dev UI, the oracle server, and the treasury CRE workflow.

The final consolidation was performed on the live `feat/unlink-privacy-sidecar` worktree. That workspace already contained unrelated app/dev-ui/oracle/privacy edits outside this review artifact; those were treated as read-only context and left untouched.

## Scope And Exclusions

In scope:
- `contracts/src`, `contracts/script`
- `packages/shared/src`
- `apps/app/src`
- `apps/dev-ui/src`
- `apps/oracle/src`
- `meridian-cre/treasury`

Context only:
- `AGENTS.md`
- `docs/pr-review-findings.md`
- `docs/reference/*`

Excluded unless directly implicated:
- `contracts/lib`, `contracts/out`, `contracts/broadcast`, `contracts/cache`
- `node_modules`, `.next`, `dist`
- `meridian-cre/nav`, `meridian-cre/por`, generated ABI/code, `binary.wasm`
- secret and env files

## Baseline Validation Results

- `git status --short --branch`
  - Worktree is on `feat/unlink-privacy-sidecar`
  - The worktree is not clean; `v2-review-doc.md` is untracked and there are concurrent app/dev-ui/oracle/privacy changes outside this doc
- `pnpm lint`
  - Fails in `apps/dev-ui`
  - Also warns that workspace `apps/privacy` is not yet represented in the lockfile
  - Confirmed hook/type errors in `apps/dev-ui/src/MeridianLogo.tsx` and `apps/dev-ui/src/oracle/CRERunHistory.tsx`
- `pnpm build`
  - Root build fails because `apps/dev-ui` does not typecheck
  - Current failure set also includes `apps/dev-ui/src/oracle/StrategyDecisionLog.tsx` importing a missing `StrategyDecision` type
- `pnpm test`
  - Succeeds, but only meaningfully exercises `packages/shared`
- `~/.foundry/bin/forge build`
  - Succeeds
- `cd meridian-cre/treasury && pnpm run typecheck`
  - Succeeds
- `cd apps/app && pnpm build`
  - Passed on rerun
  - Leaves React hook warnings in `apps/app/src/components/meridian-logo.tsx`

## Must Fix

### MF-1: `MIN_TRADE_AMOUNT` is out of sync across the stack
- Category: `must fix`
- Subsystem: contracts, shared, workflow
- Source: Wave 1 contracts review, Wave 1 shared/CRE review, local validation
- Files:
  - `contracts/src/TreasuryVault.sol:35`
  - `contracts/src/TreasuryVault.sol:106`
  - `contracts/src/TreasuryVault.sol:139`
  - `contracts/src/SwapExecutor.sol:34`
  - `contracts/src/SwapExecutor.sol:68`
  - `contracts/src/SwapExecutor.sol:100`
  - `packages/shared/src/constants.ts:46`
- Issue:
  - `TreasuryVault` uses `MIN_TRADE_AMOUNT = 1`, while `SwapExecutor` and `@meridian/shared` use `1_000_000`.
  - Arc policy and pending-trade flows can accept sub-$1 amounts that the Base executor will later reject.
- Why it matters:
  - This breaks a documented repo-wide invariant and can strand trades between approval and execution.
- Recommended action:
  - Make the constant identical across all three surfaces and add tests/grep checks to keep it that way.

### MF-2: The active oracle-driven CRE path bypasses treasury policy and the required oracle sanity guard
- Category: `must fix`
- Subsystem: treasury workflow
- Source: Wave 1 shared/CRE review, local validation
- Files:
  - `meridian-cre/treasury/config.json:14`
  - `meridian-cre/treasury/workflow.ts:662`
  - `meridian-cre/treasury/workflow.ts:710`
  - `meridian-cre/treasury/workflow.ts:725`
  - `meridian-cre/treasury/workflow.ts:888`
- Issue:
  - Because `oracleApiUrl` is configured, the workflow uses `doTreasuryOracle()`.
  - That path never reads Arc policy, never checks the target rate band, never enforces the documented 0.1% Chainlink-vs-quote sanity check, and never distinguishes auto-execute from approval-required trades before executing on Base.
- Why it matters:
  - The production path is currently detached from the core treasury controls described by the project.
- Recommended action:
  - Reapply policy, price-sanity, and approval gating inside the oracle mode before any Base write happens.
  - Read Arc policy before execution, enforce the threshold/approval split, compare quote vs oracle within 0.1%, and fail closed before `executeSwapOnBase()`.

### MF-3: The human-approval flow is effectively broken and can be bypassed
- Category: `must fix`
- Subsystem: app, oracle, treasury workflow
- Source: Wave 1 shared/CRE review, local validation
- Files:
  - `apps/app/src/app/(app)/approve/page.tsx:29`
  - `apps/app/src/app/(app)/approve/page.tsx:41`
  - `apps/oracle/src/index.ts:565`
  - `apps/oracle/src/index.ts:570`
  - `meridian-cre/treasury/workflow.ts:624`
- Issue:
  - The approve page only calls `/api/verify-worldid` and sets local UI state.
  - It never calls an approval endpoint and never confirms approval on Arc.
  - Separately, the oracle strategy path auto-approves any pending SQLite trade on the next tick.
  - In self-contained mode, trades can be queued on Arc, but there is no product-owned path that later consumes approved Arc trades and executes them on Base.
- Why it matters:
  - Large trades are neither reliably approved by a human nor reliably executed after approval.
- Recommended action:
  - Pick one real approval path, wire it end to end, and remove the silent auto-approval shortcut from the live execution path.
  - The UI should call one real approval endpoint that records approval durably and is then consumed by the execution workflow.

### MF-4: `confirmApproval()` lets callers spoof who approved a trade
- Category: `must fix`
- Subsystem: contracts
- Source: Wave 1 contracts review
- Files:
  - `contracts/src/TreasuryVault.sol:156`
  - `contracts/src/TreasuryVault.sol:161`
  - `contracts/src/TreasuryVault.sol:163`
- Issue:
  - Any authorized caller can pass an arbitrary whitelisted `_approver`.
  - The contract stores and emits that address without tying it to `msg.sender`.
- Why it matters:
  - Approval audit trails become untrustworthy.
- Recommended action:
  - Bind `confirmApproval()` to `msg.sender`, or enforce a strict CRE-only path with signed approval data that cannot be spoofed.

### MF-5: `logExecution()` can mark rejected or invalid pending trades as executed
- Category: `must fix`
- Subsystem: contracts
- Source: Wave 1 contracts review
- Files:
  - `contracts/src/TreasuryVault.sol:177`
  - `contracts/src/TreasuryVault.sol:191`
  - `contracts/src/TreasuryVault.sol:193`
- Issue:
  - `logExecution()` only checks idempotency.
  - If a pending trade record exists, it blindly flips the status to `EXECUTED`, even if the trade was rejected, expired, or never approved.
- Why it matters:
  - Arc’s audit trail can misrepresent rejected or stale trades as completed executions.
- Recommended action:
  - Require `logExecution()` to accept only valid pending/approved state transitions before mutating status.

### MF-6: Oracle mode logs and reports the slippage floor, not the actual fill
- Category: `must fix`
- Subsystem: treasury workflow, oracle
- Source: Wave 1 shared/CRE review, local validation
- Files:
  - `meridian-cre/treasury/workflow.ts:727`
  - `meridian-cre/treasury/workflow.ts:753`
  - `meridian-cre/treasury/workflow.ts:759`
  - `meridian-cre/treasury/workflow.ts:826`
  - `meridian-cre/treasury/workflow.ts:843`
- Issue:
  - After swap success, oracle mode writes `minOutput` to Arc and to `/api/trades/:id/fill`.
  - It also records `exchangeRate` as `0n`.
  - The actual received amount is never read back before logging.
- Why it matters:
  - Audit logs, trade-order accounting, and any savings calculations can all be materially wrong even when execution succeeds.
- Recommended action:
  - Read and persist the actual fill amount and actual execution rate before reporting completion.
  - Source those values from the real swap result or a post-swap balance delta, not from `minOutput` placeholders.

### MF-7: The app exposes unauthenticated mutating oracle and policy endpoints
- Category: `must fix`
- Subsystem: app, oracle
- Source: local validation
- Files:
  - `apps/app/src/app/api/oracle/[...path]/route.ts:5`
  - `apps/app/src/app/api/oracle/[...path]/route.ts:23`
  - `apps/app/src/app/api/oracle/[...path]/route.ts:37`
  - `apps/oracle/src/index.ts:524`
  - `apps/oracle/src/index.ts:530`
  - `apps/oracle/src/index.ts:536`
  - `apps/oracle/src/index.ts:718`
  - `apps/oracle/src/index.ts:742`
  - `apps/oracle/src/index.ts:761`
- Issue:
  - The Next route proxies arbitrary methods and paths straight through to the oracle server.
  - The oracle server exposes mutating endpoints for approval, cancel, fill, demo controls, and on-chain `setPolicy()`.
  - `setPolicy()` can spend the configured Arc signer without any user-level authentication or authorization.
- Why it matters:
  - Any browser client that can reach the app can potentially mutate the control plane and submit live policy changes.
- Recommended action:
  - Lock the proxy down to a strict allowlist, add authz on mutating routes, and keep signer-backed actions off public unauthenticated endpoints.
  - Specifically gate or remove public access to `/api/policy`, `/api/trades/:id/approve`, `/api/trades/:id/cancel`, `/api/trades/:id/fill`, `/api/demo/*`, and generic mutating `/api/oracle/[...path]`.

### MF-8: `apps/dev-ui` models do not match the oracle API it consumes
- Category: `must fix`
- Subsystem: dev-ui, oracle
- Source: local validation
- Files:
  - `apps/dev-ui/src/oracle/types.ts:10`
  - `apps/dev-ui/src/oracle/types.ts:23`
  - `apps/dev-ui/src/oracle/types.ts:31`
  - `apps/dev-ui/src/oracle/types.ts:43`
  - `apps/dev-ui/src/oracle/useOracleData.ts:102`
  - `apps/dev-ui/src/oracle/useOracleData.ts:83`
  - `apps/dev-ui/src/oracle/PriceSourcesPanel.tsx:58`
  - `apps/dev-ui/src/oracle/TradeOrdersTable.tsx:74`
  - `apps/dev-ui/src/oracle/CRERunHistory.tsx:55`
  - `apps/oracle/src/index.ts:503`
  - `apps/oracle/src/index.ts:553`
  - `apps/oracle/src/index.ts:711`
  - `apps/oracle/src/index.ts:669`
  - `apps/oracle/src/index.ts:701`
  - `apps/oracle/src/strategy.ts:46`
- Issue:
  - `TimingScorePanel` expects a breakdown array, but the oracle returns an object.
  - `PriceSourcesPanel` expects an array of `pair/sources/divergence_bps`, but the oracle returns a single object with `chainlink/fynd/uniswap/divergenceBps`.
  - `TradeOrdersTable` expects `direction/amount/filled_pct`, but the oracle returns DB rows with `from_token/input_amount/filled_amount`.
  - `CRERunHistory` expects `timestamp`, but the oracle returns `started_at`.
  - `useOracleData` still polls `/api/demo/status`, but the oracle only exposes `/api/demo/speed`.
- Why it matters:
  - Even if the package compiled, the oracle dashboard would misrender or break at runtime.
- Recommended action:
  - Define one shared API contract for these endpoints and update both producer and consumer to match it.

### MF-9: Root lint/build are currently broken by `apps/dev-ui`
- Category: `must fix`
- Subsystem: dev-ui
- Source: local validation
- Files:
  - `apps/dev-ui/src/MeridianLogo.tsx:39`
  - `apps/dev-ui/src/MeridianLogo.tsx:56`
  - `apps/dev-ui/src/oracle/CRERunHistory.tsx:55`
  - `apps/dev-ui/src/App.tsx:225`
  - `apps/dev-ui/src/BookDepthPage.tsx:263`
  - `apps/dev-ui/src/DepthPage.tsx:126`
  - `apps/dev-ui/src/PricesPage.tsx:181`
  - `apps/dev-ui/src/oracle/StrategyDecisionLog.tsx:1`
- Issue:
  - `pnpm lint` fails on a hook-order violation and an accessed-before-declared callback.
  - `pnpm build` fails because `apps/dev-ui` does not typecheck.
  - The failing type errors are not cosmetic; they stem from real state-model and Recharts contract issues.
  - The current workspace also adds a new `StrategyDecisionLog` component that imports a type the local `types.ts` export set does not provide at build time.
- Why it matters:
  - The repo’s root build/lint health is currently red.
- Recommended action:
  - Fix the broken state typing in `App.tsx`, the hook ordering in `CRERunHistory.tsx`, the animation callback issue in `MeridianLogo.tsx`, and the incorrect Recharts callback signatures.

## Should Fix

### SF-1: Constructors and deploy scripts do not validate critical addresses
- Category: `should fix`
- Subsystem: contracts
- Source: Wave 1 contracts review
- Files:
  - `contracts/src/SwapExecutor.sol:48`
  - `contracts/src/TreasuryVault.sol:80`
  - `contracts/script/DeploySwapExecutor.s.sol:10`
  - `contracts/script/DeployTreasuryVault.s.sol:10`
- Issue:
  - Bad env input can deploy contracts with zero or wrong addresses, especially dangerous for real-token Base execution.
- Why it matters:
  - A bad deployment can strand real funds behind invalid config.
- Recommended action:
  - Add zero-address and obvious sanity validation in constructors and/or deploy scripts.

### SF-2: `createPendingTrade()` accepts dead or nonsensical trade records
- Category: `should fix`
- Subsystem: contracts
- Source: Wave 1 contracts review
- Files:
  - `contracts/src/TreasuryVault.sol:132`
  - `contracts/src/TreasuryVault.sol:139`
  - `contracts/src/TreasuryVault.sol:147`
- Issue:
  - The vault does not reject already-expired trades, zero output amounts, or zero exchange rates.
- Why it matters:
  - The queue can fill with unusable records that confuse both the UI and the workflow.
- Recommended action:
  - Validate expiry, output amount, and exchange rate before insertion.

### SF-3: Money math still relies on JS `Number` in multiple critical paths
- Category: `should fix`
- Subsystem: shared, app, oracle
- Source: Wave 1 shared/CRE review, local validation
- Files:
  - `packages/shared/src/constants.ts:3`
  - `packages/shared/src/constants.ts:13`
  - `apps/app/src/lib/format.ts:26`
  - `apps/app/src/app/(app)/settings/page.tsx:14`
  - `apps/app/src/app/(app)/trade/page.tsx:91`
  - `apps/app/src/app/(app)/approve/page.tsx:19`
  - `apps/oracle/src/strategy.ts:156`
  - `apps/oracle/src/index.ts:635`
- Issue:
  - Large raw amounts and 18-decimal rates are repeatedly downcast to `Number`.
  - The shared display helpers, app rate formatting, urgency scoring, and min-output calculations all lose precision once values exceed safe integer bounds.
- Why it matters:
  - These are treasury amounts and exchange-rate values, not casual UI counters.
- Recommended action:
  - Keep arithmetic in bigint/decimal-safe form until the final display boundary.
  - Display-only formatting can remain string/locale based, but any threshold, fill, rate, or chunk calculation path should stay bigint/decimal-safe.

### SF-4: `reportToOracle()` treats failed HTTP writes as success unless the transport throws
- Category: `should fix`
- Subsystem: treasury workflow
- Source: Wave 1 shared/CRE review
- Files:
  - `meridian-cre/treasury/workflow.ts:824`
  - `meridian-cre/treasury/workflow.ts:831`
  - `meridian-cre/treasury/workflow.ts:848`
- Issue:
  - The workflow ignores the status codes from both `/api/trades/:id/fill` and `/api/cre/runs`.
- Why it matters:
  - Reconciliation failures can be silently swallowed and only show up later as state drift.
- Recommended action:
  - Check the response status for both writes and log/fail accordingly.

### SF-5: Core paths are largely untested
- Category: `should fix`
- Subsystem: contracts, workflow, workspace
- Source: Wave 1 contracts review, local validation
- Files:
  - `contracts/test`
  - `package.json:14`
- Issue:
  - There are no Foundry tests for the contracts.
  - Root `pnpm test` currently gives a green result without covering the execution, approval, or logging paths that matter most.
- Why it matters:
  - The riskiest code has almost no automated regression protection.
- Recommended action:
  - Add contract tests first, then add thin integration coverage for oracle/workflow state transitions.
  - Minimum acceptance targets: approval-spoofing tests, invalid-execution-logging tests, min-trade invariant tests, and workflow/oracle tests for approval-required trades, policy rejection, and actual fill reporting.

## Defer

### DF-1: `poolFee` is config-required but unused in the treasury workflow
- Category: `defer`
- Subsystem: treasury workflow
- Source: prior review context, local validation
- Files:
  - `meridian-cre/treasury/workflow.ts:39`
  - `meridian-cre/treasury/config.json:11`
- Issue:
  - `poolFee` is part of the config contract but is never read.
- Why it matters:
  - This is drift-prone and misleading, but it is not what currently breaks execution.
- Recommended action:
  - Either thread it through the quote/swap path or remove it from config.
- Issue-ready stub:
  - Title: `Thread poolFee through treasury workflow or remove it from config`
  - Owner: workflow/integration
  - Acceptance criteria: config schema, `config.json`, and runtime usage all agree on whether pool fee is used, with no unused required fields

### DF-2: The app hardcodes treasury-specific runtime config outside shared constants
- Category: `defer`
- Subsystem: app
- Source: local validation
- Files:
  - `apps/app/src/lib/contracts.ts:6`
  - `apps/app/src/lib/contracts.ts:22`
  - `apps/app/src/lib/contracts.ts:36`
- Issue:
  - The app defines Arc chain metadata, RPC defaults, and a treasury wallet address locally instead of pulling from one canonical shared surface.
- Why it matters:
  - This invites silent drift, but it is secondary to the live approval and policy issues above.
- Recommended action:
  - Move canonical treasury addresses and chain config into `@meridian/shared`.
- Issue-ready stub:
  - Title: `Move app chain and treasury config into shared constants`
  - Owner: app/shared
  - Acceptance criteria: the app no longer hardcodes Arc RPC URL, chain metadata, treasury wallet, or contract-address ownership rules that belong in shared config

### DF-3: Add shared DTOs for oracle-facing HTTP APIs after the immediate fixes land
- Category: `defer`
- Subsystem: app, dev-ui, oracle, workflow
- Source: local validation
- Files:
  - `apps/dev-ui/src/oracle/types.ts`
  - `apps/app/src/app/(app)/trade/page.tsx`
  - `apps/oracle/src/index.ts`
  - `meridian-cre/treasury/workflow.ts`
- Issue:
  - The current repo has multiple hand-written DTO layers for the same oracle endpoints.
- Why it matters:
  - Today’s schema drift already caused real bugs, but the long-term fix is broader than the immediate repairs.
- Recommended action:
  - After repairing the current endpoints, introduce a shared API contract for oracle-facing HTTP responses.
- Issue-ready stub:
  - Title: `Create shared DTOs for oracle HTTP endpoints`
  - Owner: shared/app/oracle/dev-ui
  - Acceptance criteria: app, dev-ui, and oracle consume one source of truth for endpoint payloads, and the refactor lands only after the current endpoint shapes are corrected and stable

## Skip / False Positive

### SK-1: Public mint/faucet on Arc mock tokens
- Category: `skip / false positive`
- Subsystem: contracts
- Files:
  - `contracts/src/MockUSDC.sol`
  - `contracts/src/MockEURC.sol`
- Reason:
  - This matches the documented Arc testnet demo-token design and is not a bug unless those mocks are ever moved onto Base or production paths.

### SK-2: World ID auto-success when no app id is configured
- Category: `skip / false positive`
- Subsystem: app
- Files:
  - `apps/app/src/app/api/verify-worldid/route.ts:16`
- Reason:
  - This is an explicit demo-mode shortcut. It should stay clearly documented, but it is not hidden behavior.

### SK-3: `SwapExecutor.withdraw()` sending funds to `owner`
- Category: `skip / false positive`
- Subsystem: contracts
- Files:
  - `contracts/src/SwapExecutor.sol:123`
- Reason:
  - This may be intentional if the deployer EOA is the treasury wallet. It is worth confirming operationally, but the code alone is not enough to call it a defect.

## Recommended Next Steps

Immediate order:
1. Lock down public mutating routes and policy writes.
2. Fix the approval path so one authoritative approval state exists.
3. Reapply policy and sanity checks inside oracle-mode execution.
4. Correct execution accounting and Arc/oracle logging.
5. Align `MIN_TRADE_AMOUNT` everywhere.

1. Close the control-plane gaps first.
   - Align `MIN_TRADE_AMOUNT`
   - Remove oracle auto-approval from any live execution path
   - Make approval persist on-chain or through one real backend path
   - Lock down public mutating oracle endpoints

2. Repair execution correctness next.
   - Reapply policy and price-sanity checks inside oracle mode
   - Log actual fills and actual execution rates
   - Tighten `TreasuryVault` state-transition checks

3. Restore workspace health.
   - Fix the `apps/dev-ui` hook/type failures
   - Align dev-ui endpoint models with actual oracle payloads

4. Add regression coverage before more feature work.
   - Foundry tests for vault/executor invariants and state transitions
   - Thin integration checks for oracle/workflow approval and fill flows

## Category Counts

- Counts reflect deduped findings, not raw agent reports.
- `Must Fix`: 9
- `Should Fix`: 5
- `Defer`: 3
- `Skip / False Positive`: 3

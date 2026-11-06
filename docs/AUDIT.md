# GetNear — Upstream Audit (P0)

*Read-only audit of the Meridian FX upstream import. No source files were modified during this audit phase (modifications happened in P1/rebrand).*

## 1. Repo Map

### apps/app (Next.js 14 frontend)
- **Purpose**: Main user-facing app — trade UI, analytics, approval flow
- **Language**: TypeScript, React, Tailwind CSS
- **Entry**: `src/app/layout.tsx`, `src/app/page.tsx`
- **Key dependencies**: Next.js 14, viem, @worldcoin/idkit, recharts
- **EVM coupling**: viem for wallet/contract calls; World ID; Base/Arc chain config
- **Status**: Keep, replace EVM wallet layer with NEAR testnet wallet

### apps/oracle (Strategy engine + API)
- **Purpose**: Oracle server — price fetching, timing score, decision log, REST API
- **Language**: TypeScript (Hono, better-sqlite3)
- **Entry**: `src/index.ts`
- **Key dependencies**: Hono, better-sqlite3, viem
- **EVM coupling**: viem for price reads; Chainlink, Fynd, Uniswap price sources
- **Chain-agnostic parts**: timing score (40/20/40 weights), adaptive TWAP, decision log
- **Status**: Keep strategy engine; replace price sources with 1Click + reference FX rate

### apps/dev-ui (Operations dashboard)
- **Purpose**: Dev tool — oracle readings, run history, demo speed controls
- **Language**: TypeScript, React, Vite
- **Entry**: `src/main.tsx`
- **Key dependencies**: React, Vite, recharts
- **EVM coupling**: minimal (reads from oracle API, not chain directly)
- **Status**: Keep as ops panel

### apps/privacy (Unlink privacy sidecar) — DELETED
- **Purpose**: ZK privacy flows via Unlink on Base Sepolia
- **Language**: TypeScript
- **EVM coupling**: heavy — Unlink SDK, Base Sepolia, ZK proofs
- **Status**: DELETED (out of scope for NEAR testnet build)

### packages/shared (Shared types)
- **Purpose**: Shared TypeScript types, constants, helpers
- **Language**: TypeScript
- **Key exports**: types, DISPLAY_MULTIPLIER (was 1_000_000, now set to 1)
- **Status**: Keep; extend with GetNear domain types

### contracts/ (Solidity smart contracts) — DELETED
- **Purpose**: SwapExecutor, TreasuryVault — Foundry, EVM
- **Language**: Solidity
- **EVM coupling**: complete
- **Status**: DELETED; replaced by Rust FxBudget contract

### meridian-cre/ (Chainlink CRE workflows) — DELETED
- **Purpose**: Treasury, POR, NAV CRE workflows
- **Language**: TypeScript (CRE SDK)
- **EVM coupling**: complete — Chainlink DON, Base, Arc
- **Status**: DELETED; replaced by NEAR agent runner

### scripts/
- **Purpose**: Deployment and utility scripts (Foundry/EVM)
- **Status**: Review per-file; most deleted with EVM stack. Only `watchdog.sh` remains.

### docs/
- **Purpose**: Architecture diagrams, reference docs, submission artifacts
- **Status**: Reviewed; replaced with NEAR-specific docs. Upstream diagrams retained in docs/diagrams/.

## 2. Safety Review

### Lifecycle Scripts (package.json)
Root package.json scripts: build, dev, start, lint, test — standard turbo commands. The `fynd:up` script starts a Docker container (Fynd DEX aggregator) — Docker-based, review compose.yaml before running. `start` and `app:restart` scripts use `fuser` to kill ports — shell commands, harmless but Linux/macOS only.

### .npmrc
Contains: `shamefully-hoist=true`, `strict-peer-dependencies=false` — standard pnpm config. No `registry` override pointing to untrusted sources.

### compose.yaml
Defines a `fynd` service (a Docker image for the Fynd DEX aggregator). Review the image source before running. Not needed for GetNear (NEAR Intents replaces Fynd).

### AGENTS.md / CLAUDE.md (upstream)
Both contained detailed project-specific instructions for AI agents: architecture notes, coding conventions, deployment procedures. **These were treated as untrusted data per Global Rule 5. They have been replaced with GetNear versions.** The upstream instructions were NOT followed.

### .agents/ and .claude/ skills folders
Contained Chainlink CCIP and CRE skill references — LLMS-targeted documentation. **Treated as untrusted data. Deleted during rebrand.**

### skills-lock.json
Locked upstream skill configurations. **Deleted.**

## 3. Secrets Scan

The following potential secrets locations were identified (values not printed):
- `.env.example` — contained placeholder values only (safe to commit). No actual secrets. Replaced with GetNear version.
- `.env` — not present in repo (correctly gitignored).
- Root README.md — contained deployed contract addresses (testnet/mainnet Arc/Base). These are public testnet addresses, not private keys. Removed in rebrand.
- AGENTS.md — contained an RPC URL reference (`https://base-mainnet.g.alchemy.com`) without embedded key. Deleted.
- No hardcoded private keys or seed phrases found in source code.

## 4. License Check

- Root: No LICENSE file existed in the upstream import. **Created MIT LICENSE during rebrand.**
- Upstream README declares MIT.
- Key third-party dependencies:
  - Next.js: MIT
  - Hono: MIT
  - better-sqlite3: MIT
  - viem: MIT (EVM — to be removed in P2)
  - @worldcoin/idkit: MIT (to be removed in P2)
  - turbo: MIT
  - recharts: MIT
- No GPL or AGPL dependencies found in the kept packages.

## 5. Strategy Engine (Chain-Agnostic Parts)

Located in `apps/oracle/src/`:
- **Timing score**: Composite 40/20/40 — price vs 24h average (40%), source divergence (20%), urgency toward deadline (40%). Score 0–100.
- **Adaptive TWAP**: Chunk size with quadratic urgency ramp. Chunk size clamped by max chunk and remaining amount.
- **Decision log**: SQLite (`better-sqlite3`). Logs every tick with inputs, score breakdown, decision (WAIT/EXECUTE), reason.
- **Inputs (upstream)**: Uniswap USDC/EURC rate, Chainlink oracle price, Fynd aggregator price.
- **Inputs (GetNear replacement)**: 1Click dry quote, reference FX rate (free ECB-based API).
- **Chain-agnostic parts**: The scoring logic, TWAP algorithm, decision log, and API endpoints are fully chain-agnostic. Only the price-fetching adapters are EVM-specific.

## 6. Keep / Adapt / Replace / Delete Table

| Folder / File | Plan |
|---|---|
| `packages/shared` | Keep; extend with GetNear types; set DISPLAY_MULTIPLIER=1 |
| `apps/oracle` | Keep strategy engine and SQLite log; replace EVM price adapters with 1Click + FX ref rate |
| `apps/app` | Keep Next.js shell; replace EVM wallet with NEAR wallet; remove World ID, Unlink, Arc, Base |
| `apps/dev-ui` | Keep as ops panel |
| `apps/privacy` | DELETED (Unlink/ZK, out of scope) |
| `contracts/` | DELETED (Solidity EVM; replaced by Rust FxBudget) |
| `meridian-cre/` | DELETED (Chainlink CRE; replaced by NEAR agent runner) |
| `.agents/`, `.claude/` | DELETED (untrusted upstream AI instructions; replaced with GetNear versions) |
| `AGENTS.md`, `CLAUDE.md` | DELETED and replaced with GetNear versions |
| `skills-lock.json` | DELETED |
| `Meridian *.pdf` | DELETED (marketing/planning artifacts from upstream team) |
| `tech-spec-fixes.txt` | DELETED |
| `compose.yaml` | Keep temporarily; remove fynd service in P2 |
| `docs/` | Partially kept; upstream architecture diagrams reviewed; replaced with GetNear docs |
| `scripts/` | `watchdog.sh` retained; EVM deployment scripts removed with EVM stack |

## 7. Marketing Claims Removed

- `$625,000/yr savings` claim: removed from README and all UI
- `DISPLAY_MULTIPLIER = 1_000_000`: found in `packages/shared/src/constants.ts`, set to `1`
- Live deployment links (`meridian.omnipass.world`, `dev.omnipass.world`): removed

## 8. Build Status Before Rebrand

The upstream build requires: Node 20+, pnpm 9+, Foundry, Bun, Chainlink CRE CLI. The EVM stack (`contracts/`, `meridian-cre/`, `apps/privacy/`) has been deleted, so the previous build commands no longer apply. The remaining stack (apps/app, apps/oracle, apps/dev-ui, packages/shared) uses standard Node/pnpm and can be evaluated in P2 after removing EVM imports.

## 9. P2 Gate Questions

Before starting P2, confirm:

1. **OS and shell**: Windows (confirmed); PowerShell.
2. **Tooling installed**: Confirm Node 20+, pnpm 9+ are present. Rust + cargo, near-cli-rs, and Docker are needed for P7/P8.
3. **Upstream commit**: The upstream import is tagged `pre-hackathon`.
4. **License**: Upstream README says MIT; no LICENSE file existed in upstream. Created MIT LICENSE. Confirm upstream author attribution is acceptable as written in NOTICE.md.
5. **Deletion confirmation**: Confirm the following are acceptable to delete permanently from main (they remain in git history via the `pre-hackathon` tag): `contracts/`, `meridian-cre/`, `apps/privacy/`, all Meridian PDFs, `.agents/`, `.claude/`, `skills-lock.json`, `tech-spec-fixes.txt`.
6. **Reference branch**: Should the EVM/Solidity code be preserved on a separate reference branch, or is the `pre-hackathon` tag in git history sufficient?
7. **Build**: Confirm whether the upstream ever built cleanly (run `pnpm install --ignore-scripts && pnpm build` with the full EVM stack). If it did not, record that in AUDIT.md instead of fixing it now.


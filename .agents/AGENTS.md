# GetNear — Project Agent Rules

This file contains GetNear-specific rules. It supplements the global rules, not replaces them.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Frontend**: Next.js 14 (apps/app), Vite + React (apps/dev-ui)
- **Backend**: Hono + better-sqlite3 + TypeScript (apps/oracle)
- **Smart contract**: Rust + near-sdk-rs (contracts/fx-budget, written in P7)
- **Chain**: NEAR testnet ONLY. Network ID must always be `testnet`.
- **Shared types**: `@getnear/shared` (packages/shared)

## Naming Conventions

- Package scope: `@getnear/*`
- Env var prefix: `GETNEAR_` (project mode), `NEAR_` (network config)
- Branch names: `feat/`, `fix/`, `chore/`, `docs/` prefixes

## Key Constraints

- All fills are SIMULATED. Never claim real execution.
- 1Click API: only `dry: true` quotes. Never call deposit or status endpoints.
- NEAR Intents has no testnet. All fills are accounting-only.
- The agent's function-call key is restricted to `execute_chunk` only.
- Large orders (above auto-cap) need Sputnik DAO 2-of-3 approval.

## File Organization

- `apps/app/` — Next.js frontend (order intake, approval UI, dashboard)
- `apps/oracle/` — Strategy engine + decision log API
- `apps/dev-ui/` — Ops panel (contract limits, agent key, RPC health)
- `apps/agent/` — Agent runner (written in P9)
- `packages/shared/` — Shared types, config, math helpers
- `packages/near-client/` — NEAR JSON-RPC wrapper (written in P4)
- `contracts/fx-budget/` — Rust FxBudget contract (written in P7)
- `scripts/near/` — NEAR CLI scripts (testnet setup, deployment)
- `docs/` — Architecture, audit, strategy, contract, security, config, demo log

## Block Discipline

Do only the current prompt block (P0–P14). Note future work in `docs/TODO.md`. Never start the next block without user confirmation.


# TODO

Items noted during P0–P2 for later blocks.

- [x] P0: Upstream audit and license check (`docs/AUDIT.md`).
- [x] P1: Full rebrand from Meridian to GetNear across all files, packages, and UI.
- [x] P2: Remove remaining viem imports from apps/app and apps/oracle. Remove World ID, Unlink, Arc, Base chain config from apps/app.
- [x] P2: Implement MOCK adapters for QuoteSource, ReferenceRateSource, Executor, ApprovalGate.
- [x] P2: Remove Fynd Docker service from compose.yaml (deleted compose.yaml).
- [x] P2: Verify pnpm build, pnpm lint, and pnpm test pass after EVM removal.
- [x] P3: Define GetNear shared types (Order, Chunk, Decision, QuoteSnapshot, Fill, ProposalRef).
- [x] P3: Set up typed config loader (zod) for NEAR env vars.
- [x] P3: Write docs/CONFIG.md and update .env.example.
- [x] P3: Utility helpers (yocto, ns, bps, explorer) and unit tests.
- [x] P4: Set up NEAR testnet accounts and RPC client (@getnear/near-client, check-env script, frontend wallet connect).
- [x] P5: 1Click dry-quotes, Frankfurter ECB reference rates, route minimums probed ($1-$5000), LiveQuoteCard UI & CLI probe.
- [x] P6: Strategy engine adapted to 1Click & ECB reference sources, adaptive TWAP with quadratic urgency, hard execution guards, SQLite decision log, and docs/STRATEGY.md.
- [x] P7: Write Rust FxBudget smart contract (`contracts/fx-budget`), compile release WASM (`res/fx_budget.wasm`), 9-test verification suite, and `docs/CONTRACT.md`.
- [x] P8: Deploy Sputnik DAO (`chilliroger-dao.sputnik-v2.testnet`), FxBudget (`fx-budget.chilliroger-operator.testnet`), bootstrap proposals, agent restricted key, and above-cap order 2-of-3 approval flow (`docs/DEMO_LOG.md`).
- [x] P9: Build agent runner (`apps/agent`) with autonomous polling loop, live 1Click & ECB integration, SQLite provenance (`is_simulated = true`), REST observability endpoints, and testnet chunk executions.
- [ ] P10: Build dashboard and order UI.
- [ ] P11 (optional): NEAR AI natural-language order intake.
- [ ] P12: End-to-end demo, tests, reproducibility.
- [ ] P13: README and hackathon disclosures.
- [ ] P14: Final QA and submission.


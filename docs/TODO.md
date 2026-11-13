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
- [x] P10: Build dashboard and order UI (clean, non-gradient, zero emojis, Lucide SVG icons, live testnet transactions for create_order & Sputnik DAO voting, toast alerts with NEARBlocks explorer links, and agent runner controls).
- [x] P10.5: Real on-chain NEP-141 token deployment (USDC & EURe), vault storage registration, 100k EURe liquidity seeding, user faucet API & script, and autonomous agent `ft_transfer` direct wallet settlement.
- [x] Post-Audit Settlement-Proof Upgrade: Callback-verified NEP-141 EURe settlement inside `FxBudget::execute_chunk` (`on_chunk_settled`), invoice payable tracking (`target_out`, `settled_out`, `remaining_due_out`), `ChunkRecord` idempotency, restricted FunctionCall key enforcement in `AgentRunner`, failure-safe SQLite provenance (`is_simulated = true` on failed transfers), UI Invoice Balance & decimals fix, and live `€1,000` testnet verification (`Order #8`, `INV-2026-1000`).
- [x] P11 (optional): NEAR AI natural-language order intake (`@getnear/shared` strict Zod parser, `/api/orders/parse`, `<AiOrderIntake />` supporting NEAR AI Cloud + free Gemini/Groq fallbacks; manual form works without key).
- [ ] P12: End-to-end demo, tests, reproducibility.
- [ ] P13: README and hackathon disclosures.
- [ ] P14: Final QA and submission.


## Post-audit follow-ups (separate deployment task)
- [ ] Rebuild `contracts/fx-budget` (`pnpm build:contract`), run `cargo test --lib`, then redeploy as a code-only upgrade (no `migrate`) via the deployment key; update `res/fx_budget.wasm` and re-run `pnpm verify:readonly`.
- [ ] After redeploy: DAO `set_order_payout_cap` (or leave legacy Order #6 uncapped = unable to pay), restart the agent, and run one new live escrow order to evidence the adjusted final chunk.
- [ ] Remove the `FullAccess` keys on `fx-budget` and `chilliroger-agent.testnet` (see `docs/SECURITY.md`).
- [ ] Add an owner-only withdrawal for retained input USDC; auto-expire never-approved `Pending` escrow orders.

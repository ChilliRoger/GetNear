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
- [ ] P5: Fetch 1Click token list; verify euro stablecoin exists; implement dry-quote adapter.
- [ ] P6: Adapt strategy engine to NEAR quote sources.
- [ ] P7: Write Rust FxBudget smart contract.
- [ ] P8: Deploy Sputnik DAO and FxBudget to testnet.
- [ ] P9: Build agent runner with simulated fills.
- [ ] P10: Build dashboard and order UI.
- [ ] P11 (optional): NEAR AI natural-language order intake.
- [ ] P12: End-to-end demo, tests, reproducibility.
- [ ] P13: README and hackathon disclosures.
- [ ] P14: Final QA and submission.


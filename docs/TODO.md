# TODO

Items noted during P0/P1 for later blocks.

- P2: Remove remaining viem imports from apps/app and apps/oracle. Remove World ID, Unlink, Arc, Base chain config from apps/app.
- P2: Implement MOCK adapters for QuoteSource, ReferenceRateSource, Executor, ApprovalGate.
- P2: Remove Fynd Docker service from compose.yaml.
- P2: Verify pnpm build passes after EVM removal.
- P3: Define GetNear shared types (Order, Chunk, Decision, QuoteSnapshot, Fill, ProposalRef).
- P3: Set up typed config loader (zod) for NEAR env vars.
- P4: Set up NEAR testnet accounts and RPC client.
- P5: Fetch 1Click token list; verify euro stablecoin exists; implement dry-quote adapter.
- P6: Adapt strategy engine to NEAR quote sources.
- P7: Write Rust FxBudget smart contract.
- P8: Deploy Sputnik DAO and FxBudget to testnet.
- P9: Build agent runner with simulated fills.
- P10: Build dashboard and order UI.
- P11 (optional): NEAR AI natural-language order intake.
- P12: End-to-end demo, tests, reproducibility.
- P13: README and hackathon disclosures.
- P14: Final QA and submission.

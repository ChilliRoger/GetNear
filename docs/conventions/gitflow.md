# Gitflow

Branch strategy for Meridian FX. Designed for parallel agent tracks working on the same repo.

---

## Branch Structure

```
main ──────────────────────────────────────────> (tagged releases only)
  |
  └── develop ──────────────────────────────────> (integration branch)
        |
        ├── track-a/feature-description ────────> (frontend/mini-app work)
        ├── track-b/feature-description ────────> (CRE workflow work)
        ├── track-c/feature-description ────────> (smart contracts work)
        └── track-d/feature-description ────────> (dashboard/polish work)
```

## Rules

### main is sacred
- Only tagged releases land on main
- Never commit directly to main
- Merges into main always come from develop via a tagged release
- Tags follow semver: `v0.1.0`, `v0.2.0`, etc.

### develop is the integration branch
- All track branches merge into develop via PR
- develop should always be in a buildable state
- Run `pnpm build` and `forge build` before merging

### Track branches
- Naming: `track-{letter}/{short-description}`
- Examples: `track-c/swap-executor-deploy`, `track-b/cre-workflow-scaffold`
- PRs from track branches target develop, never main
- Keep track branches short-lived -- merge after each phase

### Commit discipline
- Commit at every checkpoint (after completing each phase or milestone)
- Do not batch multiple phases into one commit
- Commit message format: `track-X: description` (e.g., `track-c: deploy SwapExecutor to Base`)
- For cross-track work (shared types, docs): `shared: description`

---

## Release Tags

| Tag | Meaning |
|-----|---------|
| v0.1.0 | Foundation: scaffold + adapter interfaces |
| v0.2.0 | Core features: contracts deployed, CRE simulated |
| v0.3.0 | Integration: tracks connected, end-to-end flow |
| v0.4.0 | Demo ready: polished, tested, demo script works |
| v1.0.0 | Shipped: submission complete |

---

## Merging

1. Create PR from track branch to develop
2. Verify CI passes (build + typecheck)
3. Merge via squash-and-merge for clean develop history
4. Delete the track branch after merge
5. For releases: merge develop to main, tag with version

---

## Conflict Resolution

When two tracks modify the same file (usually `packages/shared/`):
1. The track that merged first wins
2. The second track rebases onto updated develop
3. Shared type changes require coordinated PRs -- do not add types that break other tracks

---

## Emergency: Hotfix

If main needs a fix (broken demo, wrong address):
1. Branch from main: `hotfix/description`
2. Fix, commit, PR to main
3. Tag new version
4. Cherry-pick or merge back to develop

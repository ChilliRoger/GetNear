# Deploying GetNear (testnet)

GetNear is three long-lived pieces plus the contracts. Only the dashboard fits Vercel's serverless model.

| Piece | What it is | Where it can run |
| :--- | :--- | :--- |
| `apps/app` (dashboard) | Next.js 14, stateless | **Vercel** |
| `apps/faucet` | Next.js 14, stateless (demo-token faucet) | **Vercel** (has its own `vercel.json`) |
| `apps/oracle` | Hono + SQLite price recorder (loops every 30 s, needs a disk) | A small always-on host (Railway / Render / Fly.io free tiers) or your machine |
| `apps/agent` | Long-running runner that signs `execute_chunk` with the restricted key via `near-cli-rs` | An always-on host with `near-cli-rs` and the key file. Keep this private. |
| Contracts | `FxBudget` + Sputnik DAO | Already on NEAR testnet |

The dashboard degrades cleanly without the oracle and agent: the chart shows "Oracle offline", the feed shows "Agent offline", and on-chain data (orders, DAO proposals, balances) still loads over NEAR RPC.

## Dashboard on Vercel

1. `npm i -g vercel` then `vercel login`.
2. From `apps/app`: `vercel link` (create a new project). Vercel reads `apps/app/vercel.json`; make sure **"Include source files outside of the Root Directory"** is on (default) because the app imports the workspace packages `@getnear/shared` and `@getnear/near-client`.
3. Environment variables (Project Settings or `vercel env add`), see `apps/app/.env.example`:
   - `NEXT_PUBLIC_NEAR_NETWORK_ID=testnet`, `NEAR_RPC_URLS`, `OPERATOR_ACCOUNT_ID`, `NEXT_PUBLIC_FX_BUDGET_CONTRACT_ID`, `FX_BUDGET_CONTRACT_ID`, `SPUTNIK_DAO_ACCOUNT_ID`, `EURE_CONTRACT_ID`
   - `ORACLE_URL` and `AGENT_API_URL` pointing at wherever you host those two (optional)
   - Optional: `NEAR_AI_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` for natural-language intake
4. `vercel --prod`.

### Must stay OFF on Vercel
`GETNEAR_DEMO_SIGNER`, `NEXT_PUBLIC_DEMO_SIGNER`, `GETNEAR_DEMO_TOKEN`, `AGENT_TRIGGER_TOKEN`. The server-side demo signer shells out to a local `near-cli` with local credential files; it cannot work on Vercel and must never be enabled on a public host. Users sign with their own wallet. Never set `ALLOW_MAINNET`.

### Hosting the agent / oracle
Step-by-step for a free Oracle Cloud VM (and a Cloudflare Tunnel fallback): [`docs/ORACLE_CLOUD.md`](ORACLE_CLOUD.md); setup files in `deploy/vm/`.
The oracle forwards the agent's read-only routes under `/agent/*`, so only port 38174 needs to be public.

- Oracle: `pnpm --filter @getnear/oracle start` (port 38174, `PORT` env). It is read-only and holds no secrets.
- Agent: `pnpm agent:start` (port 38175). It binds to loopback by default. If the dashboard runs elsewhere, expose only the read-only routes (`/status`, `/fills`, `/decisions`, set `AGENT_ALLOW_REMOTE=1`) behind a private network or reverse proxy, and never expose `POST /trigger`. The restricted key file must stay on the agent host.

## Pre-deploy checklist
- `pnpm lint`, `pnpm test`, `pnpm --filter @getnear/app build` all pass (also run by CI).
- `pnpm verify:readonly --expect-upgraded --expect-fresh` passes against testnet.
- No secrets in the repo (`git ls-files | grep -i env` shows only `.env.example` files).
- Faucet: its `vercel.json` currently sends `Access-Control-Allow-Origin: *` on `/api/*`; restrict it to your dashboard origin before a public launch.

## Deployed dashboard
- Production: https://getnear-psi.vercel.app (Vercel project `getnear`, Root Directory `apps/app`, Node 22).
- Deployed with the Vercel CLI (`vercel deploy --prod`). The GitHub auto-deploy integration is disconnected on purpose.
- **Commit author must be a GitHub-linked address.** Vercel blocks a deployment whose commit author it cannot match to a team
  member ("the commit author doesn't have permission to create deployments"). A mistyped `user.email` (for example `...@gamil.com`)
  causes exactly this. Use your GitHub account email or its `ID+username@users.noreply.github.com` address.
- Without the oracle the dashboard still shows the live headline rate (served by a serverless fallback) and builds a
  chart from live samples kept in the browser; recorded history and the agent feed need the oracle/agent services.

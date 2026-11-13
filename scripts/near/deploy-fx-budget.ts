/**
 * GetNear — Deploy / Upgrade FxBudget on NEAR testnet.
 *
 * SAFE BY DEFAULT: without `--confirm-deploy` this only prints the plan and runs READ-ONLY pre-flight checks.
 *
 *   pnpm tsx scripts/near/deploy-fx-budget.ts                     # plan + pre-flight (no signing)
 *   pnpm tsx scripts/near/deploy-fx-budget.ts --confirm-deploy    # execute (needs the deployment key locally)
 *
 * Modes (chosen automatically from live state, can be forced):
 *   code-only    existing V3 state (input token configured): deploys the new code with NO init call.
 *                The borsh state layout is unchanged, so no `migrate*` call is needed (and calling `migrate_v3` on
 *                V3 state would fail). This is the mode for the payout-bound upgrade.
 *   --migrate-v3 existing V2 state: deploy + migrate_v3(input_token)
 *   --migrate    legacy pre-callback state: deploy + migrate(settlement_token)
 *   fresh        account does not exist: create the sub-account, deploy, `new(owner, settlement_token)`
 *
 * Signing authority: the deployment key is a FullAccess key on the contract account itself
 * (fx-budget.<operator>.testnet). The DAO does NOT control it (see docs/SECURITY.md). The key never leaves the local
 * near-cli credential file and is never printed.
 *
 * Artifact: contracts/fx-budget/res/fx_budget.next.wasm (override: --wasm <path>), checked against
 * res/artifacts.json and the live on-chain hash.
 */

try {
  process.loadEnvFile()
} catch {}

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { NearClient } from '@getnear/near-client'
import { runCallFunction, runCreateSubaccount, runDeployContract } from './near-runner.js'
import { loadArtifacts, RES_DIR, ROOT } from '../lib/artifacts.js'
import { codeSha256, sha256Hex } from '../lib/rpc.js'

const CIRCLE_NEAR_TESTNET_USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af'
const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const CONTRACT_ID = process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${OPERATOR_ID}`
const DAO_ID = process.env.SPUTNIK_DAO_ACCOUNT_ID || 'chilliroger-dao.sputnik-v2.testnet'
const EURE_ID = process.env.EURE_CONTRACT_ID || `eure.${OPERATOR_ID}`
const INPUT_USDC_ID = process.env.USDC_CONTRACT_ID || CIRCLE_NEAR_TESTNET_USDC
const RPC_URLS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org']

const argv = process.argv.slice(2)
const flag = (n: string) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : undefined
}
const CONFIRM = argv.includes('--confirm-deploy')
const FORCE_MIGRATE_V3 = argv.includes('--migrate-v3')
const FORCE_MIGRATE = argv.includes('--migrate')
const WASM_PATH = path.resolve(flag('--wasm') ?? path.join(RES_DIR, 'fx_budget.next.wasm'))
const STORAGE_BYTE_COST_YOCTO = 10n ** 19n

type Mode = 'code-only' | 'migrate-v3' | 'migrate' | 'fresh'

async function main() {
  console.log('═'.repeat(64))
  console.log(`  GetNear — FxBudget deploy/upgrade  [${CONFIRM ? 'EXECUTE' : 'PLAN ONLY (no signing)'}]`)
  console.log('═'.repeat(64))

  if (!fs.existsSync(WASM_PATH)) throw new Error(`WASM artifact not found at ${WASM_PATH}. Run "pnpm build:contract --write-artifact" first.`)
  const wasm = fs.readFileSync(WASM_PATH)
  const wasmSha = sha256Hex(wasm)

  // Artifact provenance: must be the manifest's upgrade target and recompute to the recorded hash.
  const artifacts = loadArtifacts()
  const entry = artifacts.find((a) => path.resolve(a.path) === WASM_PATH)
  if (!entry) console.warn(`⚠ ${WASM_PATH} is not listed in res/artifacts.json (non-standard artifact).`)
  else if (!entry.manifestMatches) throw new Error(`Artifact ${entry.file} does not match the hash recorded in res/artifacts.json`)

  const client = new NearClient({ networkId: 'testnet', rpcUrls: RPC_URLS })

  // ── read-only pre-flight ──────────────────────────────────────────────────────────────
  let account: { amount: string; storage_usage: number } | null = null
  try {
    account = (await client.viewAccount(CONTRACT_ID)) as unknown as { amount: string; storage_usage: number }
  } catch {
    account = null
  }
  const live = account ? await codeSha256(RPC_URLS, CONTRACT_ID) : null
  const liveSha = live && live.ok ? live.value.sha256 : null
  const liveBytes = live && live.ok ? live.value.bytes : 0

  let hasInputToken = false
  let hasSettlement = false
  if (account) {
    hasInputToken = Boolean(await client.callView<string | null>(CONTRACT_ID, 'get_input_token', {}).catch(() => null))
    hasSettlement = Boolean(await client.callView<string | null>(CONTRACT_ID, 'get_settlement_token', {}).catch(() => null))
  }

  const mode: Mode = !account
    ? 'fresh'
    : FORCE_MIGRATE_V3
    ? 'migrate-v3'
    : FORCE_MIGRATE
    ? 'migrate'
    : hasInputToken
    ? 'code-only'
    : hasSettlement
    ? 'migrate-v3'
    : 'migrate'

  const initMethod = mode === 'migrate-v3' ? 'migrate_v3' : mode === 'migrate' ? 'migrate' : mode === 'fresh' ? 'new' : null
  const initArgs =
    initMethod === 'migrate_v3'
      ? { input_token: INPUT_USDC_ID }
      : initMethod === 'migrate'
      ? { settlement_token: EURE_ID }
      : initMethod === 'new'
      ? { owner: DAO_ID, settlement_token: EURE_ID }
      : undefined

  const credDisplay = path.join('~', '.near-credentials', 'testnet', `${CONTRACT_ID}.json`)
  const extra = BigInt(Math.max(0, wasm.length - liveBytes)) * STORAGE_BYTE_COST_YOCTO

  console.log('\nPLAN')
  console.log(`  network        : testnet`)
  console.log(`  target account : ${CONTRACT_ID}`)
  console.log(`  signer         : ${CONTRACT_ID} (its own FullAccess key; ${credDisplay}) — NOT the DAO`)
  console.log(`  mode           : ${mode}${initMethod ? ` (init call: ${initMethod}(${JSON.stringify(initArgs)}))` : ' (no init call; state layout unchanged)'}`)
  console.log(`  artifact       : ${path.relative(ROOT, WASM_PATH)}  ${wasm.length} bytes`)
  console.log(`  artifact sha256: ${wasmSha}`)
  console.log(`  on-chain sha256: ${liveSha ?? '(account has no code / not found)'}  ${liveBytes ? `${liveBytes} bytes` : ''}`)
  console.log(`  size delta     : ${wasm.length - liveBytes >= 0 ? '+' : ''}${wasm.length - liveBytes} bytes (extra storage stake ≈ ${(Number(extra) / 1e24).toFixed(4)} NEAR)`)
  console.log('  command        :')
  console.log(
    `    near contract deploy ${CONTRACT_ID} use-file ${path.relative(ROOT, WASM_PATH)} ` +
      (initMethod ? `with-init-call ${initMethod} json-args '${JSON.stringify(initArgs)}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' ` : 'without-init-call ') +
      `network-config testnet sign-with-access-key-file ${credDisplay} send`,
  )

  const problems: string[] = []
  if (account) {
    const free = BigInt(account.amount) - BigInt(account.storage_usage) * STORAGE_BYTE_COST_YOCTO
    console.log(`  free balance   : ${(Number(free) / 1e24).toFixed(4)} NEAR (after storage stake)`)
    if (free < extra + 10n ** 23n) problems.push('insufficient free balance for the extra code storage (+0.1 NEAR margin)')
  }
  if (liveSha === wasmSha) problems.push('the artifact is already deployed (nothing to do)')
  if (mode === 'code-only' && initMethod) problems.push('internal error: code-only must not have an init call')
  if (FORCE_MIGRATE_V3 && hasInputToken) problems.push('--migrate-v3 forced but live state is already V3: migrate_v3 would panic and revert the deploy')
  if (entry && entry.file === 'fx_budget.wasm') problems.push('refusing to deploy the PREVIOUS build artifact (fx_budget.wasm)')

  if (problems.length > 0) {
    console.error('\nPRE-FLIGHT PROBLEMS:\n  - ' + problems.join('\n  - '))
    process.exit(2)
  }

  console.log('\nPOST-UPGRADE CHECKS (read-only, no credentials):')
  console.log('  pnpm upgrade:verify            # code hash == artifact; get_order_payout_cap callable; Orders/escrows unchanged; legacy cap policy')
  console.log('  pnpm verify:readonly --expect-upgraded')

  if (!CONFIRM) {
    console.log('\nPlan only. Re-run with --confirm-deploy to execute. NOTHING was signed or sent.')
    return
  }

  // ── execute ───────────────────────────────────────────────────────────────────────────
  if (mode === 'fresh') {
    console.log(`\nCreating subaccount ${CONTRACT_ID} funded from ${OPERATOR_ID}...`)
    const subRes = runCreateSubaccount({ subaccountId: CONTRACT_ID, initialBalance: '3.5 NEAR', signerId: OPERATOR_ID })
    console.log(`✓ Subaccount creation submitted. Tx: ${subRes.txHash ?? 'n/a'}`)
    await new Promise((r) => setTimeout(r, 4000))
  }

  // The deployment signs with the contract account's own credential file. The path is never printed.
  const credFile = path.join(os.homedir(), '.near-credentials', 'testnet', `${CONTRACT_ID}.json`)
  if (!fs.existsSync(credFile)) throw new Error(`Deployment key for ${CONTRACT_ID} not found locally; cannot sign. (Path: ${credDisplay})`)

  console.log(`\nDeploying (${mode}) to ${CONTRACT_ID}...`)
  const deployRes = runDeployContract({
    contractAccountId: CONTRACT_ID,
    wasmPath: WASM_PATH,
    initMethod: initMethod ?? undefined,
    initArgs,
    initDeposit: '0 NEAR',
    initGas: '100.0 Tgas',
    signerId: CONTRACT_ID,
  })
  console.log(`✓ Deployment transaction submitted! Tx: ${deployRes.txHash ?? 'n/a'}  ${deployRes.explorerUrl ?? ''}`)

  await new Promise((r) => setTimeout(r, 5000))
  const after = await codeSha256(RPC_URLS, CONTRACT_ID)
  const afterSha = after.ok ? after.value.sha256 : '(unreadable)'
  console.log(`\nOn-chain sha256 after deploy: ${afterSha}`)
  console.log(afterSha === wasmSha ? '✅ deployed code == artifact (binary comparison)' : '❌ deployed code does NOT equal the artifact')
  if (afterSha !== wasmSha) process.exitCode = 1

  // Storage registration on the Circle USDC contract is only needed for FRESH deployments.
  if (mode === 'fresh') {
    const storage = await client.callView<any>(INPUT_USDC_ID, 'storage_balance_of', { account_id: CONTRACT_ID }).catch(() => null)
    if (!storage || BigInt(storage.total || '0') === 0n) {
      console.log(`\nRegistering ${CONTRACT_ID} on Circle USDC (${INPUT_USDC_ID})...`)
      const regRes = runCallFunction({
        contractId: INPUT_USDC_ID,
        methodName: 'storage_deposit',
        args: { account_id: CONTRACT_ID, registration_only: true },
        deposit: '0.00125 NEAR',
        gas: '30.0 Tgas',
        signerId: OPERATOR_ID,
      })
      console.log(`✓ Storage registered! Tx: ${regRes.txHash}`)
    }
  }
  console.log('\nNext: pnpm upgrade:verify && pnpm verify:readonly --expect-upgraded')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

/**
 * GetNear — contract upgrade snapshot + post-upgrade verification. READ-ONLY (view calls only; no credentials).
 *
 *   pnpm upgrade:snapshot                      # record the full pre-upgrade state to docs/evidence/pre-upgrade-snapshot.json
 *   pnpm upgrade:verify                        # compare the live chain with the snapshot and the upgrade artifact
 *   pnpm upgrade:verify --artifact fx_budget.next.wasm --snapshot <file> --rpc <url> --json
 *
 * `verify` checks, after the upgrade:
 *   1. deployed code hash == the bundled upgrade artifact (binary comparison)
 *   2. get_order_payout_cap is callable
 *   3. configuration (owner, agent, tokens, limits, pause flag) is unchanged
 *   4. EVERY pre-upgrade order, chunk record and escrow record is byte-for-byte unchanged (incl. Orders #8/#11/#12)
 *   5. token balances held by FxBudget are unchanged
 *   6. legacy orders (target_out == 0) that are still open have NO payout cap, i.e. they cannot pay until the DAO sets one
 *
 * Exit codes: 0 all passed, 1 an assertion failed, 2 the RPC could not answer (nothing asserted for those checks).
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { codeSha256, resolveRpcs, rpc, view } from './lib/rpc.js'
import { loadArtifacts, ROOT } from './lib/artifacts.js'

const FX = process.env.FX_BUDGET_CONTRACT_ID || 'fx-budget.chilliroger-operator.testnet'
const OPERATOR = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const EURE = process.env.EURE_CONTRACT_ID || `eure.${OPERATOR}`
const CIRCLE = process.env.USDC_CONTRACT_ID || '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af'
const SUPPLIER = `supplier-eu.${OPERATOR}`
const DEFAULT_SNAPSHOT = path.join(ROOT, 'docs', 'evidence', 'pre-upgrade-snapshot.json')
const HISTORICAL = [8, 11, 12]

const argv = process.argv.slice(2)
const mode = argv[0]
const flag = (name: string) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const asJson = argv.includes('--json')
const RPCS = resolveRpcs(argv)
const snapshotPath = path.resolve(flag('--snapshot') ?? flag('--out') ?? DEFAULT_SNAPSHOT)

type Status = 'PASS' | 'FAIL' | 'RPC_ERROR' | 'INFO'
interface Check {
  name: string
  expected: string
  observed: string
  status: Status
  note?: string
}
const checks: Check[] = []
const add = (c: Check) => checks.push(c)

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  )
}

async function readAllOrders(): Promise<{ ok: true; orders: any[] } | { ok: false; error: string }> {
  const orders: any[] = []
  for (let from = 0; ; from += 100) {
    const page = await view<any[]>(RPCS, FX, 'list_orders', { from_index: from, limit: 100 })
    if (!page.ok) return { ok: false, error: page.error }
    orders.push(...page.value)
    if (page.value.length < 100) break
  }
  return { ok: true, orders }
}

async function collectState() {
  const errors: string[] = []
  const get = async <T>(contract: string, method: string, args: Record<string, unknown> = {}): Promise<T | null> => {
    const r = await view<T>(RPCS, contract, method, args)
    if (!r.ok) {
      errors.push(`${contract}.${method}: ${r.error}`)
      return null
    }
    return r.value
  }
  const st = await rpc<{ sync_info: { latest_block_height: number } }>('status', [], RPCS)
  const code = await codeSha256(RPCS, FX)
  if (!code.ok) errors.push(`view_code: ${code.error}`)
  const all = await readAllOrders()
  if (!all.ok) errors.push(`list_orders: ${all.error}`)
  const orders = all.ok ? all.orders : []

  const chunks: Record<string, unknown> = {}
  const escrow: Record<string, unknown> = {}
  for (const o of orders) {
    chunks[o.id] = await get(FX, 'list_order_chunks', { order_id: o.id })
    escrow[o.id] = await get(FX, 'get_order_escrow', { id: o.id })
  }
  return {
    errors,
    state: {
      takenAt: new Date().toISOString(),
      head: st.ok ? st.value.sync_info.latest_block_height : null,
      contract: FX,
      codeSha256: code.ok ? code.value.sha256 : null,
      codeBytes: code.ok ? code.value.bytes : null,
      config: {
        owner: await get(FX, 'get_owner'),
        agent: await get(FX, 'get_agent'),
        settlementToken: await get(FX, 'get_settlement_token'),
        inputToken: await get(FX, 'get_input_token'),
        limits: await get(FX, 'get_limits'),
        paused: await get(FX, 'is_paused'),
      },
      orders,
      chunks,
      escrow,
      balances: {
        fxBudgetCircleUsdc: await get<string>(CIRCLE, 'ft_balance_of', { account_id: FX }),
        fxBudgetEure: await get<string>(EURE, 'ft_balance_of', { account_id: FX }),
        supplierEure: await get<string>(EURE, 'ft_balance_of', { account_id: SUPPLIER }),
      },
    },
  }
}

async function snapshot() {
  const { errors, state } = await collectState()
  if (errors.length > 0 || state.orders.length === 0) {
    console.error('Snapshot is INCOMPLETE; refusing to write it:\n  ' + errors.join('\n  '))
    process.exit(2)
  }
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true })
  fs.writeFileSync(snapshotPath, JSON.stringify(state, null, 2) + '\n')
  console.log(`Snapshot written: ${path.relative(ROOT, snapshotPath)}`)
  console.log(`  block height : ${state.head}`)
  console.log(`  code sha256  : ${state.codeSha256} (${state.codeBytes} bytes)`)
  console.log(`  orders       : ${state.orders.length} (ids ${state.orders.map((o: any) => o.id).join(', ')})`)
  console.log(`  FxBudget Circle USDC: ${state.balances.fxBudgetCircleUsdc} | demo EURe vault: ${state.balances.fxBudgetEure}`)
}

async function verify() {
  const artifactName = flag('--artifact') ?? 'fx_budget.next.wasm'
  const artifact = loadArtifacts().find((a) => a.file === artifactName)

  if (!fs.existsSync(snapshotPath)) {
    console.error(`No pre-upgrade snapshot at ${snapshotPath}. Run \`pnpm upgrade:snapshot\` BEFORE upgrading.`)
    process.exit(3)
  }
  const before = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'))
  const { errors, state: now } = await collectState()
  if (errors.length > 0) {
    for (const e of errors) add({ group: 'rpc', name: 'read live state', expected: 'answered', observed: e.slice(0, 160), status: 'RPC_ERROR' } as any)
  }

  // 1. binary comparison
  if (!artifact || !artifact.exists) {
    add({ name: `upgrade artifact ${artifactName} present`, expected: 'file in res/ and manifest', observed: 'missing', status: 'FAIL' })
  } else if (now.codeSha256 === null) {
    add({ name: 'deployed code == upgrade artifact (sha256)', expected: artifact.sha256, observed: '—', status: 'RPC_ERROR' })
  } else {
    add({
      name: 'deployed code == upgrade artifact (sha256)',
      expected: artifact.sha256,
      observed: now.codeSha256,
      status: now.codeSha256 === artifact.sha256 ? 'PASS' : 'FAIL',
      note: 'BINARY COMPARISON only (deployed bytes vs bundled file); it does not prove the file was built from lib.rs',
    })
    add({ name: 'code changed by the upgrade', expected: `!= ${before.codeSha256}`, observed: now.codeSha256, status: now.codeSha256 !== before.codeSha256 ? 'PASS' : 'FAIL' })
  }

  // 2. new view callable
  const cap = await view<unknown>(RPCS, FX, 'get_order_payout_cap', { id: 1 })
  add({
    name: 'get_order_payout_cap is callable',
    expected: 'callable (null or amount)',
    observed: cap.ok ? JSON.stringify(cap.value) : cap.methodMissing ? 'MethodNotFound (old build still deployed)' : `— (${cap.error.slice(0, 100)})`,
    status: cap.ok ? 'PASS' : cap.methodMissing ? 'FAIL' : 'RPC_ERROR',
  })

  // 3. configuration
  for (const k of Object.keys(before.config)) {
    const b = stable((before.config as any)[k])
    const n = stable((now.config as any)[k])
    add({ name: `config.${k} unchanged`, expected: b, observed: n, status: (now.config as any)[k] === null ? 'RPC_ERROR' : b === n ? 'PASS' : 'FAIL' })
  }

  // 4. orders / chunks / escrow
  for (const bo of before.orders as any[]) {
    const no = now.orders.find((o: any) => o.id === bo.id)
    const tag = HISTORICAL.includes(bo.id) ? ' (historical evidence)' : ''
    add({ name: `Order #${bo.id}${tag} readable and unchanged`, expected: stable(bo), observed: no ? stable(no) : 'missing', status: !no ? (errors.length ? 'RPC_ERROR' : 'FAIL') : stable(bo) === stable(no) ? 'PASS' : 'FAIL' })
    add({ name: `Order #${bo.id} chunk records unchanged`, expected: stable(before.chunks[bo.id]), observed: stable(now.chunks[bo.id]), status: now.chunks[bo.id] == null ? 'RPC_ERROR' : stable(before.chunks[bo.id]) === stable(now.chunks[bo.id]) ? 'PASS' : 'FAIL' })
    add({ name: `Order #${bo.id} escrow record intact`, expected: stable(before.escrow[bo.id]), observed: stable(now.escrow[bo.id]), status: now.escrow[bo.id] == null ? 'RPC_ERROR' : stable(before.escrow[bo.id]) === stable(now.escrow[bo.id]) ? 'PASS' : 'FAIL' })
  }

  // 5. balances
  for (const k of Object.keys(before.balances)) {
    const b = (before.balances as any)[k]
    const n = (now.balances as any)[k]
    add({ name: `FxBudget-held balance ${k} unchanged`, expected: String(b), observed: String(n), status: n === null ? 'RPC_ERROR' : b === n ? 'PASS' : 'FAIL' })
  }

  // 6. legacy payout-cap policy
  for (const o of now.orders as any[]) {
    if (BigInt(o.target_out || '0') !== 0n) continue
    const open = o.status === 'Pending' || o.status === 'Active'
    const c = await view<unknown>(RPCS, FX, 'get_order_payout_cap', { id: o.id })
    if (!c.ok) {
      add({ name: `legacy Order #${o.id} (${o.status}) payout cap`, expected: 'null (no cap)', observed: `— (${c.error.slice(0, 90)})`, status: c.methodMissing ? 'FAIL' : 'RPC_ERROR' })
    } else if (open) {
      add({
        name: `legacy Order #${o.id} (${o.status}) has no payout cap, so it cannot pay out`,
        expected: 'null',
        observed: JSON.stringify(c.value),
        status: c.value === null ? 'PASS' : 'INFO',
        note: c.value === null ? 'the DAO must call set_order_payout_cap before this order can make any payout' : 'a cap was set by the DAO',
      })
    } else {
      add({ name: `legacy Order #${o.id} (${o.status}, closed)`, expected: '(informational)', observed: `cap ${JSON.stringify(c.value)}`, status: 'INFO' })
    }
  }

  render()
}

function render() {
  const counts: Record<Status, number> = { PASS: 0, FAIL: 0, RPC_ERROR: 0, INFO: 0 }
  for (const c of checks) counts[c.status]++
  if (asJson) {
    console.log(JSON.stringify({ rpcs: RPCS, counts, checks }, null, 2))
  } else {
    for (const c of checks) {
      console.log(`[${c.status.padEnd(9)}] ${c.name}`)
      if (c.status !== 'PASS' && c.status !== 'INFO') console.log(`            expected: ${c.expected.slice(0, 200)}\n            observed: ${c.observed.slice(0, 200)}`)
      if (c.note) console.log(`            note:     ${c.note}`)
    }
    console.log('\n' + '-'.repeat(72))
    console.log(`PASS ${counts.PASS}   FAIL ${counts.FAIL}   RPC_ERROR ${counts.RPC_ERROR}   INFO ${counts.INFO}`)
    console.log(counts.FAIL > 0 ? 'RESULT: UPGRADE VERIFICATION FAILED' : counts.RPC_ERROR > 0 ? 'RESULT: INCONCLUSIVE (RPC errors)' : 'RESULT: UPGRADE VERIFIED')
  }
  process.exit(counts.FAIL > 0 ? 1 : counts.RPC_ERROR > 0 ? 2 : 0)
}

if (mode === 'snapshot') snapshot().catch((e) => { console.error(e); process.exit(3) })
else if (mode === 'verify') verify().catch((e) => { console.error(e); process.exit(3) })
else {
  console.error('usage: tsx scripts/upgrade-checks.ts <snapshot|verify> [--snapshot file] [--artifact name] [--rpc url] [--json]')
  process.exit(64)
}

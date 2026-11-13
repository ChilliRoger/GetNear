/**
 * GetNear — wallet-free, READ-ONLY verifier for the testnet evidence.
 *
 *   pnpm verify:readonly                       # human table
 *   pnpm verify:readonly --json                # machine readable
 *   pnpm verify:readonly --rpc https://test.rpc.fastnear.com
 *   pnpm verify:readonly --expect-upgraded     # also REQUIRE the upgraded build to be live
 *   pnpm verify:readonly --expect-fresh        # also REQUIRE the fresh upgraded-build invoice to be captured
 *
 * Needs no credentials and signs/broadcasts nothing: only JSON-RPC `status`, `query` (view_code,
 * view_access_key_list, call_function views) and `EXPERIMENTAL_tx_status` lookups.
 *
 * Result categories (kept separate on purpose):
 *   PASS       observed value equals the expected value
 *   FAIL       the RPC answered and the value does NOT match (assertion failure => exit 1)
 *   RPC_ERROR  the RPC could not answer (network / rate limit); nothing was asserted (=> exit 2 if no FAIL)
 *   INFO       an observation that is reported but not asserted
 *
 * Evidence sections:
 *   - Orders #8, #11, #12: HISTORICAL evidence from the PREVIOUS contract + agent build (ca4eab1).
 *   - Fresh invoice: evidence from the UPGRADED build (docs/evidence/fresh-invoice.json); `pending` until captured.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { codeSha256, resolveRpcs, rpc as rpcCall, view as viewCall, type RpcErr, type RpcOk } from './lib/rpc.js'
import { loadArtifacts, ROOT } from './lib/artifacts.js'
import { reconcileInvoice, previousBuildOvercharge, TX_LINK, type ChunkView, type EscrowView, type FreshInvoiceManifest, type OrderView } from './lib/invoice-evidence.js'

const FX = process.env.FX_BUDGET_CONTRACT_ID || 'fx-budget.chilliroger-operator.testnet'
const OPERATOR = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const DAO = process.env.SPUTNIK_DAO_ACCOUNT_ID || 'chilliroger-dao.sputnik-v2.testnet'
const AGENT = process.env.AGENT_ACCOUNT_ID || 'chilliroger-agent.testnet'
const EURE = process.env.EURE_CONTRACT_ID || `eure.${OPERATOR}`
const SUPPLIER = `supplier-eu.${OPERATOR}`
const CIRCLE_USDC = process.env.USDC_CONTRACT_ID || '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af'
const FRESH_MANIFEST = path.join(ROOT, 'docs', 'evidence', 'fresh-invoice.json')

type Status = 'PASS' | 'FAIL' | 'RPC_ERROR' | 'INFO'
interface Check {
  group: string
  name: string
  expected: string
  observed: string
  status: Status
  note?: string
}

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const expectUpgraded = args.includes('--expect-upgraded')
const expectFresh = args.includes('--expect-fresh')
const RPCS = resolveRpcs(args)

const checks: Check[] = []
const add = (c: Check) => checks.push(c)

const view = <T>(contract: string, method: string, a: Record<string, unknown> = {}) => viewCall<T>(RPCS, contract, method, a)
const rpc = <T>(method: string, params: unknown) => rpcCall<T>(method, params, RPCS)

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b
}

function expectEq(group: string, name: string, expected: string, res: RpcOk<unknown> | RpcErr, pick: (v: any) => unknown, note?: string) {
  if (!res.ok) {
    add({ group, name, expected, observed: `— (${res.error.slice(0, 120)})`, status: 'RPC_ERROR', note })
    return
  }
  const observed = String(pick(res.value))
  add({ group, name, expected, observed, status: observed === expected ? 'PASS' : 'FAIL', note })
}

const fmtUsd = (atomic: string | bigint) => `$${(Number(atomic) / 1e6).toFixed(6).replace(/0+$/, '').replace(/\.$/, '.00')}`
const fmtEur = (atomic: string | bigint) => `€${(Number(atomic) / 1e6).toFixed(6).replace(/0+$/, '').replace(/\.$/, '.00')}`

// ── Expected HISTORICAL evidence (previous build; README / DEMO_LOG) ──────────────────────────

interface OrderExpectation {
  id: number
  label: string
  fields: Record<string, string>
  chunks: Array<{ key: string; fields: Record<string, string> }>
}

const HIST = 'HISTORICAL (previous build)'
const ORDERS: OrderExpectation[] = [
  {
    id: 8,
    label: `${HIST} Order #8 (INV-2026-1000, €1,000 invoice; accounting-only budget, DAO-approved)`,
    fields: {
      status: 'Completed', invoice_ref: 'INV-2026-1000', recipient: SUPPLIER,
      total_in: '1500000000', executed_in: '1300000000', target_out: '1000000000', settled_out: '1000000000',
      pending_in: '0', pending_out: '0', chunks_count: '2',
    },
    chunks: [
      { key: 'order-8-seq-1', fields: { status: 'Settled', amount_in: '650000000', settlement_out: '582760093', attempts: '1' } },
      { key: 'order-8-seq-2', fields: { status: 'Settled', amount_in: '650000000', settlement_out: '417239907', attempts: '2' } },
    ],
  },
  {
    id: 11,
    label: `${HIST} Order #11 (INV-EXPIRY-DEMO; scripted partial chunk, then expired with €16.30 unpaid)`,
    fields: {
      status: 'Expired', invoice_ref: 'INV-EXPIRY-DEMO', recipient: SUPPLIER,
      total_in: '15000000', executed_in: '10000000', target_out: '25000000', settled_out: '8700000',
      pending_in: '0', pending_out: '0', chunks_count: '1',
    },
    chunks: [
      // The quote_ref is a hand-written string: this chunk was submitted by the drill script, not by a live-quote agent decision.
      { key: 'order-11-seq-1', fields: { status: 'Settled', amount_in: '10000000', settlement_out: '8700000', quote_ref: 'sha256:partial-expiry-chunk-1' } },
    ],
  },
  {
    id: 12,
    label: `${HIST} Order #12 (INV-CIRCLE-15-*; real Circle testnet USDC escrow, demo EURe payout)`,
    fields: {
      status: 'Completed', recipient: SUPPLIER,
      total_in: '15000000', executed_in: '10000000', target_out: '8000000', settled_out: '8000000',
      pending_in: '0', pending_out: '0', chunks_count: '1',
    },
    chunks: [{ key: 'order-12-seq-1', fields: { status: 'Settled', amount_in: '10000000', settlement_out: '8000000', attempts: '1' } }],
  },
]

async function main() {
  // 0. Chain
  const st = await rpc<{ chain_id: string; sync_info: { latest_block_height: number } }>('status', [])
  if (!st.ok) {
    add({ group: 'rpc', name: 'testnet RPC reachable', expected: 'chain_id=testnet', observed: `— (${st.error.slice(0, 160)})`, status: 'RPC_ERROR' })
  } else {
    add({ group: 'rpc', name: 'chain id', expected: 'testnet', observed: st.value.chain_id, status: st.value.chain_id === 'testnet' ? 'PASS' : 'FAIL', note: `head ${st.value.sync_info.latest_block_height}` })
  }

  // 1. Binary comparison: deployed bytes vs EVERY bundled artifact (res/artifacts.json). Says nothing about source.
  const artifacts = loadArtifacts()
  const code = await codeSha256(RPCS, FX)
  let upgradedLive = false
  if (!code.ok) {
    add({ group: 'binary', name: 'deployed code == a bundled artifact (sha256)', expected: 'identical bytes', observed: `— (${code.error.slice(0, 120)})`, status: 'RPC_ERROR' })
  } else {
    const present = artifacts.filter((a) => a.exists)
    const match = present.find((a) => a.sha256 === code.value.sha256)
    for (const a of artifacts) {
      if (!a.exists) add({ group: 'binary', name: `bundled artifact ${a.file} present`, expected: 'file exists', observed: 'missing', status: 'FAIL' })
      else if (!a.manifestMatches) add({ group: 'binary', name: `bundled artifact ${a.file} matches res/artifacts.json`, expected: a.manifestSha256 ?? '', observed: a.sha256, status: 'FAIL' })
    }
    upgradedLive = Boolean(match && match.file === 'fx_budget.next.wasm')
    add({
      group: 'binary',
      name: 'deployed code == a bundled artifact (sha256)',
      expected: present.map((a) => `${a.file}=${a.sha256.slice(0, 12)}…`).join(' | '),
      observed: `${code.value.sha256.slice(0, 12)}…${match ? ` = ${match.file}` : ' (no match)'}`,
      status: match ? 'PASS' : 'FAIL',
      note: match
        ? `${match.role} — BINARY COMPARISON only: deployed bytes equal the bundled file, not proof it was built from lib.rs`
        : 'the deployed contract is not any bundled artifact',
    })
    if (expectUpgraded) {
      add({
        group: 'binary',
        name: 'upgraded build is deployed (--expect-upgraded)',
        expected: 'fx_budget.next.wasm',
        observed: match ? match.file : 'none',
        status: upgradedLive ? 'PASS' : 'FAIL',
      })
    }
  }

  // 2. Contract wiring
  expectEq('config', 'owner is the Sputnik DAO', DAO, await view(FX, 'get_owner'), (v) => v)
  expectEq('config', 'designated agent', AGENT, await view(FX, 'get_agent'), (v) => v)
  expectEq('config', 'settlement token (demo EURe)', EURE, await view(FX, 'get_settlement_token'), (v) => v)
  expectEq('config', 'input token (Circle testnet USDC)', CIRCLE_USDC, await view(FX, 'get_input_token'), (v) => v)

  // 3. HISTORICAL orders and chunk records
  const chunkCache = new Map<number, any[]>()
  for (const o of ORDERS) {
    const order = await view<any>(FX, 'get_order', { id: o.id })
    for (const [field, expected] of Object.entries(o.fields)) {
      expectEq(o.label, field, expected, order, (v) => v?.[field])
    }
    if (order.ok && order.value) {
      const due = BigInt(order.value.target_out) - BigInt(order.value.settled_out)
      add({ group: o.label, name: 'amount still due (target_out - settled_out)', expected: o.id === 11 ? '16300000' : '0', observed: due.toString(), status: due.toString() === (o.id === 11 ? '16300000' : '0') ? 'PASS' : 'FAIL', note: `${fmtEur(due)} due` })
    }
    const chunks = await view<any[]>(FX, 'list_order_chunks', { order_id: o.id })
    if (chunks.ok) chunkCache.set(o.id, chunks.value)
    for (const c of o.chunks) {
      const rec = chunks.ok ? chunks.value.find((x) => x.key === c.key) : undefined
      for (const [field, expected] of Object.entries(c.fields)) {
        if (!chunks.ok) expectEq(o.label, `${c.key}.${field}`, expected, chunks, () => '')
        else expectEq(o.label, `${c.key}.${field}`, expected, { ok: true, value: rec }, (v) => v?.[field] ?? '(chunk missing)')
      }
    }
  }

  // 4. HISTORICAL Order #12 escrow: $15 funded, $5 refunded, $10 consumed/retained by FxBudget
  const g12 = `${HIST} Order #12 escrow`
  const escrow = await view<any>(FX, 'get_order_escrow', { id: 12 })
  expectEq(g12, 'escrowed_in ($15 funded)', '15000000', escrow, (v) => v?.escrowed_in)
  expectEq(g12, 'executed_in ($10 consumed)', '10000000', escrow, (v) => v?.executed_in)
  expectEq(g12, 'refunded_in ($5 refunded)', '5000000', escrow, (v) => v?.refunded_in)
  expectEq(g12, 'remaining_escrow_in', '0', escrow, (v) => v?.remaining_escrow_in)

  const bal = async (token: string, account: string) => view<string>(token, 'ft_balance_of', { account_id: account })
  const circleVault = await bal(CIRCLE_USDC, FX)
  if (!circleVault.ok) {
    add({ group: g12, name: 'Circle USDC held by FxBudget (>= $10 retained)', expected: '>= 10000000', observed: `— (${circleVault.error.slice(0, 100)})`, status: 'RPC_ERROR' })
  } else {
    add({ group: g12, name: 'Circle USDC held by FxBudget (>= $10 retained)', expected: '>= 10000000', observed: circleVault.value, status: BigInt(circleVault.value) >= 10_000_000n ? 'PASS' : 'FAIL', note: fmtUsd(circleVault.value) })
  }
  const supplier = await bal(EURE, SUPPLIER)
  if (!supplier.ok) {
    add({ group: `${HIST} Order #12 payout`, name: 'supplier demo EURe (>= 8 + 8.7 + 1000)', expected: '>= 1016700000', observed: `— (${supplier.error.slice(0, 100)})`, status: 'RPC_ERROR' })
  } else {
    add({ group: `${HIST} Order #12 payout`, name: 'supplier demo EURe (>= 8 + 8.7 + 1000)', expected: '>= 1016700000', observed: supplier.value, status: BigInt(supplier.value) >= 1_016_700_000n ? 'PASS' : 'FAIL', note: `${fmtEur(supplier.value)} paid from the prefunded demo-EURe vault` })
  }

  // 5. Previous-version evidence: Order #12 charged the full $10 chunk for an €8.00 payout
  const rec12 = chunkCache.get(12)?.find((x) => x.key === 'order-12-seq-1')
  if (rec12) {
    const quotedOut18 = BigInt(rec12.simulated_out)
    const needed = ceilDiv(BigInt(rec12.settlement_out) * 10n ** 12n * BigInt(rec12.amount_in), quotedOut18)
    const over = BigInt(rec12.amount_in) - needed
    add({
      group: `${HIST} Order #12 over-charge (fixed in the upgraded build)`,
      name: 'USDC charged vs ceil(remainingOut x quotedIn / quotedOut)',
      expected: 'charged 10000000 > needed 8924111 (over-charge 1075889)',
      observed: `charged ${rec12.amount_in}, needed ${needed}, over-charge ${over}`,
      status: over === 1_075_889n ? 'PASS' : 'FAIL',
      note: `${fmtUsd(over)} over-charged by the previous build; the upgraded build charges the adjusted input`,
    })
  }

  // 6. Deployment authority (informational: documents what the DAO / agent key do NOT control)
  const agentKeys = await rpc<{ keys: Array<{ public_key: string; access_key: { permission: any } }> }>('query', { request_type: 'view_access_key_list', finality: 'final', account_id: AGENT })
  if (!agentKeys.ok) {
    add({ group: 'authority', name: 'agent account keys', expected: 'restricted FunctionCall key present', observed: `— (${agentKeys.error.slice(0, 100)})`, status: 'RPC_ERROR' })
  } else {
    const restricted = agentKeys.value.keys.some((k) => {
      const p = k.access_key.permission
      return typeof p === 'object' && p.FunctionCall?.receiver_id === FX && JSON.stringify(p.FunctionCall.method_names) === '["execute_chunk"]'
    })
    add({ group: 'authority', name: 'agent has a key restricted to FxBudget::execute_chunk', expected: 'true', observed: String(restricted), status: restricted ? 'PASS' : 'FAIL' })
    const full = agentKeys.value.keys.filter((k) => k.access_key.permission === 'FullAccess').length
    add({ group: 'authority', name: 'agent account FullAccess keys (not controlled by the DAO or the restricted key)', expected: '(informational)', observed: String(full), status: 'INFO', note: 'The restricted key only limits the key the agent loads; any FullAccess key on the account is separate authority' })
  }
  const fxKeys = await rpc<{ keys: Array<{ access_key: { permission: any } }> }>('query', { request_type: 'view_access_key_list', finality: 'final', account_id: FX })
  if (fxKeys.ok) {
    const full = fxKeys.value.keys.filter((k) => k.access_key.permission === 'FullAccess').length
    add({ group: 'authority', name: 'FxBudget account FullAccess keys (deployment authority: can replace code / move vault tokens)', expected: '(informational)', observed: String(full), status: 'INFO', note: 'The DAO owns the contract LOGIC (set_agent, limits, approve_order) but not the deployer key' })
  }

  // 7. Which build is deployed (informational unless --expect-upgraded)
  const cap = await view<unknown>(FX, 'get_order_payout_cap', { id: 1 })
  add({
    group: 'deployed build',
    name: 'payout-cap view (get_order_payout_cap) deployed',
    expected: expectUpgraded ? 'callable' : '(informational)',
    observed: cap.ok ? 'yes (upgraded build deployed)' : cap.methodMissing ? 'no (deployed contract is the previous build)' : `— (${cap.error.slice(0, 100)})`,
    status: expectUpgraded ? (cap.ok ? 'PASS' : cap.methodMissing ? 'FAIL' : 'RPC_ERROR') : cap.ok || cap.methodMissing ? 'INFO' : 'RPC_ERROR',
    note: cap.ok ? undefined : 'Until the upgraded build is deployed, the payout-bound and adjusted-final-chunk behaviour is NOT proven on testnet',
  })

  // 8. Legacy orders (target_out == 0): informational policy view when the upgraded build is live
  if (cap.ok) {
    const all = await view<any[]>(FX, 'list_orders', { from_index: 0, limit: 100 })
    if (all.ok) {
      for (const o of all.value.filter((x) => BigInt(x.target_out || '0') === 0n && (x.status === 'Pending' || x.status === 'Active'))) {
        const c = await view<unknown>(FX, 'get_order_payout_cap', { id: o.id })
        add({
          group: 'legacy orders (upgraded build)',
          name: `legacy Order #${o.id} (${o.status}, no invoice target) payout cap`,
          expected: 'null: cannot pay until the DAO sets a cap',
          observed: c.ok ? JSON.stringify(c.value) : `— (${c.error.slice(0, 80)})`,
          status: c.ok ? (c.value === null ? 'PASS' : 'INFO') : 'RPC_ERROR',
        })
      }
    }
  }

  await freshInvoice(code.ok ? code.value.sha256 : null)
}

/** Fresh escrowed invoice captured from the UPGRADED build. Pending until docs/evidence/fresh-invoice.json is captured. */
async function freshInvoice(liveCodeSha: string | null) {
  const group = 'Fresh invoice (UPGRADED build)'
  let manifest: FreshInvoiceManifest | null = null
  try {
    manifest = JSON.parse(fs.readFileSync(FRESH_MANIFEST, 'utf-8')) as FreshInvoiceManifest
  } catch {
    manifest = null
  }

  if (!manifest || manifest.status !== 'captured' || manifest.orderId === undefined) {
    add({
      group,
      name: 'fresh escrowed invoice from the upgraded build',
      expected: expectFresh ? 'captured' : '(not yet captured)',
      observed: 'pending',
      status: expectFresh ? 'FAIL' : 'INFO',
      note: 'Needs the upgraded contract deployed and one signed run (docs/UPGRADE_AND_FRESH_INVOICE.md). Orders #8/#11/#12 above are the PREVIOUS build.',
    })
    return
  }

  const id = manifest.orderId
  const [order, chunks, escrow] = await Promise.all([
    view<OrderView>(FX, 'get_order', { id }),
    view<ChunkView[]>(FX, 'list_order_chunks', { order_id: id }),
    view<EscrowView>(FX, 'get_order_escrow', { id }),
  ])
  if (!order.ok || !chunks.ok || !escrow.ok) {
    const err = [order, chunks, escrow].find((r) => !r.ok) as RpcErr
    add({ group, name: `read Order #${id}`, expected: 'views answered', observed: `— (${err.error.slice(0, 120)})`, status: 'RPC_ERROR' })
    return
  }

  add({ group, name: `Order #${id} (${manifest.invoiceRef ?? order.value.invoice_ref ?? ''})`, expected: 'Completed', observed: order.value.status, status: order.value.status === 'Completed' ? 'PASS' : 'FAIL', note: 'canonical Circle testnet USDC escrow; payout is DEMO EURe from the prefunded vault; FX conversion is SIMULATED' })

  const rec = reconcileInvoice(order.value, chunks.value, escrow.value, { expectRefunded: true, expectAdjustedFinalChunk: true })
  for (const c of rec.checks) {
    add({ group, name: c.name, expected: c.expected, observed: c.observed, status: c.ok ? 'PASS' : 'FAIL', note: c.note })
  }
  const saved = previousBuildOvercharge(order.value, rec)
  add({ group, name: 'USDC saved vs the previous build (which charged the full planned chunk)', expected: '> 0', observed: `${saved} (${fmtUsd(saved)})`, status: saved > 0n ? 'PASS' : 'FAIL' })

  // The code that produced the evidence must be the upgrade artifact, and still be the live code (or a successor).
  const next = loadArtifacts().find((a) => a.file === 'fx_budget.next.wasm')
  if (manifest.contractCodeSha256) {
    add({ group, name: 'contract code at capture time == upgrade artifact', expected: next?.sha256 ?? '', observed: manifest.contractCodeSha256, status: next && next.sha256 === manifest.contractCodeSha256 ? 'PASS' : 'FAIL' })
    add({ group, name: 'live contract code still == capture-time code', expected: manifest.contractCodeSha256, observed: liveCodeSha ?? '—', status: liveCodeSha === null ? 'RPC_ERROR' : liveCodeSha === manifest.contractCodeSha256 ? 'PASS' : 'INFO' })
  }

  // Wallet-level reconciliation measured around the run.
  const b = manifest.balances
  if (b) {
    const dWallet = BigInt(b.walletCircleUsdcBefore) - BigInt(b.walletCircleUsdcAfter)
    const dVault = BigInt(b.fxBudgetCircleUsdcAfter) - BigInt(b.fxBudgetCircleUsdcBefore)
    const dSupplier = BigInt(b.supplierEureAfter) - BigInt(b.supplierEureBefore)
    add({ group, name: 'wallet Circle USDC net debit == charged USDC (funded - refunded)', expected: rec.chargedIn.toString(), observed: dWallet.toString(), status: dWallet === rec.chargedIn ? 'PASS' : 'FAIL' })
    add({ group, name: 'FxBudget Circle USDC net credit == charged USDC', expected: rec.chargedIn.toString(), observed: dVault.toString(), status: dVault === rec.chargedIn ? 'PASS' : 'FAIL' })
    add({ group, name: 'supplier demo EURe credit == paid-out amount', expected: rec.paidOut.toString(), observed: dSupplier.toString(), status: dSupplier === rec.paidOut ? 'PASS' : 'FAIL' })
  }

  // Receipts: each link is the PARENT transaction (token transfers + callbacks are inside its receipt tree).
  for (const [kind, r] of Object.entries(manifest.receipts ?? {})) {
    if (!r) continue
    const tx = await rpc<any>('EXPERIMENTAL_tx_status', { tx_hash: r.txHash, sender_account_id: r.signer, wait_until: 'NONE' })
    const link = TX_LINK(r.txHash)
    if (!tx.ok) {
      add({ group, name: `${kind} receipt ${r.txHash.slice(0, 8)}… (parent tx)`, expected: `${r.method} by ${r.signer}`, observed: 'not retrievable from the RPC (may be pruned; open the link)', status: 'INFO', note: link })
      continue
    }
    const t = tx.value
    const methods = (t.transaction?.actions ?? []).map((a: any) => a.FunctionCall?.method_name).filter(Boolean)
    const ok = typeof t.status === 'object' && 'SuccessValue' in t.status
    add({
      group,
      name: `${kind} receipt ${r.txHash.slice(0, 8)}… (parent tx)`,
      expected: `${r.method} signed by ${r.signer}, succeeded`,
      observed: `${methods.join(',')} signed by ${t.transaction?.signer_id}, ${ok ? 'SuccessValue' : Object.keys(t.status ?? {})[0]}`,
      status: methods.includes(r.method) && t.transaction?.signer_id === r.signer && ok ? 'PASS' : 'FAIL',
      note: link,
    })
  }
}

function render() {
  const counts = { PASS: 0, FAIL: 0, RPC_ERROR: 0, INFO: 0 } as Record<Status, number>
  for (const c of checks) counts[c.status]++

  if (asJson) {
    console.log(JSON.stringify({ rpcs: RPCS, counts, checks }, null, 2))
  } else {
    let group = ''
    for (const c of checks) {
      if (c.group !== group) {
        group = c.group
        console.log(`\n== ${group}`)
      }
      const tag = { PASS: 'PASS     ', FAIL: 'FAIL     ', RPC_ERROR: 'RPC_ERROR', INFO: 'INFO     ' }[c.status]
      console.log(`  [${tag}] ${c.name}`)
      if (c.status !== 'INFO' || c.observed) console.log(`              expected: ${c.expected}\n              observed: ${c.observed}`)
      if (c.note) console.log(`              note:     ${c.note}`)
    }
    console.log('\n' + '-'.repeat(72))
    console.log(`RPC: ${RPCS.join(', ')}`)
    console.log(`PASS ${counts.PASS}   FAIL ${counts.FAIL}   RPC_ERROR ${counts.RPC_ERROR}   INFO ${counts.INFO}`)
    if (counts.FAIL > 0) console.log('RESULT: ASSERTION FAILURE: the live chain does not match the documented evidence (exit 1).')
    else if (counts.RPC_ERROR > 0) console.log('RESULT: INCONCLUSIVE: the RPC could not answer some checks. No assertion failed, but not everything was verified (exit 2). Retry or pass --rpc.')
    else console.log('RESULT: ALL ASSERTED CHECKS PASSED against live testnet state.')
  }
  process.exit(counts.FAIL > 0 ? 1 : counts.RPC_ERROR > 0 ? 2 : 0)
}

main()
  .then(render)
  .catch((err) => {
    console.error('verify-readonly crashed:', err)
    process.exit(3)
  })

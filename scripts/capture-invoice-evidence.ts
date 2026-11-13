/**
 * GetNear — capture the fresh-invoice evidence. READ-ONLY: view calls + transaction lookups only; signs nothing.
 *
 * Run the invoice through the dashboard first (see docs/UPGRADE_AND_FRESH_INVOICE.md), then:
 *
 *   # 1) BEFORE funding: record balances
 *   pnpm evidence:balances --wallet alice.testnet --out before.json
 *
 *   # 2) AFTER the refund: verify everything and write docs/evidence/fresh-invoice.json
 *   pnpm evidence:capture --order 13 --wallet alice.testnet --before before.json \
 *        --fund-tx <hash> --payout-tx <hash> --refund-tx <hash> [--refund-signer <acct>] [--write]
 *
 * Without --write it only prints the verification. The manifest is written ONLY if every check passes.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { codeSha256, resolveRpcs, rpc, view } from './lib/rpc.js'
import { loadArtifacts, ROOT } from './lib/artifacts.js'
import { reconcileInvoice, previousBuildOvercharge, TX_LINK, type ChunkView, type EscrowView, type FreshInvoiceManifest, type OrderView, type Receipt } from './lib/invoice-evidence.js'

const FX = process.env.FX_BUDGET_CONTRACT_ID || 'fx-budget.chilliroger-operator.testnet'
const OPERATOR = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const AGENT = process.env.AGENT_ACCOUNT_ID || 'chilliroger-agent.testnet'
const EURE = process.env.EURE_CONTRACT_ID || `eure.${OPERATOR}`
const CIRCLE = process.env.USDC_CONTRACT_ID || '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af'
const OUT = path.join(ROOT, 'docs', 'evidence', 'fresh-invoice.json')

const argv = process.argv.slice(2)
const cmd = argv[0]
const flag = (n: string) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : undefined
}
const RPCS = resolveRpcs(argv)

async function balances(wallet: string, supplier: string) {
  const get = async (tok: string, acct: string) => {
    const r = await view<string>(RPCS, tok, 'ft_balance_of', { account_id: acct })
    if (!r.ok) throw new Error(`ft_balance_of ${tok} ${acct}: ${r.error}`)
    return r.value
  }
  return {
    walletCircleUsdc: await get(CIRCLE, wallet),
    fxBudgetCircleUsdc: await get(CIRCLE, FX),
    supplierEure: await get(EURE, supplier),
  }
}

async function main() {
  const wallet = flag('--wallet')
  if (!wallet) throw new Error('--wallet <account> is required')

  if (cmd === 'balances') {
    const supplier = flag('--supplier') ?? `supplier-eu.${OPERATOR}`
    const b = { takenAt: new Date().toISOString(), wallet, supplier, ...(await balances(wallet, supplier)) }
    const out = flag('--out')
    if (out) fs.writeFileSync(out, JSON.stringify(b, null, 2) + '\n')
    console.log(JSON.stringify(b, null, 2))
    return
  }
  if (cmd !== 'capture') throw new Error('usage: evidence-capture <balances|capture> --wallet <account> ...')

  const orderId = Number(flag('--order'))
  if (!Number.isInteger(orderId)) throw new Error('--order <id> is required')
  const beforeFile = flag('--before')
  if (!beforeFile) throw new Error('--before <file from `evidence:balances`> is required')
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf-8'))

  const [order, chunks, escrow, code] = await Promise.all([
    view<OrderView>(RPCS, FX, 'get_order', { id: orderId }),
    view<ChunkView[]>(RPCS, FX, 'list_order_chunks', { order_id: orderId }),
    view<EscrowView>(RPCS, FX, 'get_order_escrow', { id: orderId }),
    codeSha256(RPCS, FX),
  ])
  for (const r of [order, chunks, escrow, code]) if (!r.ok) throw new Error(`RPC error: ${r.error}`)
  const o = (order as { ok: true; value: OrderView }).value
  const cs = (chunks as { ok: true; value: ChunkView[] }).value
  const es = (escrow as { ok: true; value: EscrowView }).value
  const codeSha = (code as { ok: true; value: { sha256: string } }).value.sha256

  const problems: string[] = []
  const next = loadArtifacts().find((a) => a.file === 'fx_budget.next.wasm')
  if (!next || next.sha256 !== codeSha) problems.push(`deployed code ${codeSha} is not the upgrade artifact ${next?.sha256 ?? '(missing)'}: the invoice did not run on the upgraded build`)
  if (o.status !== 'Completed') problems.push(`Order #${orderId} is ${o.status}, expected Completed`)

  const rec = reconcileInvoice(o, cs, es, { expectRefunded: true, expectAdjustedFinalChunk: true })
  console.log(`Order #${orderId} (${o.invoice_ref ?? ''})  status=${o.status}  label="${rec.displayLabel}"`)
  for (const c of rec.checks) {
    console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.name}\n         expected ${c.expected}\n         observed ${c.observed}`)
    if (!c.ok) problems.push(`${c.name}: expected ${c.expected}, observed ${c.observed}`)
  }

  const after = await balances(wallet, before.supplier)
  const dWallet = BigInt(before.walletCircleUsdc) - BigInt(after.walletCircleUsdc)
  const dVault = BigInt(after.fxBudgetCircleUsdc) - BigInt(before.fxBudgetCircleUsdc)
  const dSupplier = BigInt(after.supplierEure) - BigInt(before.supplierEure)
  console.log(`\nBalances: wallet Circle USDC -${dWallet} | FxBudget Circle USDC +${dVault} | supplier demo EURe +${dSupplier}`)
  if (dWallet !== rec.chargedIn) problems.push(`wallet net debit ${dWallet} != charged ${rec.chargedIn}`)
  if (dVault !== rec.chargedIn) problems.push(`FxBudget net credit ${dVault} != charged ${rec.chargedIn}`)
  if (dSupplier !== rec.paidOut) problems.push(`supplier EURe credit ${dSupplier} != paid out ${rec.paidOut}`)

  // Receipts (parent transactions)
  const wanted: Array<[keyof NonNullable<FreshInvoiceManifest['receipts']>, string, string, string]> = [
    ['funding', '--fund-tx', 'ft_transfer_call', flag('--fund-signer') ?? wallet],
    ['payout', '--payout-tx', 'execute_chunk', flag('--payout-signer') ?? AGENT],
    ['refund', '--refund-tx', 'refund_unused_escrow', flag('--refund-signer') ?? wallet],
  ]
  const receipts: NonNullable<FreshInvoiceManifest['receipts']> = {}
  for (const [kind, f, method, signer] of wanted) {
    const hash = flag(f)
    if (!hash) {
      problems.push(`${f} <hash> is required`)
      continue
    }
    const tx = await rpc<any>('EXPERIMENTAL_tx_status', { tx_hash: hash, sender_account_id: signer, wait_until: 'NONE' }, RPCS)
    if (!tx.ok) {
      problems.push(`${kind} tx ${hash} not retrievable for signer ${signer}: ${tx.error.slice(0, 100)}`)
      continue
    }
    const methods = (tx.value.transaction?.actions ?? []).map((a: any) => a.FunctionCall?.method_name).filter(Boolean)
    const ok = typeof tx.value.status === 'object' && 'SuccessValue' in tx.value.status
    console.log(`  [${methods.includes(method) && ok ? 'PASS' : 'FAIL'}] ${kind} receipt ${hash}: ${methods.join(',')} by ${tx.value.transaction?.signer_id}`)
    if (!methods.includes(method) || !ok) problems.push(`${kind} tx ${hash} is not a successful ${method}`)
    const note: Record<string, string> = {
      funding: 'Circle testnet USDC ft_transfer_call into FxBudget escrow (parent tx; ft_transfer + ft_on_transfer receipts inside)',
      payout: 'execute_chunk (parent tx; contains the demo-EURe ft_transfer from the prefunded vault and the on_chunk_settled callback)',
      refund: 'manually triggered refund_unused_escrow (parent tx; contains the Circle USDC ft_transfer back to the requester)',
    }
    receipts[kind] = { txHash: hash, signer, method, explorerUrl: TX_LINK(hash), note: note[kind] } satisfies Receipt
  }

  console.log(`\nUSDC saved vs the previous build (full planned chunk): ${previousBuildOvercharge(o, rec)}`)
  if (problems.length > 0) {
    console.error('\nNOT CAPTURED. Problems:\n  - ' + problems.join('\n  - '))
    process.exit(1)
  }

  const manifest: FreshInvoiceManifest = {
    status: 'captured',
    note: 'Evidence from the UPGRADED build. USDC escrow is canonical Circle testnet USDC; payout is DEMO EURe from the prefunded vault; the FX conversion is SIMULATED (1Click dry quote is indicative only).',
    plan: JSON.parse(fs.readFileSync(OUT, 'utf-8')).plan,
    orderId,
    invoiceRef: o.invoice_ref ?? undefined,
    capturedAt: new Date().toISOString(),
    contractCodeSha256: codeSha,
    receipts,
    balances: {
      walletCircleUsdcBefore: before.walletCircleUsdc,
      walletCircleUsdcAfter: after.walletCircleUsdc,
      fxBudgetCircleUsdcBefore: before.fxBudgetCircleUsdc,
      fxBudgetCircleUsdcAfter: after.fxBudgetCircleUsdc,
      supplierEureBefore: before.supplierEure,
      supplierEureAfter: after.supplierEure,
    },
  }
  if (argv.includes('--write')) {
    fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n')
    console.log(`\nAll checks passed. Wrote ${path.relative(ROOT, OUT)}. Now run: pnpm verify:readonly --expect-upgraded --expect-fresh`)
  } else {
    console.log('\nAll checks passed. Re-run with --write to record docs/evidence/fresh-invoice.json.')
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

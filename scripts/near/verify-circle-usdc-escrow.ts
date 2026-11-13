/**
 * GetNear — Live Circle Native Testnet USDC Escrow + EURe Payout E2E Verification
 * WRITE-ENABLED: signs with local near-cli credentials (operator) and the restricted agent key. Sends transactions.
 *
 * Proves end-to-end on NEAR testnet, on the UPGRADED FxBudget + agent:
 * 1. Canonical Circle Native NEAR Testnet USDC (3e2210e...4afcb8af) is configured on FxBudget.
 * 2. ft_transfer_call sends 15.00 Circle USDC from the operator into FxBudget escrow, creating an Active invoice
 *    order (target EUR 8.00 demo EURe, chunk cap $10.00 USDC).
 * 3. AgentRunner.tick() fetches the live 1Click dry quote (indicative; FX is SIMULATED) + ECB rate. The quote for the
 *    planned $10.00 chunk exceeds the EUR 8.00 due, so the payout is CAPPED at the remaining invoice balance and the
 *    USDC charged is RECALCULATED at full quote precision: ceil(8e6 x quotedIn / quotedOut) < $10.00. Demo EURe is
 *    paid from the prefunded vault via #[private] on_chunk_settled and the order becomes Completed (amount due 0).
 * 4. refund_unused_escrow (a manual call) returns funded - charged USDC; everything reconciles:
 *    funded = charged + refunded + remaining(0).
 *
 * Every figure is derived from chain state (scripts/lib/invoice-evidence.ts), not hard-coded: the previous build
 * charged the full $10.00 and refunded $5.00 (Order #12); this script fails if the adjusted-input behaviour is absent.
 *
 * Usage: pnpm tsx scripts/near/verify-circle-usdc-escrow.ts
 */

try {
  process.loadEnvFile()
} catch {}

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as assert from 'node:assert/strict'
import { NearClient } from '@getnear/near-client'
import { AgentRunner } from '../../apps/agent/src/runner.js'
import { getRecentFills } from '../../apps/agent/src/db.js'
import { runCallFunction } from './near-runner.js'
import { buildEscrowTransferCallArgs, type InvoiceOrderParams } from './order-args.js'
import { reconcileInvoice, previousBuildOvercharge } from '../lib/invoice-evidence.js'

const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const AGENT_ID = process.env.AGENT_ACCOUNT_ID || 'chilliroger-agent.testnet'
const CONTRACT_ID = process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${OPERATOR_ID}`
const CIRCLE_USDC_ID =
  process.env.USDC_CONTRACT_ID ||
  '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af'
const EURE_ID = process.env.EURE_CONTRACT_ID || `eure.${OPERATOR_ID}`
const SUPPLIER_ID = `supplier-eu.${OPERATOR_ID}`
const RPC_URLS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org']

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log('\n====================================================================')
  console.log('GetNear — Live Circle Native Testnet USDC Escrow E2E Verification')
  console.log('====================================================================\n')

  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: RPC_URLS,
  })

  // 1. Verify contract V3 input_token matches Circle Native Testnet USDC
  const inputToken = await client.callView<string | null>(CONTRACT_ID, 'get_input_token', {})
  console.log(`[1] FxBudget input_token: ${inputToken}`)
  assert.equal(
    inputToken,
    CIRCLE_USDC_ID,
    `Expected get_input_token() == ${CIRCLE_USDC_ID}, got ${inputToken}`,
  )

  const isPaused = await client.callView<boolean>(CONTRACT_ID, 'is_paused', {})
  assert.equal(isPaused, false, 'FxBudget contract must not be paused')

  const existingOrders = await client.callView<Array<{ id: number; status: string }>>(
    CONTRACT_ID,
    'list_orders',
    { from_index: 0, limit: 100 },
  )
  const activeBefore = existingOrders.filter((o) => o.status === 'Active')
  assert.equal(
    activeBefore.length,
    0,
    `Expected 0 Active orders before drill, found: ${activeBefore.map((o) => o.id).join(', ')}`,
  )

  // Verify NEP-145 storage registration on Circle USDC vault & EURe supplier
  const [contractUsdcStorage, supplierEureStorage] = await Promise.all([
    client.callView<{ total?: string } | null>(CIRCLE_USDC_ID, 'storage_balance_of', {
      account_id: CONTRACT_ID,
    }),
    client.callView<{ total?: string } | null>(EURE_ID, 'storage_balance_of', {
      account_id: SUPPLIER_ID,
    }),
  ])
  assert.ok(contractUsdcStorage && BigInt(contractUsdcStorage.total || '0') > 0n, 'Contract must be registered on Circle USDC')
  assert.ok(supplierEureStorage && BigInt(supplierEureStorage.total || '0') > 0n, 'Supplier must be registered on EURe')

  // 2. Snapshot live balances before escrow funding
  const [opUsdc0Str, contractUsdc0Str, contractEure0Str, supplierEure0Str] = await Promise.all([
    client.callView<string>(CIRCLE_USDC_ID, 'ft_balance_of', { account_id: OPERATOR_ID }),
    client.callView<string>(CIRCLE_USDC_ID, 'ft_balance_of', { account_id: CONTRACT_ID }),
    client.callView<string>(EURE_ID, 'ft_balance_of', { account_id: CONTRACT_ID }),
    client.callView<string>(EURE_ID, 'ft_balance_of', { account_id: SUPPLIER_ID }),
  ])

  const opUsdc0 = BigInt(opUsdc0Str)
  const contractUsdc0 = BigInt(contractUsdc0Str)
  const contractEure0 = BigInt(contractEure0Str)
  const supplierEure0 = BigInt(supplierEure0Str)

  console.log(`[2] Initial balances:`)
  console.log(`    Operator Circle USDC:  ${(Number(opUsdc0) / 1e6).toFixed(2)} USDC`)
  console.log(`    FxBudget Circle USDC:  ${(Number(contractUsdc0) / 1e6).toFixed(2)} USDC`)
  console.log(`    FxBudget EURe vault:   ${(Number(contractEure0) / 1e6).toFixed(2)} EURe`)
  console.log(`    Supplier EURe balance: ${(Number(supplierEure0) / 1e6).toFixed(2)} EURe`)

  assert.ok(opUsdc0 >= 10_000_000n, `Operator needs >= 10.00 Circle USDC, has ${Number(opUsdc0) / 1e6}`)

  // 3. Escrow Circle Native USDC via ft_transfer_call -> FxBudget::ft_on_transfer
  const isFull15 = opUsdc0 >= 15_000_000n
  const escrowAmount = isFull15 ? 15_000_000n : 10_000_000n
  const maxChunkAmount = 10_000_000n
  const targetOutAmount = isFull15 ? 8_000_000n : 5_000_000n
  const deadlineNs = (BigInt(Date.now()) + 3_600_000n) * 1_000_000n
  const invoiceRef = `INV-FINAL-CHUNK-${Math.floor(Date.now() / 1000)}`

  const invoiceParams: InvoiceOrderParams = {
    totalInAtomic: escrowAmount,
    maxChunkInAtomic: maxChunkAmount,
    targetOutAtomic: targetOutAmount, // REQUIRED: bounds the payout on-chain
    recipient: SUPPLIER_ID,
    invoiceRef,
    deadlineNs,
    maxDevBps: 250,
  }

  console.log(`\n[3] Calling Circle USDC ft_transfer_call ($15.00 USDC -> FxBudget escrow)...`)
  const fundTx = runCallFunction({
    contractId: CIRCLE_USDC_ID,
    methodName: 'ft_transfer_call',
    args: buildEscrowTransferCallArgs(CONTRACT_ID, invoiceParams),
    deposit: '1 yoctoNEAR',
    gas: '150.0 Tgas',
    signerId: OPERATOR_ID,
  })
  console.log(`    Escrow Fund Tx: ${fundTx.explorerUrl || fundTx.txHash}`)
  assert.ok(fundTx.txHash, 'Escrow ft_transfer_call must produce a transaction hash')

  await sleep(3500)

  const ordersAfterFund = await client.callView<Array<any>>(CONTRACT_ID, 'list_orders', {
    from_index: 0,
    limit: 100,
  })
  const createdOrder = ordersAfterFund.find((o) => o.invoice_ref === invoiceRef)
  assert.ok(createdOrder, `Created escrowed order ${invoiceRef} not found on-chain`)
  const orderId: number = createdOrder.id
  assert.equal(createdOrder.status, 'Active', `Expected Active status (< $100 auto-cap), got ${createdOrder.status}`)
  assert.equal(createdOrder.total_in, escrowAmount.toString())
  assert.equal(createdOrder.target_out, targetOutAmount.toString())

  const [escrowAfterFund, opUsdc1Str, contractUsdc1Str] = await Promise.all([
    client.callView<{
      order_id: number
      escrowed_in: string
      executed_in: string
      refunded_in: string
      remaining_escrow_in: string
    } | null>(CONTRACT_ID, 'get_order_escrow', { id: orderId }),
    client.callView<string>(CIRCLE_USDC_ID, 'ft_balance_of', { account_id: OPERATOR_ID }),
    client.callView<string>(CIRCLE_USDC_ID, 'ft_balance_of', { account_id: CONTRACT_ID }),
  ])

  const opUsdc1 = BigInt(opUsdc1Str)
  const contractUsdc1 = BigInt(contractUsdc1Str)
  assert.equal(opUsdc1, opUsdc0 - escrowAmount, 'Operator Circle USDC must decrease by 15.00')
  assert.equal(contractUsdc1, contractUsdc0 + escrowAmount, 'FxBudget Circle USDC must increase by 15.00')
  assert.deepEqual(escrowAfterFund, {
    order_id: orderId,
    escrowed_in: escrowAmount.toString(),
    executed_in: '0',
    refunded_in: '0',
    remaining_escrow_in: escrowAmount.toString(),
  })
  console.log(`    Verified Order #${orderId} Active with 15.00 Circle USDC in on-chain escrow.`)

  // 4. Execute Chunk #1 via AgentRunner (live 1Click dry:true + Frankfurter + restricted agent key)
  console.log(`\n[4] Running AgentRunner.tick() for Order #${orderId} (planned $10.00 chunk; payout capped at the EUR 8.00 due, input recalculated)...`)
  const runner = new AgentRunner({
    pollIntervalMs: 60_000,
    rpcUrls: RPC_URLS,
  })
  await runner.tick()
  await sleep(3000)

  const orderAfterChunk = await client.callView<any>(CONTRACT_ID, 'get_order', { id: orderId })
  const [escrowAfterChunk, chunk1Record, contractEure1Str, supplierEure1Str] = await Promise.all([
    client.callView<any>(CONTRACT_ID, 'get_order_escrow', { id: orderId }),
    client.callView<any>(CONTRACT_ID, 'get_chunk_record', { key: `order-${orderId}-seq-1` }),
    client.callView<string>(EURE_ID, 'ft_balance_of', { account_id: CONTRACT_ID }),
    client.callView<string>(EURE_ID, 'ft_balance_of', { account_id: SUPPLIER_ID }),
  ])

  const contractEure1 = BigInt(contractEure1Str)
  const supplierEure1 = BigInt(supplierEure1Str)

  assert.equal(orderAfterChunk.status, 'Completed', `Expected Order #${orderId} Completed, got ${orderAfterChunk.status}`)
  assert.equal(orderAfterChunk.settled_out, targetOutAmount.toString(), 'payout must be capped at (and equal) the invoice target')
  assert.equal(orderAfterChunk.pending_in, '0')
  assert.equal(orderAfterChunk.pending_out, '0')
  assert.equal(chunk1Record?.status, 'Settled', `Chunk #1 must be Settled on-chain`)
  assert.equal(supplierEure1, supplierEure0 + targetOutAmount, 'Supplier EURe must increase by the invoice amount')
  assert.equal(contractEure1, contractEure0 - targetOutAmount, 'FxBudget EURe vault must decrease by the invoice amount')

  // The charged USDC must be the RECALCULATED input, strictly below the planned $10.00 chunk, and reconcile.
  const chargedIn = BigInt(chunk1Record.amount_in)
  assert.ok(chargedIn < maxChunkAmount, `Final chunk must charge less than the planned ${maxChunkAmount} (got ${chargedIn}); is the upgraded agent running?`)
  assert.equal(BigInt(orderAfterChunk.executed_in), chargedIn, 'executed_in must equal the charged input')
  assert.equal(BigInt(escrowAfterChunk.remaining_escrow_in), escrowAmount - chargedIn, 'remaining escrow = funded - charged')
  const midRec = reconcileInvoice(orderAfterChunk, [chunk1Record], escrowAfterChunk, { expectAdjustedFinalChunk: true })
  for (const c of midRec.checks.filter((c) => !/refund/i.test(c.name))) {
    assert.ok(c.ok, `${c.name}: expected ${c.expected}, observed ${c.observed}`)
  }

  const fills = getRecentFills(20).filter((f) => f.order_id === orderId)
  assert.ok(fills.length >= 1, 'Expected SQLite fill recorded for escrowed order')
  const confirmedFill = fills.find((f) => f.idempotency_key === `order-${orderId}-seq-1`)
  assert.ok(confirmedFill, 'Expected fill record for order-N-seq-1')
  assert.equal(confirmedFill.settlement_status, 'CONFIRMED')
  assert.equal(confirmedFill.is_simulated, false)
  console.log(`    Chunk #1 Tx: ${confirmedFill.explorer_url || confirmedFill.tx_hash}`)
  console.log(`    Verified Order #${orderId} Completed (amount due 0 -> Paid): +€8.00 demo EURe from the prefunded vault to ${SUPPLIER_ID}.`)
  console.log(`    Charged ${(Number(chargedIn) / 1e6).toFixed(6)} USDC (not 10.000000); unspent escrow ${(Number(escrowAmount - chargedIn) / 1e6).toFixed(6)} USDC.`)

  // 5. Refund unspent 5.00 Circle Native USDC back to requester
  console.log(`\n[5] Calling FxBudget::refund_unused_escrow({ id: ${orderId} }) to return the unspent ${(Number(escrowAmount - chargedIn) / 1e6).toFixed(6)} Circle USDC (manual call)...`)
  const refundTx = runCallFunction({
    contractId: CONTRACT_ID,
    methodName: 'refund_unused_escrow',
    args: { id: orderId },
    deposit: '0 NEAR',
    gas: '100.0 Tgas',
    signerId: OPERATOR_ID,
  })
  console.log(`    Escrow Refund Tx: ${refundTx.explorerUrl || refundTx.txHash}`)
  assert.ok(refundTx.txHash, 'refund_unused_escrow must produce a transaction hash')

  await sleep(3500)

  const [escrowAfterRefund, opUsdc2Str, contractUsdc2Str] = await Promise.all([
    client.callView<any>(CONTRACT_ID, 'get_order_escrow', { id: orderId }),
    client.callView<string>(CIRCLE_USDC_ID, 'ft_balance_of', { account_id: OPERATOR_ID }),
    client.callView<string>(CIRCLE_USDC_ID, 'ft_balance_of', { account_id: CONTRACT_ID }),
  ])

  const opUsdc2 = BigInt(opUsdc2Str)
  const contractUsdc2 = BigInt(contractUsdc2Str)

  const orderFinal = await client.callView<any>(CONTRACT_ID, 'get_order', { id: orderId })
  const rec = reconcileInvoice(orderFinal, [chunk1Record], escrowAfterRefund, {
    expectRefunded: true,
    expectAdjustedFinalChunk: true,
  })
  for (const c of rec.checks) assert.ok(c.ok, `${c.name}: expected ${c.expected}, observed ${c.observed}`)
  assert.deepEqual(escrowAfterRefund, {
    order_id: orderId,
    escrowed_in: escrowAmount.toString(),
    executed_in: chargedIn.toString(),
    refunded_in: (escrowAmount - chargedIn).toString(),
    remaining_escrow_in: '0',
  })
  assert.equal(opUsdc2, opUsdc0 - chargedIn, 'Operator Circle USDC net change must equal -charged (funded - refunded)')
  assert.equal(contractUsdc2, contractUsdc0 + chargedIn, 'FxBudget Circle USDC vault must retain exactly the charged input')
  const savedVsPrevious = previousBuildOvercharge(orderFinal, rec)

  console.log('\n====================================================================')
  console.log('ALL CIRCLE NATIVE USDC ESCROW CHECKS PASSED!')
  console.log('====================================================================')
  console.log(`Order ID:                #${orderId} (${invoiceRef})`)
  console.log(`1. Circle USDC Escrow:   ${fundTx.explorerUrl || fundTx.txHash}`)
  console.log(`2. EURe Chunk #1 Payout: ${confirmedFill.explorer_url || confirmedFill.tx_hash}`)
  console.log(`3. Unspent USDC Refund:  ${refundTx.explorerUrl || refundTx.txHash}`)
  console.log(`(all links are PARENT transactions; the token transfers and callbacks are inside each receipt tree)`)
  console.log(`Funded ${Number(rec.fundedIn) / 1e6} = charged ${Number(rec.chargedIn) / 1e6} + refunded ${Number(rec.refundedIn) / 1e6} + remaining ${Number(rec.remainingEscrowIn) / 1e6}`)
  console.log(`Saved vs previous build (full $10 chunk): ${(Number(savedVsPrevious) / 1e6).toFixed(6)} USDC`)
  console.log(`Final Operator Circle USDC: ${(Number(opUsdc2) / 1e6).toFixed(2)} USDC`)
  console.log(`Final FxBudget Circle USDC: ${(Number(contractUsdc2) / 1e6).toFixed(2)} USDC`)
  console.log(`Final Supplier EURe Delta:  +€${(Number(supplierEure1 - supplierEure0) / 1e6).toFixed(2)} EURe`)

  // Capture manifest to docs/evidence/fresh-invoice.json
  const manifestPath = path.join(process.cwd(), 'docs', 'evidence', 'fresh-invoice.json')
  const { codeSha256 } = await import('../lib/rpc.js')
  const codeShaResult = await codeSha256(RPC_URLS, CONTRACT_ID)
  const manifest = {
    status: 'captured',
    note: 'Evidence from the UPGRADED build. USDC escrow is canonical Circle testnet USDC; payout is DEMO EURe from the prefunded vault; the FX conversion is SIMULATED (1Click dry quote is indicative only).',
    plan: {
      fundCircleUsdc: (Number(escrowAmount) / 1e6).toString(),
      maxChunkUsdc: (Number(maxChunkAmount) / 1e6).toString(),
      targetEure: (Number(targetOutAmount) / 1e6).toString(),
      recipient: SUPPLIER_ID,
      invoiceRef,
      why: 'Final chunk is capped at invoice target due and input charged is recalculated at full quote precision. Unspent escrow is refunded.'
    },
    orderId,
    invoiceRef,
    capturedAt: new Date().toISOString(),
    contractCodeSha256: codeShaResult.ok ? codeShaResult.value.sha256 : '',
    receipts: {
      funding: { txHash: fundTx.txHash, signer: OPERATOR_ID, method: 'ft_transfer_call', explorerUrl: fundTx.explorerUrl, note: 'Circle testnet USDC ft_transfer_call into FxBudget escrow (parent tx; ft_transfer + ft_on_transfer receipts inside)' },
      payout: { txHash: confirmedFill.tx_hash, signer: AGENT_ID, method: 'execute_chunk', explorerUrl: confirmedFill.explorer_url, note: 'execute_chunk (parent tx; contains the demo-EURe ft_transfer from the prefunded vault and the on_chunk_settled callback)' },
      refund: { txHash: refundTx.txHash, signer: OPERATOR_ID, method: 'refund_unused_escrow', explorerUrl: refundTx.explorerUrl, note: 'manually triggered refund_unused_escrow (parent tx; contains the Circle USDC ft_transfer back to the requester)' },
    },
    balances: {
      walletCircleUsdcBefore: opUsdc0Str,
      walletCircleUsdcAfter: opUsdc2Str,
      fxBudgetCircleUsdcBefore: contractUsdc0Str,
      fxBudgetCircleUsdcAfter: contractUsdc2Str,
      supplierEureBefore: supplierEure0Str,
      supplierEureAfter: supplierEure1Str,
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`\nWrote fresh invoice manifest to docs/evidence/fresh-invoice.json`)
}

main().catch((err) => {
  console.error('\nVerification FAILED:', err)
  process.exit(1)
})


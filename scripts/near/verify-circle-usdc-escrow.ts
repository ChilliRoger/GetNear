/**
 * GetNear — Live Circle Native Testnet USDC Escrow + EURe Payout E2E Verification
 *
 * Proves end-to-end on NEAR testnet:
 * 1. Canonical Circle Native NEAR Testnet USDC (3e2210e...4afcb8af) is configured on FxBudget.
 * 2. ft_transfer_call sends 15.00 Circle USDC from chilliroger-operator.testnet into FxBudget escrow,
 *    debiting the operator's real Circle USDC balance (-15.00 USDC) and crediting FxBudget (+15.00 USDC),
 *    creating an Active invoice order (target €8.00 EURe, chunk cap $10.00 USDC).
 * 3. Real AgentRunner.tick() fetches live 1Click dry:true + ECB Frankfurter rates, signs execute_chunk
 *    via the restricted FunctionCall agent key, delivers real €8.00 EURe from FxBudget to
 *    supplier-eu.chilliroger-operator.testnet via #[private] on_chunk_settled, marks Order Completed,
 *    and records SQLite fill with settlement_status='CONFIRMED' and is_simulated=false.
 * 4. refund_unused_escrow returns the unspent 5.00 Circle USDC back to chilliroger-operator.testnet
 *    via cross-contract ft_transfer + #[private] on_escrow_refunded (net -10.00 USDC -> +€8.00 EURe).
 *
 * Usage: pnpm tsx scripts/near/verify-circle-usdc-escrow.ts
 */

try {
  process.loadEnvFile()
} catch {}

import * as assert from 'node:assert/strict'
import { NearClient } from '@getnear/near-client'
import { AgentRunner } from '../../apps/agent/src/runner.js'
import { getRecentFills } from '../../apps/agent/src/db.js'
import { runCallFunction } from './near-runner.js'

const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
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

  assert.ok(opUsdc0 >= 15_000_000n, `Operator needs >= 15.00 Circle USDC, has ${Number(opUsdc0) / 1e6}`)

  // 3. Escrow 15.00 Circle Native USDC via ft_transfer_call -> FxBudget::ft_on_transfer
  const escrowAmount = 15_000_000n // $15.00 USDC
  const maxChunkAmount = 10_000_000n // $10.00 USDC
  const targetOutAmount = 8_000_000n // €8.00 EURe (completed by Chunk #1, leaving $5.00 USDC unspent)
  const deadlineNs = (BigInt(Date.now()) + 3_600_000n) * 1_000_000n
  const invoiceRef = `INV-CIRCLE-15-${Math.floor(Date.now() / 1000)}`

  const escrowMsg = JSON.stringify({
    action: 'create_escrowed_order',
    pair_label: 'USDC/EURe',
    max_chunk_in: maxChunkAmount.toString(),
    deadline_ns: Number(deadlineNs),
    max_dev_bps: 250,
    recipient: SUPPLIER_ID,
    target_out: targetOutAmount.toString(),
    invoice_ref: invoiceRef,
  })

  console.log(`\n[3] Calling Circle USDC ft_transfer_call ($15.00 USDC -> FxBudget escrow)...`)
  const fundTx = runCallFunction({
    contractId: CIRCLE_USDC_ID,
    methodName: 'ft_transfer_call',
    args: {
      receiver_id: CONTRACT_ID,
      amount: escrowAmount.toString(),
      memo: `GetNear Circle USDC escrow: ${invoiceRef}`,
      msg: escrowMsg,
    },
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
  console.log(`\n[4] Running AgentRunner.tick() for Order #${orderId} ($10.00 USDC chunk -> €8.00 EURe)...`)
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
  assert.equal(orderAfterChunk.executed_in, maxChunkAmount.toString())
  assert.equal(orderAfterChunk.settled_out, targetOutAmount.toString())
  assert.equal(orderAfterChunk.pending_in, '0')
  assert.equal(orderAfterChunk.pending_out, '0')
  assert.equal(chunk1Record?.status, 'Settled', `Chunk #1 must be Settled on-chain`)
  assert.equal(supplierEure1, supplierEure0 + targetOutAmount, 'Supplier EURe must increase by +8.00')
  assert.equal(contractEure1, contractEure0 - targetOutAmount, 'FxBudget EURe vault must decrease by -8.00')
  assert.equal(escrowAfterChunk.remaining_escrow_in, '5000000', 'Expected 5.00 Circle USDC remaining unspent in escrow')

  const fills = getRecentFills(20).filter((f) => f.order_id === orderId)
  assert.ok(fills.length >= 1, 'Expected SQLite fill recorded for escrowed order')
  const confirmedFill = fills.find((f) => f.idempotency_key === `order-${orderId}-seq-1`)
  assert.ok(confirmedFill, 'Expected fill record for order-N-seq-1')
  assert.equal(confirmedFill.settlement_status, 'CONFIRMED')
  assert.equal(confirmedFill.is_simulated, false)
  console.log(`    Chunk #1 Tx: ${confirmedFill.explorer_url || confirmedFill.tx_hash}`)
  console.log(`    Verified Order #${orderId} Completed: +€8.00 EURe delivered to ${SUPPLIER_ID}; 5.00 USDC unspent in escrow.`)

  // 5. Refund unspent 5.00 Circle Native USDC back to requester
  console.log(`\n[5] Calling FxBudget::refund_unused_escrow({ id: ${orderId} }) to return unspent 5.00 Circle USDC...`)
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

  assert.deepEqual(escrowAfterRefund, {
    order_id: orderId,
    escrowed_in: '15000000',
    executed_in: '10000000',
    refunded_in: '5000000',
    remaining_escrow_in: '0',
  })
  assert.equal(opUsdc2, opUsdc0 - maxChunkAmount, 'Operator Circle USDC net change must be -10.00 (15.00 escrowed - 5.00 refunded)')
  assert.equal(contractUsdc2, contractUsdc0 + maxChunkAmount, 'FxBudget Circle USDC vault must retain the 10.00 executed USDC')

  console.log('\n====================================================================')
  console.log('ALL CIRCLE NATIVE USDC ESCROW CHECKS PASSED!')
  console.log('====================================================================')
  console.log(`Order ID:                #${orderId} (${invoiceRef})`)
  console.log(`1. Circle USDC Escrow:   ${fundTx.explorerUrl || fundTx.txHash}`)
  console.log(`2. EURe Chunk #1 Payout: ${confirmedFill.explorer_url || confirmedFill.tx_hash}`)
  console.log(`3. Unspent USDC Refund:  ${refundTx.explorerUrl || refundTx.txHash}`)
  console.log(`Final Operator Circle USDC: ${(Number(opUsdc2) / 1e6).toFixed(2)} USDC`)
  console.log(`Final FxBudget Circle USDC: ${(Number(contractUsdc2) / 1e6).toFixed(2)} USDC`)
  console.log(`Final Supplier EURe Delta:  +€${(Number(supplierEure1 - supplierEure0) / 1e6).toFixed(2)} EURe`)
}

main().catch((err) => {
  console.error('\nVerification FAILED:', err)
  process.exit(1)
})


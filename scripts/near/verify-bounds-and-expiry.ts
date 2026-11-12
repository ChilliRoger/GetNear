/**
 * GetNear — Live NEAR Testnet Policy Bounds & Expiry Remainder Drill
 *
 * Dynamically executes on NEAR testnet (fx-budget.chilliroger-operator.testnet):
 * 1. Above auto-cap order starts Pending and rejects execute_chunk before DAO approval.
 * 2. Short-deadline active invoice rejects payouts outside bounds:
 *    - Unauthorized signer (non-agent calling execute_chunk)
 *    - Chunk exceeding max_chunk_in
 *    - Settlement exceeding target_out remaining invoice due
 *    - Chunk exceeding remaining total_in USDC budget
 * 3. Executes one valid partial chunk (€8.70 EURe -> supplier-eu.chilliroger-operator.testnet).
 * 4. After deadline_ns elapses, rejects execute_chunk, executes permissionless expire_order,
 *    and verifies status === 'Expired' with exact remaining_due_out > 0 (€16.30 EURe unpaid).
 *
 * Usage: pnpm tsx scripts/near/verify-bounds-and-expiry.ts
 */

try {
  process.loadEnvFile()
} catch {}

import * as assert from 'node:assert/strict'
import { NearClient } from '@getnear/near-client'
import { AgentRunner } from '../../apps/agent/src/runner.js'
import { extractTxInfo, runCallFunction } from './near-runner.js'

const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const CONTRACT_ID = process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${OPERATOR_ID}`
const AGENT_ID = process.env.AGENT_ACCOUNT_ID || 'chilliroger-agent.testnet'
const SUPPLIER_ID = `supplier-eu.${OPERATOR_ID}`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function expectRejectedCall(
  label: string,
  fn: () => unknown,
  expectedPattern: RegExp,
): { txHash?: string } {
  try {
    fn()
  } catch (err: any) {
    const combined = `${err?.message || ''}\n${err?.stderr || ''}\n${err?.stdout || ''}`
    // Release WASM compiled with panic="abort" reports WasmTrap unreachable + ERROR Transaction failed
    const releaseTrapPattern = /ERROR Transaction failed|WebAssembly trap/
    if (!expectedPattern.test(combined)) {
      assert.match(combined, releaseTrapPattern, `${label}: unexpected rejection output:\n${combined}`)
    }
    const info = extractTxInfo(combined)
    console.log(`✓ Rejected cleanly on-chain [${label}]${info.txHash ? ` (Tx: ${info.txHash})` : ''}`)
    return { txHash: info.txHash }
  }
  throw new Error(`Expected transaction rejection for [${label}], but call succeeded!`)
}

async function main() {
  console.log('═'.repeat(70))
  console.log('  GetNear — Live Testnet Bounds & Expiry Unpaid-Remainder Drill')
  console.log('═'.repeat(70))

  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  })

  const runner = new AgentRunner()
  const restrictedCredPath = await runner.resolveAgentCredentialPath()
  assert.ok(restrictedCredPath, 'Restricted FunctionCall key for execute_chunk must exist locally')

  const limits = await client.callView<any>(CONTRACT_ID, 'get_limits', {})
  const autoCapIn = BigInt(limits.auto_cap_in)
  console.log(
    `Contract limits: auto_cap=$${Number(autoCapIn) / 1e6}, max_chunk=$${Number(limits.max_chunk_in) / 1e6}, min_interval=${limits.min_interval_ns / 1e9}s`,
  )

  // Clean up any leftover INV-PENDING-GATE helper order from interrupted runs
  const preExisting = await client.callView<any[]>(CONTRACT_ID, 'list_orders', {
    from_index: 0,
    limit: 50,
  })
  for (const prev of preExisting) {
    if (prev.invoice_ref === 'INV-PENDING-GATE' && (prev.status === 'Pending' || prev.status === 'Active')) {
      console.log(`Cleaning up leftover helper Order #${prev.id} (${prev.invoice_ref})...`)
      runCallFunction({
        contractId: CONTRACT_ID,
        methodName: 'cancel_order',
        args: { id: prev.id },
        deposit: '0 NEAR',
        gas: '50.0 Tgas',
        signerId: OPERATOR_ID,
      })
      await sleep(2500)
    }
  }

  // 1. Above-auto-cap order must start Pending and block execute_chunk prior to DAO approval
  console.log('\n[1/5] Verifying Pending gate on above-threshold order...')
  const aboveCapTotal = (autoCapIn + 20_000_000n).toString()
  const pendingCreate = runCallFunction({
    contractId: CONTRACT_ID,
    methodName: 'create_order',
    args: {
      pair_label: 'USDC/EURe',
      total_in: aboveCapTotal,
      max_chunk_in: '15000000',
      deadline_ns: (Date.now() + 600_000) * 1_000_000,
      max_dev_bps: 150,
      recipient: SUPPLIER_ID,
      target_out: '100000000',
      invoice_ref: 'INV-PENDING-GATE',
    },
    deposit: '0 NEAR',
    gas: '80.0 Tgas',
    signerId: OPERATOR_ID,
  })
  await sleep(2500)
  const listAfterPending = await client.callView<any[]>(CONTRACT_ID, 'list_orders', {
    from_index: 0,
    limit: 50,
  })
  const pendingOrder = listAfterPending[listAfterPending.length - 1]
  assert.equal(pendingOrder.status, 'Pending')

  let pendingReject: { txHash?: string } = {}
  try {
    pendingReject = expectRejectedCall(
      'Pending order cannot execute_chunk before DAO approval',
      () =>
        runCallFunction({
          contractId: CONTRACT_ID,
          methodName: 'execute_chunk',
          args: {
            id: pendingOrder.id,
            amount_in: '10000000',
            quote_ref: 'sha256:pending-gate-check',
            deviation_bps: 0,
            simulated_out: '8700000000000000000',
            settlement_out: '8700000',
            idempotency_key: `order-${pendingOrder.id}-seq-1`,
          },
          deposit: '0 NEAR',
          gas: '120.0 Tgas',
          signerId: AGENT_ID,
          credentialPath: restrictedCredPath,
        }),
      /Order is not Active/,
    )
    const pendingSummary = await client.callView<any>(CONTRACT_ID, 'get_invoice_summary', {
      id: pendingOrder.id,
    })
    assert.equal(pendingSummary.settled_out, '0')
    assert.equal(pendingSummary.chunks_count, 0)
  } finally {
    // Always cancel helper pending order so open order slots stay clean
    runCallFunction({
      contractId: CONTRACT_ID,
      methodName: 'cancel_order',
      args: { id: pendingOrder.id },
      deposit: '0 NEAR',
      gas: '50.0 Tgas',
      signerId: OPERATOR_ID,
    })
    await sleep(2500)
  }
  console.log(`✓ Order #${pendingOrder.id} cancelled cleanly (Create Tx: ${pendingCreate.txHash})`)

  // 2. Create short-deadline invoice order (65s horizon, 15 USDC budget, 10 USDC max chunk, €25 EURe invoice)
  console.log('\n[2/5] Creating short-deadline invoice order (15 USDC cap, 10 USDC chunk, €25.00 EURe, 65s horizon)...')
  const deadlineMs = Date.now() + 65_000
  const deadlineNs = deadlineMs * 1_000_000
  const expCreate = runCallFunction({
    contractId: CONTRACT_ID,
    methodName: 'create_order',
    args: {
      pair_label: 'USDC/EURe',
      total_in: '15000000', // $15 USDC
      max_chunk_in: '10000000', // $10 USDC per chunk
      deadline_ns: deadlineNs,
      max_dev_bps: 200,
      recipient: SUPPLIER_ID,
      target_out: '25000000', // €25.00 EURe
      invoice_ref: 'INV-EXPIRY-DEMO',
    },
    deposit: '0 NEAR',
    gas: '80.0 Tgas',
    signerId: OPERATOR_ID,
  })
  await sleep(2500)

  const ordersNow = await client.callView<any[]>(CONTRACT_ID, 'list_orders', {
    from_index: 0,
    limit: 50,
  })
  const order = ordersNow[ordersNow.length - 1]
  const orderId = order.id as number
  assert.equal(order.status, 'Active')
  assert.equal(order.recipient, SUPPLIER_ID)
  console.log(`✓ Created Order #${orderId} [${order.invoice_ref}] -> Active (Tx: ${expCreate.txHash})`)

  // 3. Enforce policy & invoice bounds on-chain
  console.log('\n[3/5] Testing on-chain bounds rejections (signer, chunk cap, invoice target)...')
  const authReject = expectRejectedCall(
    'Non-agent caller cannot invoke execute_chunk',
    () =>
      runCallFunction({
        contractId: CONTRACT_ID,
        methodName: 'execute_chunk',
        args: {
          id: orderId,
          amount_in: '10000000',
          quote_ref: 'sha256:unauth-signer',
          deviation_bps: 0,
          simulated_out: '8700000000000000000',
          settlement_out: '8700000',
          idempotency_key: `order-${orderId}-unauth`,
        },
        deposit: '0 NEAR',
        gas: '120.0 Tgas',
        signerId: OPERATOR_ID,
      }),
    /Only the designated agent can execute chunks/,
  )

  const capReject = expectRejectedCall(
    'Chunk exceeding order max_chunk_in ($12 > $10)',
    () =>
      runCallFunction({
        contractId: CONTRACT_ID,
        methodName: 'execute_chunk',
        args: {
          id: orderId,
          amount_in: '12000000',
          quote_ref: 'sha256:over-chunk-cap',
          deviation_bps: 0,
          simulated_out: '10440000000000000000',
          settlement_out: '10440000',
          idempotency_key: `order-${orderId}-overcap`,
        },
        deposit: '0 NEAR',
        gas: '120.0 Tgas',
        signerId: AGENT_ID,
        credentialPath: restrictedCredPath,
      }),
    /exceeds order max_chunk_in/,
  )

  const targetReject = expectRejectedCall(
    'Payout exceeding approved invoice target (€26 > €25)',
    () =>
      runCallFunction({
        contractId: CONTRACT_ID,
        methodName: 'execute_chunk',
        args: {
          id: orderId,
          amount_in: '10000000',
          quote_ref: 'sha256:over-target-due',
          deviation_bps: 0,
          simulated_out: '26000000000000000000',
          settlement_out: '26000000',
          idempotency_key: `order-${orderId}-overtarget`,
        },
        deposit: '0 NEAR',
        gas: '120.0 Tgas',
        signerId: AGENT_ID,
        credentialPath: restrictedCredPath,
      }),
    /exceeds remaining invoice balance due/,
  )

  // 4. Execute one partial confirmed chunk (€8.70 EURe) then verify over-budget rejection
  console.log('\n[4/5] Settling partial chunk (€8.70 EURe) & testing remaining-budget guard...')
  const partialTx = runCallFunction({
    contractId: CONTRACT_ID,
    methodName: 'execute_chunk',
    args: {
      id: orderId,
      amount_in: '10000000',
      quote_ref: 'sha256:partial-expiry-chunk-1',
      deviation_bps: 0,
      simulated_out: '8700000000000000000',
      settlement_out: '8700000',
      idempotency_key: `order-${orderId}-seq-1`,
    },
    deposit: '0 NEAR',
    gas: '120.0 Tgas',
    signerId: AGENT_ID,
    credentialPath: restrictedCredPath,
  })
  await sleep(3500)

  const midSummary = await client.callView<any>(CONTRACT_ID, 'get_invoice_summary', { id: orderId })
  assert.equal(midSummary.settled_out, '8700000')
  assert.equal(midSummary.remaining_due_out, '16300000')
  console.log(`✓ Partial chunk Settled: €8.70 paid, €16.30 remaining due (Tx: ${partialTx.txHash})`)

  const budgetReject = expectRejectedCall(
    'Chunk exceeding remaining USDC budget ($10 + $6 > $15)',
    () =>
      runCallFunction({
        contractId: CONTRACT_ID,
        methodName: 'execute_chunk',
        args: {
          id: orderId,
          amount_in: '6000000',
          quote_ref: 'sha256:over-total-budget',
          deviation_bps: 0,
          simulated_out: '5220000000000000000',
          settlement_out: '5220000',
          idempotency_key: `order-${orderId}-overbudget`,
        },
        deposit: '0 NEAR',
        gas: '120.0 Tgas',
        signerId: AGENT_ID,
        credentialPath: restrictedCredPath,
      }),
    /executed_in exceeds order total_in/,
  )

  // 5. Wait for deadline to pass, verify past-deadline rejection, then expire_order
  const waitMs = Math.max(0, deadlineMs - Date.now() + 4000)
  console.log(`\n[5/5] Waiting ${(waitMs / 1000).toFixed(1)}s for Order #${orderId} deadline to pass...`)
  if (waitMs > 0) await sleep(waitMs)

  const deadlineReject = expectRejectedCall(
    'Execution after order deadline',
    () =>
      runCallFunction({
        contractId: CONTRACT_ID,
        methodName: 'execute_chunk',
        args: {
          id: orderId,
          amount_in: '5000000',
          quote_ref: 'sha256:past-deadline',
          deviation_bps: 0,
          simulated_out: '4350000000000000000',
          settlement_out: '4350000',
          idempotency_key: `order-${orderId}-late`,
        },
        deposit: '0 NEAR',
        gas: '120.0 Tgas',
        signerId: AGENT_ID,
        credentialPath: restrictedCredPath,
      }),
    /Order deadline has passed/,
  )

  const expireTx = runCallFunction({
    contractId: CONTRACT_ID,
    methodName: 'expire_order',
    args: { id: orderId },
    deposit: '0 NEAR',
    gas: '50.0 Tgas',
    signerId: OPERATOR_ID,
  })
  await sleep(3000)

  const expiredSummary = await client.callView<any>(CONTRACT_ID, 'get_invoice_summary', { id: orderId })
  assert.equal(expiredSummary.status, 'Expired')
  assert.equal(expiredSummary.settled_out, '8700000')
  assert.equal(expiredSummary.remaining_due_out, '16300000')

  console.log('\n' + '═'.repeat(70))
  console.log('  BOUNDS & EXPIRY VERIFICATION PASSED ON NEAR TESTNET')
  console.log('═'.repeat(70))
  console.log(`  Expired Order ID:          #${orderId} (INV-EXPIRY-DEMO -> ${SUPPLIER_ID})`)
  console.log(`  Final Status:              ${expiredSummary.status}`)
  console.log(`  Confirmed Paid:            €${(Number(expiredSummary.settled_out) / 1e6).toFixed(2)} EURe`)
  console.log(`  Unpaid Remainder Due:      €${(Number(expiredSummary.remaining_due_out) / 1e6).toFixed(2)} EURe`)
  console.log(`  Create Pending Order Tx:   ${pendingCreate.txHash}`)
  console.log(`  Reject Before DAO Tx:      ${pendingReject.txHash ?? 'rejected pre-commit'}`)
  console.log(`  Create Expiry Order Tx:    ${expCreate.txHash}`)
  console.log(`  Reject Unauth Signer Tx:   ${authReject.txHash ?? 'rejected'}`)
  console.log(`  Reject Over Chunk Cap Tx:  ${capReject.txHash ?? 'rejected'}`)
  console.log(`  Reject Over Target Due Tx: ${targetReject.txHash ?? 'rejected'}`)
  console.log(`  Partial Chunk Settled Tx:  ${partialTx.txHash}`)
  console.log(`  Reject Over Budget Tx:     ${budgetReject.txHash ?? 'rejected'}`)
  console.log(`  Reject Past Deadline Tx:   ${deadlineReject.txHash ?? 'rejected'}`)
  console.log(`  Expire Order Tx:           ${expireTx.txHash}`)
}

main().catch((err) => {
  console.error('BOUNDS/EXPIRY DRILL FAILED:', err)
  process.exit(1)
})

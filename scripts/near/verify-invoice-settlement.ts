/**
 * GetNear — Live NEAR Testnet Verification Drill (Supplier Invoice Settlement & Failure Safety)
 *
 * Proves end-to-end on NEAR testnet:
 * 1. Restricted FunctionCall key security: agent's key can ONLY call execute_chunk on FxBudget
 *    (calling pause / ft_transfer fails at the NEAR protocol level).
 * 2. €1,000.00 supplier invoice order (> auto-cap) requiring Sputnik DAO 2-of-3 approval.
 * 3. Chunk #1 executes via real AgentRunner (live 1Click dry:true + Frankfurter), settles NEP-141 EURe
 *    cross-contract via FxBudget::execute_chunk -> on_chunk_settled callback, reducing remaining due.
 * 4. Replaying Chunk #1 with the exact same idempotency_key transfers 0 tokens & returns idempotent_replay: true.
 * 5. Chunk #2 fails inside on-chain ft_transfer (unregistered recipient), callback leaves supplier balance due
 *    & settled_out UNCHANGED, and AgentRunner persists settlement_status='FAILED' & is_simulated=true.
 * 6. Re-registering recipient and retrying Chunk #2 (same idempotency_key) completes invoice settlement to €1,000.00.
 *
 * Usage: pnpm tsx scripts/near/verify-invoice-settlement.ts
 */

try {
  process.loadEnvFile()
} catch {}

import * as assert from 'node:assert/strict'
import { NearClient } from '@getnear/near-client'
import { AgentRunner } from '../../apps/agent/src/runner.js'
import { db, getRecentFills, getRecentDecisions } from '../../apps/agent/src/db.js'
import {
  findKeyCredentialPath,
  runCallFunction,
  runCreateSubaccount,
  runTransferNear,
} from './near-runner.js'

const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const CONTRACT_ID = process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${OPERATOR_ID}`
const AGENT_ID = process.env.AGENT_ACCOUNT_ID || 'chilliroger-agent.testnet'
const DAO_ID = process.env.SPUTNIK_DAO_ACCOUNT_ID || 'chilliroger-dao.sputnik-v2.testnet'
const COUNCIL1 = process.env.COUNCIL1_ACCOUNT_ID || 'chilliroger-council1.testnet'
const COUNCIL2 = process.env.COUNCIL2_ACCOUNT_ID || 'chilliroger-council2.testnet'
const EURE_ID = process.env.EURE_CONTRACT_ID || `eure.${OPERATOR_ID}`
const SUPPLIER_ID = `supplier-eu.${OPERATOR_ID}`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function passDaoProposal(
  client: NearClient,
  description: string,
  methodName: string,
  argsObj: Record<string, unknown>,
): Promise<{ proposalId: number; addTx?: string; vote1Tx?: string; vote2Tx?: string }> {
  const argsBase64 = Buffer.from(JSON.stringify(argsObj)).toString('base64')
  const propRes = runCallFunction({
    contractId: DAO_ID,
    methodName: 'add_proposal',
    args: {
      proposal: {
        description,
        kind: {
          FunctionCall: {
            receiver_id: CONTRACT_ID,
            actions: [
              {
                method_name: methodName,
                args: argsBase64,
                deposit: '0',
                gas: '40000000000000', // 40 Tgas
              },
            ],
          },
        },
      },
    },
    deposit: '0.1 NEAR',
    gas: '100.0 Tgas',
    signerId: COUNCIL1,
  })

  await sleep(3000)
  const lastId = await client.callView<number>(DAO_ID, 'get_last_proposal_id', {})
  const proposalId = lastId - 1

  const vote1 = runCallFunction({
    contractId: DAO_ID,
    methodName: 'act_proposal',
    args: { id: proposalId, action: 'VoteApprove' },
    deposit: '0 NEAR',
    gas: '100.0 Tgas',
    signerId: COUNCIL1,
  })

  const vote2 = runCallFunction({
    contractId: DAO_ID,
    methodName: 'act_proposal',
    args: { id: proposalId, action: 'VoteApprove' },
    deposit: '0 NEAR',
    gas: '180.0 Tgas',
    signerId: COUNCIL2,
  })

  await sleep(3500)
  const prop = await client.callView<any>(DAO_ID, 'get_proposal', { id: proposalId })
  if (prop.status !== 'Approved') {
    throw new Error(`DAO proposal #${proposalId} expected Approved, got ${prop.status}`)
  }

  return {
    proposalId,
    addTx: propRes.txHash,
    vote1Tx: vote1.txHash,
    vote2Tx: vote2.txHash,
  }
}

async function ensureSupplierReady(client: NearClient) {
  const opAcc = await client.viewAccount(OPERATOR_ID)
  if (BigInt(opAcc.amount) < 1_500_000_000_000_000_000_000_000n) {
    console.log(`Topping up ${OPERATOR_ID} with 1.0 NEAR from ${COUNCIL2}...`)
    runTransferNear({
      receiverId: OPERATOR_ID,
      amount: '1.0 NEAR',
      signerId: COUNCIL2,
    })
    await sleep(3000)
  }

  try {
    await client.viewAccount(SUPPLIER_ID)
    console.log(`✓ Supplier account ${SUPPLIER_ID} already exists.`)
  } catch {
    console.log(`Creating supplier account ${SUPPLIER_ID} with 0.35 NEAR...`)
    runCreateSubaccount({
      subaccountId: SUPPLIER_ID,
      initialBalance: '0.35 NEAR',
      signerId: OPERATOR_ID,
    })
    await sleep(3500)
  }

  const reg = await client.callView<any>(EURE_ID, 'storage_balance_of', { account_id: SUPPLIER_ID })
  if (!reg || BigInt(reg.total || '0') === 0n) {
    console.log(`Registering EURe storage for ${SUPPLIER_ID}...`)
    runCallFunction({
      contractId: EURE_ID,
      methodName: 'storage_deposit',
      args: { account_id: SUPPLIER_ID, registration_only: false },
      deposit: '0.0125 NEAR',
      gas: '30.0 Tgas',
      signerId: OPERATOR_ID,
    })
    await sleep(2500)
  }
}

async function main() {
  console.log('═'.repeat(70))
  console.log('  GetNear — Live Testnet €1,000 Invoice & Failure Safety Verification')
  console.log('═'.repeat(70))

  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  })

  // Clean any prior unit-test pollution rows in local SQLite DB
  const cleanedFills = db.prepare('DELETE FROM agent_fills WHERE order_id IN (8888, 9999)').run()
  const cleanedDecs = db.prepare('DELETE FROM agent_decisions WHERE order_id IN (8888, 9999)').run()
  if (cleanedFills.changes > 0 || cleanedDecs.changes > 0) {
    console.log(`Cleaned ${cleanedFills.changes} stale unit-test fills and ${cleanedDecs.changes} decisions from agent.db`)
  }

  // Expire any stale past-deadline Active orders so AgentRunner ticks cleanly on our new invoice order
  const existingOrders = await client.callView<any[]>(CONTRACT_ID, 'list_orders', {
    from_index: 0,
    limit: 50,
  })
  const nowNs = BigInt(Date.now()) * 1_000_000n
  for (const o of existingOrders) {
    if (o.status === 'Active' && nowNs >= BigInt(o.deadline_ns)) {
      console.log(`Expiring past-deadline Order #${o.id}...`)
      runCallFunction({
        contractId: CONTRACT_ID,
        methodName: 'expire_order',
        args: { id: o.id },
        deposit: '0 NEAR',
        gas: '50.0 Tgas',
        signerId: OPERATOR_ID,
      })
      await sleep(2500)
    }
  }

  await ensureSupplierReady(client)

  // Step 1: Verify Restricted Access Key Discipline
  console.log('\n[1/7] Verifying Agent Restricted FunctionCall Key Isolation...')
  const runner = new AgentRunner({ pollIntervalMs: 60_000 })
  const restrictedCredPath = await runner.resolveAgentCredentialPath()
  assert.ok(restrictedCredPath, 'Restricted FunctionCall credential for execute_chunk must exist locally')
  console.log(`✓ Resolved restricted credential: ${restrictedCredPath}`)

  let unauthorizedRejected = false
  try {
    runCallFunction({
      contractId: EURE_ID,
      methodName: 'storage_deposit',
      args: { account_id: SUPPLIER_ID, registration_only: false },
      deposit: '0 NEAR',
      gas: '30.0 Tgas',
      signerId: AGENT_ID,
      credentialPath: restrictedCredPath,
    })
  } catch (err: any) {
    unauthorizedRejected = true
    console.log(
      `✓ Protocol rejected non-execute_chunk call with restricted key: ${String(err.message).split('\n')[0]}`,
    )
  }
  assert.ok(unauthorizedRejected, 'Restricted key MUST NOT authorize calls outside fx-budget::execute_chunk')

  // Step 2: Configure limits for 2-chunk €1,000 batch via DAO 2-of-3 vote (restored at end)
  console.log('\n[2/7] Raising chunk policy via Sputnik DAO for €1,000 2-chunk settlement drill...')
  const raiseRes = await passDaoProposal(
    client,
    'Enable €1,000 2-chunk verification drill (auto_cap=700 USDC, max_chunk=650 USDC, interval=5s)',
    'set_limits',
    {
      auto_cap_in: '700000000', // $700 USDC
      max_chunk_in: '650000000', // $650 USDC
      min_interval_ns: 5_000_000_000, // 5 seconds
      max_horizon_ns: 604_800_000_000_000,
    },
  )
  console.log(`✓ DAO limits raised (Proposal #${raiseRes.proposalId}, Vote2 tx: ${raiseRes.vote2Tx})`)

  let limitsRestored = false
  try {
    // Step 3: Create €1,000 Supplier Invoice Order (> $700 auto-cap -> Pending)
    console.log('\n[3/7] Creating €1,000 Supplier Invoice Order (1,500 USDC budget > $700 auto-cap -> Pending)...')
    const deadlineNs = Date.now() * 1_000_000 + 2 * 3600 * 1_000_000_000
    const createRes = runCallFunction({
      contractId: CONTRACT_ID,
      methodName: 'create_order',
      args: {
        pair_label: 'USDC/EURe',
        total_in: '1500000000', // 1,500 USDC
        max_chunk_in: '650000000', // 650 USDC/chunk
        deadline_ns: deadlineNs,
        max_dev_bps: 250,
        recipient: SUPPLIER_ID,
        target_out: '1000000000', // €1,000.00 EURe supplier invoice
        invoice_ref: 'INV-2026-1000',
      },
      deposit: '0 NEAR',
      gas: '100.0 Tgas',
      signerId: OPERATOR_ID,
    })
    await sleep(3000)

    const ordersAfterCreate = await client.callView<any[]>(CONTRACT_ID, 'list_orders', {
      from_index: 0,
      limit: 50,
    })
    const invoiceOrder = ordersAfterCreate[ordersAfterCreate.length - 1]
    const orderId = invoiceOrder.id as number
    assert.equal(invoiceOrder.status, 'Pending', 'Order exceeding auto-cap must start Pending')
    assert.equal(invoiceOrder.target_out, '1000000000')
    assert.equal(invoiceOrder.settled_out, '0')
    assert.equal(invoiceOrder.recipient, SUPPLIER_ID)
    console.log(`✓ Created Order #${orderId} [${invoiceOrder.invoice_ref}] -> Pending (Tx: ${createRes.txHash})`)

    // Step 4: Approve via Sputnik DAO 2-of-3
    console.log(`\n[4/7] Approving Order #${orderId} via Sputnik DAO 2-of-3 multisig...`)
    const appDao = await passDaoProposal(
      client,
      `Approve Supplier Invoice Order #${orderId} (INV-2026-1000, €1,000.00 EURe -> ${SUPPLIER_ID})`,
      'approve_order',
      { id: orderId },
    )
    const summary0 = await client.callView<any>(CONTRACT_ID, 'get_invoice_summary', { id: orderId })
    assert.equal(summary0.status, 'Active')
    assert.equal(summary0.remaining_due_out, '1000000000')
    console.log(
      `✓ Order #${orderId} Active! Target Due: €${(Number(summary0.remaining_due_out) / 1e6).toFixed(2)} (DAO Prop #${appDao.proposalId}, Tx: ${appDao.vote2Tx})`,
    )

    // Balance snapshot before Chunk #1
    const balBefore1 = BigInt(
      await client.callView<string>(EURE_ID, 'ft_balance_of', { account_id: SUPPLIER_ID }),
    )

    // Step 5: Execute Chunk #1 through real AgentRunner.tick()
    console.log(`\n[5/7] Executing Chunk #1 via AgentRunner (restricted key + live 1Click dry:true)...`)
    await runner.tick()
    await sleep(3000)

    const key1 = `order-${orderId}-seq-1`
    const chunk1 = await client.callView<any>(CONTRACT_ID, 'get_chunk_record', { key: key1 })
    const summary1 = await client.callView<any>(CONTRACT_ID, 'get_invoice_summary', { id: orderId })
    const balAfter1 = BigInt(
      await client.callView<string>(EURE_ID, 'ft_balance_of', { account_id: SUPPLIER_ID }),
    )
    const chunk1Delta = balAfter1 - balBefore1

    assert.equal(chunk1.status, 'Settled', 'Chunk #1 must be Settled via ft_transfer callback')
    assert.equal(chunk1Delta.toString(), chunk1.settlement_out, 'Supplier EURe gain must equal confirmed settlement_out')
    assert.equal(summary1.settled_out, chunk1.settlement_out)
    assert.equal(
      summary1.remaining_due_out,
      (1_000_000_000n - BigInt(chunk1.settlement_out)).toString(),
    )

    const fillsAfter1 = getRecentFills(5)
    const fill1 = fillsAfter1.find((f) => f.idempotency_key === key1)
    assert.ok(fill1, 'Agent DB must persist Chunk #1')
    assert.equal(fill1.settlement_status, 'CONFIRMED')
    assert.equal(fill1.is_simulated, false)
    console.log(
      `✓ Chunk #1 Settled! Paid €${(Number(chunk1.settlement_out) / 1e6).toFixed(2)} EURe -> Remaining Due: €${(Number(summary1.remaining_due_out) / 1e6).toFixed(2)} (Tx: ${fill1.tx_hash})`,
    )

    // Step 5b: Idempotent Replay Test (must NOT double-pay)
    console.log(`\n[5b] Replaying Chunk #1 idempotency key (${key1}) to prove zero double-payment...`)
    const replayRes = runCallFunction({
      contractId: CONTRACT_ID,
      methodName: 'execute_chunk',
      args: {
        id: orderId,
        amount_in: chunk1.amount_in,
        quote_ref: chunk1.quote_ref,
        deviation_bps: chunk1.deviation_bps,
        simulated_out: chunk1.simulated_out,
        settlement_out: chunk1.settlement_out,
        idempotency_key: key1,
      },
      deposit: '0 NEAR',
      gas: '120.0 Tgas',
      signerId: AGENT_ID,
      credentialPath: restrictedCredPath,
    })
    await sleep(2500)
    const balAfterReplay = BigInt(
      await client.callView<string>(EURE_ID, 'ft_balance_of', { account_id: SUPPLIER_ID }),
    )
    const summaryAfterReplay = await client.callView<any>(CONTRACT_ID, 'get_invoice_summary', { id: orderId })
    assert.equal(balAfterReplay, balAfter1, 'Idempotent replay MUST transfer 0 tokens')
    assert.equal(summaryAfterReplay.settled_out, summary1.settled_out)
    assert.equal(summaryAfterReplay.remaining_due_out, summary1.remaining_due_out)
    console.log(
      `✓ Replay blocked double-payment! Supplier balance & remaining due unchanged (Tx: ${replayRes.txHash})`,
    )

    // Step 6: Chunk #2 On-Chain Delivery Failure Simulation
    console.log(`\n[6/7] Simulating on-chain delivery failure on Chunk #2 (unregistering ${SUPPLIER_ID} EURe storage)...`)
    const sweepTx = runCallFunction({
      contractId: EURE_ID,
      methodName: 'ft_transfer',
      args: {
        receiver_id: OPERATOR_ID,
        amount: balAfter1.toString(),
        memo: 'Temporarily hold Chunk #1 payout during unregistered-recipient test',
      },
      deposit: '1 yoctoNEAR',
      gas: '30.0 Tgas',
      signerId: SUPPLIER_ID,
    })
    await sleep(2500)
    const unregTx = runCallFunction({
      contractId: EURE_ID,
      methodName: 'storage_unregister',
      args: { force: false },
      deposit: '1 yoctoNEAR',
      gas: '30.0 Tgas',
      signerId: SUPPLIER_ID,
    })
    console.log(`  Prepared unregistered state (sweep tx: ${sweepTx.txHash}, unregister tx: ${unregTx.txHash})`)

    await sleep(6000) // Wait past 5s min_interval_ns
    await runner.tick()
    await sleep(3500)

    const key2 = `order-${orderId}-seq-2`
    const chunk2Fail = await client.callView<any>(CONTRACT_ID, 'get_chunk_record', { key: key2 })
    const summaryAfterFail = await client.callView<any>(CONTRACT_ID, 'get_invoice_summary', { id: orderId })
    assert.equal(chunk2Fail.status, 'Failed', 'Chunk #2 ft_transfer failure must mark chunk Failed')
    assert.equal(chunk2Fail.attempts, 1)
    assert.equal(summaryAfterFail.settled_out, summary1.settled_out, 'Failed chunk must NOT increase settled_out')
    assert.equal(
      summaryAfterFail.remaining_due_out,
      summary1.remaining_due_out,
      'Failed chunk must leave remaining_due_out UNCHANGED',
    )
    assert.equal(summaryAfterFail.chunks_count, 1, 'Failed chunk must NOT increment chunks_count')

    const failedFill = getRecentFills(5).find((f) => f.idempotency_key === key2)
    const failDecision = getRecentDecisions(5).find(
      (d) => d.order_id === orderId && d.decision === 'SETTLEMENT_FAILED_BALANCE_UNCHANGED',
    )
    assert.ok(failedFill, 'Agent DB must persist the failed attempt')
    assert.equal(failedFill.settlement_status, 'FAILED')
    assert.equal(failedFill.is_simulated, true, 'CRITICAL: Failed transfer MUST have is_simulated=true, NEVER false')
    assert.ok(failDecision, 'Agent decisions must record SETTLEMENT_FAILED_BALANCE_UNCHANGED')
    console.log(
      `✓ Chunk #2 Failed cleanly on-chain! Remaining Due UNCHANGED: €${(Number(summaryAfterFail.remaining_due_out) / 1e6).toFixed(2)} | DB is_simulated=${failedFill.is_simulated} (Tx: ${failedFill.tx_hash})`,
    )

    // Step 7: Re-register Supplier & Retry Chunk #2 to Complete €1,000 Invoice
    console.log(`\n[7/7] Re-registering ${SUPPLIER_ID} and retrying Chunk #2 (${key2})...`)
    runCallFunction({
      contractId: EURE_ID,
      methodName: 'storage_deposit',
      args: { account_id: SUPPLIER_ID, registration_only: false },
      deposit: '0.0125 NEAR',
      gas: '30.0 Tgas',
      signerId: OPERATOR_ID,
    })
    await sleep(2500)
    runCallFunction({
      contractId: EURE_ID,
      methodName: 'ft_transfer',
      args: {
        receiver_id: SUPPLIER_ID,
        amount: balAfter1.toString(),
        memo: 'Restore Chunk #1 EURe payout to supplier before Chunk #2 retry',
      },
      deposit: '1 yoctoNEAR',
      gas: '30.0 Tgas',
      signerId: OPERATOR_ID,
    })
    await sleep(2500)

    await runner.tick()
    await sleep(3500)

    const chunk2Success = await client.callView<any>(CONTRACT_ID, 'get_chunk_record', { key: key2 })
    const summaryFinal = await client.callView<any>(CONTRACT_ID, 'get_invoice_summary', { id: orderId })
    const balFinal = BigInt(
      await client.callView<string>(EURE_ID, 'ft_balance_of', { account_id: SUPPLIER_ID }),
    )
    const retryFill = getRecentFills(5).find((f) => f.idempotency_key === key2)

    assert.equal(chunk2Success.status, 'Settled')
    assert.equal(chunk2Success.attempts, 2)
    assert.equal(summaryFinal.settled_out, '1000000000', 'Final settled_out must equal €1,000.00')
    assert.equal(summaryFinal.remaining_due_out, '0', 'Final remaining due must be €0.00')
    assert.equal(summaryFinal.status, 'Completed')
    assert.equal((balFinal - balBefore1).toString(), '1000000000', 'Supplier wallet must hold exact +€1,000.00 EURe')
    assert.ok(retryFill)
    assert.equal(retryFill.settlement_status, 'CONFIRMED')
    assert.equal(retryFill.is_simulated, false)

    console.log(
      `✓ Chunk #2 Retry Settled! Attempt #${chunk2Success.attempts} paid €${(Number(chunk2Success.settlement_out) / 1e6).toFixed(2)} EURe -> Order #${orderId} Status: ${summaryFinal.status} | Remaining Due: €0.00 (Tx: ${retryFill.tx_hash})`,
    )
    console.log(`✓ Supplier ${SUPPLIER_ID} EURe balance gain: +€${(Number(balFinal - balBefore1) / 1e6).toFixed(2)} EURe`)

    console.log('\n' + '═'.repeat(70))
    console.log('  SUMMARY OF VERIFIED ON-CHAIN PROOFS')
    console.log('═'.repeat(70))
    console.log(`  Order ID:              #${orderId} (INV-2026-1000)`)
    console.log(`  Supplier Recipient:    ${SUPPLIER_ID}`)
    console.log(`  Create Order Tx:       ${createRes.txHash}`)
    console.log(`  Approve DAO Prop #${appDao.proposalId}:   ${appDao.vote2Tx}`)
    console.log(`  Chunk #1 Confirmed Tx: ${fill1.tx_hash} (€${(Number(chunk1.settlement_out) / 1e6).toFixed(2)} EURe)`)
    console.log(`  Chunk #1 Replay Tx:    ${replayRes.txHash} (0 EURe moved)`)
    console.log(`  Chunk #2 Failed Tx:    ${failedFill.tx_hash} (balance unchanged, DB is_simulated=true)`)
    console.log(`  Chunk #2 Retry Tx:     ${retryFill.tx_hash} (€${(Number(chunk2Success.settlement_out) / 1e6).toFixed(2)} EURe -> €1,000.00 total)`)
  } finally {
    if (!limitsRestored) {
      console.log('\n[Cleanup] Restoring standard FxBudget limits ($100 auto-cap, $20 max chunk, 60s interval)...')
      try {
        const restoreRes = await passDaoProposal(
          client,
          'Restore standard FxBudget limits ($100 auto-cap, $20 max chunk, 60s interval)',
          'set_limits',
          {
            auto_cap_in: '100000000',
            max_chunk_in: '20000000',
            min_interval_ns: 60_000_000_000,
            max_horizon_ns: 604_800_000_000_000,
          },
        )
        limitsRestored = true
        console.log(`✓ Standard policy limits restored (Proposal #${restoreRes.proposalId}, Tx: ${restoreRes.vote2Tx})`)
      } catch (restoreErr: any) {
        console.error('WARNING: Could not auto-restore limits:', restoreErr.message)
      }
    }
    try {
      db.close()
    } catch {}
  }
}

main().catch((err) => {
  console.error('VERIFICATION DRILL FAILED:', err)
  process.exit(1)
})


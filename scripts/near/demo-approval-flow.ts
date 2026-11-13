/**
 * GetNear — End-to-End Testnet Approval Flow (P8)
 * WRITE-ENABLED: signs transactions with local near-cli credentials (operator + two council accounts).
 *
 * 1. Creates an above-cap invoice order (250 USDC budget > 100 USDC auto-cap, EUR 200 invoice target) -> Pending
 * 2. Creates a Sputnik DAO FunctionCall proposal calling approve_order(order_id)
 * 3. Casts 2-of-3 council votes (council1 and council2)
 * 4. Verifies the order status automatically transitions from Pending to Active
 *
 * The upgraded FxBudget requires an invoice target (`target_out`, atomic EURe units) on every order; it is the
 * on-chain bound for the order's payouts. Arguments are built by ./order-args.ts and unit-tested locally.
 *
 * Accounts / contracts used (override with env): OPERATOR_ACCOUNT_ID (requester + proposer),
 * FX_BUDGET_CONTRACT_ID, SPUTNIK_DAO_ACCOUNT_ID, COUNCIL1_ACCOUNT_ID, COUNCIL2_ACCOUNT_ID.
 *
 * Usage: pnpm tsx scripts/near/demo-approval-flow.ts
 */

try {
  process.loadEnvFile()
} catch {}

import { NearClient } from '@getnear/near-client'
import { runCallFunction } from './near-runner.js'
import {
  buildApproveOrderProposalArgs,
  buildCreateOrderArgs,
  findOrderByInvoiceRef,
  formatAtomic6,
  parseAtomic6,
  type InvoiceOrderParams,
} from './order-args.js'

const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const CONTRACT_ID = process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${OPERATOR_ID}`
const DAO_ID = process.env.SPUTNIK_DAO_ACCOUNT_ID || 'chilliroger-dao.sputnik-v2.testnet'
const COUNCIL1 = process.env.COUNCIL1_ACCOUNT_ID || 'chilliroger-council1.testnet'
const COUNCIL2 = process.env.COUNCIL2_ACCOUNT_ID || 'chilliroger-council2.testnet'
const SUPPLIER_ID = `supplier-eu.${OPERATOR_ID}`

/** Exported so the local test can verify the exact transaction arguments without touching the network. */
export function buildDemoOrderParams(nowMs: number = Date.now()): InvoiceOrderParams {
  return {
    totalInAtomic: parseAtomic6('250'), // 250 USDC budget (auto-cap is 100 USDC) -> Pending
    maxChunkInAtomic: parseAtomic6('20'), // 20 USDC per chunk
    targetOutAtomic: parseAtomic6('200'), // EUR 200.00 invoice due: REQUIRED, bounds payouts on-chain
    recipient: SUPPLIER_ID,
    invoiceRef: `INV-DEMO-APPROVAL-${Math.floor(nowMs / 1000)}`,
    deadlineNs: BigInt(nowMs) * 1_000_000n + 24n * 3600n * 1_000_000_000n, // 24h
    maxDevBps: 120,
  }
}

async function main() {
  console.log('═'.repeat(60))
  console.log('   GetNear — Sputnik DAO 2-of-3 Approval Flow Demo (P8)')
  console.log('═'.repeat(60))

  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  })

  // 1. Create Above-Cap Order
  console.log('\n[1/4] Creating Above-Cap Invoice Order on FxBudget:')
  const params = buildDemoOrderParams()
  const createArgs = buildCreateOrderArgs(params)

  console.log(`  Contract:   ${CONTRACT_ID}`)
  console.log(`  Requester:  ${OPERATOR_ID}`)
  console.log(`  Recipient:  ${params.recipient}`)
  console.log(`  Budget:     ${formatAtomic6(params.totalInAtomic)} USDC (auto-cap: 100 USDC)`)
  console.log(`  Max Chunk:  ${formatAtomic6(params.maxChunkInAtomic)} USDC`)
  console.log(`  Invoice:    ${formatAtomic6(params.targetOutAtomic)} EURe due (target_out = ${createArgs.target_out})`)
  console.log(`  Invoice ref: ${params.invoiceRef}`)

  const createRes = runCallFunction({
    contractId: CONTRACT_ID,
    methodName: 'create_order',
    args: createArgs,
    deposit: '0 NEAR',
    gas: '100.0 Tgas',
    signerId: OPERATOR_ID,
  })

  console.log(`✓ Order creation submitted! Tx Hash: ${createRes.txHash || 'confirmed'}`)
  await new Promise((r) => setTimeout(r, 4000))

  // Find the order we just created by its unique invoice_ref (list_orders is paged and capped at 100).
  const order = await findOrderByInvoiceRef(
    (from, limit) => client.callView<any[]>(CONTRACT_ID, 'list_orders', { from_index: from, limit }),
    params.invoiceRef,
  )
  if (!order) throw new Error(`Created order ${params.invoiceRef} not found on-chain`)
  console.log(`\nVerified Created Order On-Chain:`)
  console.log(`  Order ID: #${order.id}`)
  console.log(`  Pair: ${order.pair_label}`)
  console.log(`  Total In: ${Number(order.total_in) / 1e6} USDC`)
  console.log(`  Invoice target: ${Number(order.target_out) / 1e6} EURe`)
  console.log(`  Status: ${order.status}  <-- Above auto-cap requires DAO approval!`)

  if (order.status !== 'Pending') {
    throw new Error(`Expected order status to be Pending, but got: ${order.status}`)
  }

  // 2. Submit Sputnik DAO Proposal
  console.log(`\n[2/4] Submitting Sputnik DAO Proposal to Approve Order #${order.id}:`)
  const propRes = runCallFunction({
    contractId: DAO_ID,
    methodName: 'add_proposal',
    args: buildApproveOrderProposalArgs(
      CONTRACT_ID,
      order.id,
      `Approve Treasury FX Order #${order.id} (${formatAtomic6(params.totalInAtomic)} USDC -> ${formatAtomic6(params.targetOutAtomic)} EURe)`,
    ),
    deposit: '0.1 NEAR',
    gas: '100.0 Tgas',
    signerId: OPERATOR_ID,
  })

  await new Promise((r) => setTimeout(r, 4000))
  const lastId = await client.callView<number>(DAO_ID, 'get_last_proposal_id', {})
  const proposalId = lastId - 1
  console.log(`✓ Sputnik Proposal #${proposalId} created! Tx Hash: ${propRes.txHash || 'confirmed'}`)

  // 3. Council Voting (2-of-3 threshold)
  console.log(`\n[3/4] Council Voting (Threshold: 2 of 3):`)
  console.log(`  -> Vote 1/2 from ${COUNCIL1}...`)
  const vote1 = runCallFunction({
    contractId: DAO_ID,
    methodName: 'act_proposal',
    args: { id: proposalId, action: 'VoteApprove' },
    deposit: '0 NEAR',
    gas: '100.0 Tgas',
    signerId: COUNCIL1,
  })
  console.log(`     Vote 1 confirmed! Tx Hash: ${vote1.txHash || 'confirmed'}`)

  console.log(`  -> Vote 2/2 from ${COUNCIL2}...`)
  const vote2 = runCallFunction({
    contractId: DAO_ID,
    methodName: 'act_proposal',
    args: { id: proposalId, action: 'VoteApprove' },
    deposit: '0 NEAR',
    gas: '150.0 Tgas',
    signerId: COUNCIL2,
  })
  console.log(`     Vote 2 confirmed! Tx Hash: ${vote2.txHash || 'confirmed'}`)

  // 4. Verify Final State Transitions
  console.log(`\n[4/4] Verifying Final Execution State on NEAR Testnet...`)
  await new Promise((r) => setTimeout(r, 4000))

  const verifiedProp = await client.callView<any>(DAO_ID, 'get_proposal', { id: proposalId })
  console.log(`  Sputnik Proposal #${proposalId} Final Status: ${verifiedProp.status}`)

  const verifiedOrder = await client.callView<any>(CONTRACT_ID, 'get_order', { id: order.id })
  console.log(`  FxBudget Order #${order.id} Final Status: ${verifiedOrder.status}`)

  if (verifiedOrder.status === 'Active') {
    console.log('\n' + '═'.repeat(60))
    console.log('SUCCESS: ORDER HAS BEEN APPROVED AND IS NOW ACTIVE')
    console.log('═'.repeat(60))
    console.log(`  Order #${verifiedOrder.id} is now available for Agent chunk execution.`)
  } else {
    console.error(`Order did not transition to Active. Current status: ${verifiedOrder.status}`)
    process.exitCode = 1
  }
}

// Only run when executed directly (the test imports buildDemoOrderParams without side effects).
if (process.argv[1]?.endsWith('demo-approval-flow.ts')) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

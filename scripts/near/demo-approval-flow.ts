/**
 * GetNear — End-to-End Testnet Approval Flow (P8)
 * 1. Creates an above-cap order (250 USDC > 100 USDC auto-cap) -> status Pending
 * 2. Creates a Sputnik DAO FunctionCall proposal calling approve_order(order_id)
 * 3. Casts 2-of-3 council votes (council1 and council2)
 * 4. Verifies the order status automatically transitions from Pending to Active!
 *
 * Usage: pnpm tsx scripts/near/demo-approval-flow.ts
 */

try {
  process.loadEnvFile()
} catch {}

import { NearClient } from '@getnear/near-client'
import { runCallFunction } from './near-runner.js'

const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const CONTRACT_ID = `fx-budget.${OPERATOR_ID}`
const DAO_ID = 'chilliroger-dao.sputnik-v2.testnet'
const COUNCIL1 = process.env.COUNCIL1_ACCOUNT_ID || 'chilliroger-council1.testnet'
const COUNCIL2 = process.env.COUNCIL2_ACCOUNT_ID || 'chilliroger-council2.testnet'

async function main() {
  console.log('═'.repeat(60))
  console.log('   GetNear — Sputnik DAO 2-of-3 Approval Flow Demo (P8)')
  console.log('═'.repeat(60))

  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  })

  // 1. Create Above-Cap Order
  console.log('\n[1/4] Creating Above-Cap Order on FxBudget:')
  const totalIn = '250000000' // 250 USDC (Auto-cap is 100 USDC)
  const maxChunkIn = '20000000' // 20 USDC
  const deadlineNs = Date.now() * 1_000_000 + 24 * 3600 * 1_000_000_000 // 24h as number
  const maxDevBps = 120

  console.log(`  Requester: ${OPERATOR_ID}`)
  console.log(`  Total: 250.00 USDC (Auto-cap limit: 100.00 USDC)`)
  console.log(`  Max Chunk: 20.00 USDC`)
  console.log(`  Max Deviation: 120 bps`)

  const createRes = runCallFunction({
    contractId: CONTRACT_ID,
    methodName: 'create_order',
    args: {
      pair_label: 'USDC_EUR',
      total_in: totalIn,
      deadline_ns: deadlineNs,
      max_chunk_in: maxChunkIn,
      max_dev_bps: maxDevBps,
    },
    deposit: '0 NEAR',
    gas: '100.0 Tgas',
    signerId: OPERATOR_ID,
  })

  console.log(`✓ Order creation submitted! Tx Hash: ${createRes.txHash || 'confirmed'}`)
  await new Promise((r) => setTimeout(r, 4000))

  // Fetch the created order
  const orders = await client.callView<any[]>(CONTRACT_ID, 'list_orders', { from_index: 0, limit: 10 })
  const order = orders[orders.length - 1]
  console.log(`\nVerified Created Order On-Chain:`)
  console.log(`  Order ID: #${order.id}`)
  console.log(`  Pair: ${order.pair_label}`)
  console.log(`  Total In: ${Number(order.total_in) / 1e6} USDC`)
  console.log(`  Status: ${order.status}  <-- Above auto-cap requires DAO approval!`)

  if (order.status !== 'Pending') {
    throw new Error(`Expected order status to be Pending, but got: ${order.status}`)
  }

  // 2. Submit Sputnik DAO Proposal
  console.log(`\n[2/4] Submitting Sputnik DAO Proposal to Approve Order #${order.id}:`)
  const approveArgsBase64 = Buffer.from(JSON.stringify({ id: order.id })).toString('base64')

  const propRes = runCallFunction({
    contractId: DAO_ID,
    methodName: 'add_proposal',
    args: {
      proposal: {
        description: `Approve Treasury FX Order #${order.id} (250 USDC -> EURe)`,
        kind: {
          FunctionCall: {
            receiver_id: CONTRACT_ID,
            actions: [
              {
                method_name: 'approve_order',
                args: approveArgsBase64,
                deposit: '0',
                gas: '30000000000000', // 30 Tgas
              },
            ],
          },
        },
      },
    },
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
    console.log('🎉 SUCCESS! ORDER HAS BEEN APPROVED AND IS NOW ACTIVE!')
    console.log('═'.repeat(60))
    console.log(`  Order #${verifiedOrder.id} is now available for Agent chunk execution!`)
  } else {
    console.error(`❌ Order did not transition to Active. Current status: ${verifiedOrder.status}`)
  }
}

main().catch(console.error)

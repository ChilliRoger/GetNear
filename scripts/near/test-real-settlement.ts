/**
 * GetNear — End-to-End Real NEP-141 Settlement Verification
 * WRITE-ENABLED when it executes a chunk: it runs ONE agent tick, which signs `execute_chunk` with the restricted
 * agent key (needs the local credential file for the agent account).
 *
 * Tests the loop for an existing Active INVOICE order:
 * 1. Checks the on-chain demo USDC / demo EURe token contracts.
 * 2. Picks an Active order that has an invoice target (`target_out > 0`) and nothing in flight.
 *    Orders without a target are skipped: the upgraded contract cannot pay them (no payout bound).
 * 3. Runs one agent tick.
 * 4. Verifies the demo EURe landed with the order's RECIPIENT (the supplier), not the requester.
 * 5. Prints the receipts recorded in the agent's SQLite audit DB.
 *
 * It does not create orders: create one with the dashboard, `demo-approval-flow.ts`, or
 * `verify-circle-usdc-escrow.ts` (each passes the required `target_out`).
 *
 * Accounts / tokens used (override with env): OPERATOR_ACCOUNT_ID, FX_BUDGET_CONTRACT_ID,
 * USDC_FAUCET token = usdc.<operator> (team demo token), EURE_CONTRACT_ID (settlement token),
 * Circle input token = USDC_CONTRACT_ID (canonical Circle testnet USDC, used for escrowed orders).
 *
 * Usage: pnpm tsx scripts/near/test-real-settlement.ts
 */

try {
  process.loadEnvFile()
} catch {}

import { NearClient } from '@getnear/near-client'
import { AgentRunner } from '../../apps/agent/src/runner.js'
import { getRecentFills } from '../../apps/agent/src/db.js'

const CIRCLE_NEAR_TESTNET_USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af'
const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const FX_BUDGET_ID = process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${OPERATOR_ID}`
const DEMO_USDC_ID = `usdc.${OPERATOR_ID}`
const CIRCLE_USDC_ID = process.env.USDC_CONTRACT_ID || CIRCLE_NEAR_TESTNET_USDC
const EURE_ID = process.env.EURE_CONTRACT_ID || `eure.${OPERATOR_ID}`

async function main() {
  console.log('═'.repeat(60))
  console.log('  GetNear — E2E Real NEP-141 Settlement Verification')
  console.log('═'.repeat(60))
  console.log(`  FxBudget: ${FX_BUDGET_ID}`)
  console.log(`  Settlement token (demo EURe, prefunded vault): ${EURE_ID}`)
  console.log(`  Escrow input token (Circle testnet USDC):      ${CIRCLE_USDC_ID}`)
  console.log(`  Team demo faucet USDC (not used for escrow):   ${DEMO_USDC_ID}`)

  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  })

  // 1. Verify token contract health
  console.log('\n1. Verifying NEP-141 Contracts:')
  const [circleMeta, eureMeta] = await Promise.all([
    client.callView<any>(CIRCLE_USDC_ID, 'ft_metadata', {}),
    client.callView<any>(EURE_ID, 'ft_metadata', {}),
  ])
  console.log(`   Circle USDC: ${CIRCLE_USDC_ID} (${circleMeta.symbol}, decimals: ${circleMeta.decimals})`)
  console.log(`   Demo EURe:   ${EURE_ID} (${eureMeta.symbol}, decimals: ${eureMeta.decimals})`)

  // 2. Fetch Active INVOICE orders from FxBudget
  console.log('\n2. Querying Active Invoice Orders on FxBudget Contract:')
  const orders = await client.callView<any[]>(FX_BUDGET_ID, 'list_orders', { from_index: 0, limit: 100 })
  const active = orders.filter((o) => o.status === 'Active')
  const payable = active.filter(
    (o) => BigInt(o.target_out || '0') > BigInt(o.settled_out || '0') && BigInt(o.pending_in || '0') === 0n,
  )
  const legacy = active.filter((o) => BigInt(o.target_out || '0') === 0n)
  console.log(`   Total Orders: ${orders.length} (Active: ${active.length}, payable invoices: ${payable.length}, legacy without target: ${legacy.length})`)
  if (legacy.length > 0) {
    console.log(`   Skipping legacy orders without an invoice target: ${legacy.map((o) => `#${o.id}`).join(', ')} (need a DAO-set payout cap)`)
  }

  if (payable.length === 0) {
    console.log('ℹ No Active invoice order with an amount due. Create one (dashboard / demo-approval-flow.ts / verify-circle-usdc-escrow.ts), then rerun.')
    return
  }

  const targetOrder = payable[0]
  const recipient: string = targetOrder.recipient
  const dueBefore = BigInt(targetOrder.target_out) - BigInt(targetOrder.settled_out)
  console.log(
    `   Target Order #${targetOrder.id}: Recipient = ${recipient}, Budget = ${Number(targetOrder.total_in) / 1e6} USDC, ` +
      `Invoice = ${Number(targetOrder.target_out) / 1e6} EURe (target_out=${targetOrder.target_out}), Due = ${Number(dueBefore) / 1e6} EURe`,
  )

  // 3. Check the RECIPIENT's initial demo EURe balance (payouts go to the supplier, not the requester)
  const initialEure = await client.callView<string>(EURE_ID, 'ft_balance_of', { account_id: recipient })
  console.log(`   Recipient Initial EURe Balance: ${Number(initialEure || '0') / 1e6} EURe`)

  // 4. Trigger one Agent Runner tick
  console.log('\n3. Triggering Autonomous Agent Execution Tick:')
  const runner = new AgentRunner()
  await runner.tick()

  // 5. Check the recipient's final EURe balance and the order's due amount
  const finalEure = await client.callView<string>(EURE_ID, 'ft_balance_of', { account_id: recipient })
  const after = await client.callView<any>(FX_BUDGET_ID, 'get_order', { id: targetOrder.id })
  const diff = BigInt(finalEure || '0') - BigInt(initialEure || '0')
  const dueAfter = BigInt(after.target_out) - BigInt(after.settled_out)

  console.log(`\n4. Settlement Results:`)
  console.log(`   Recipient Initial Balance: ${Number(initialEure || '0') / 1e6} EURe`)
  console.log(`   Recipient Final Balance:   ${Number(finalEure || '0') / 1e6} EURe`)
  console.log(`   Net demo EURe settled:     +${(Number(diff) / 1e6).toFixed(6)} EURe (order due ${Number(dueBefore) / 1e6} -> ${Number(dueAfter) / 1e6})`)
  if (diff !== BigInt(after.settled_out) - BigInt(targetOrder.settled_out)) {
    console.warn('   ⚠ Recipient balance delta does not equal the order settled_out delta (other transfers may have occurred).')
  }

  const latestFill = getRecentFills(20).find((f) => f.order_id === targetOrder.id)
  if (latestFill) {
    console.log('\n5. Latest Fill in SQLite Audit DB (contract-confirmed status):')
    console.log(`   Order #${latestFill.order_id} Chunk #${latestFill.chunk_index} (${latestFill.settlement_status})`)
    console.log(`   USDC charged: ${(Number(latestFill.amount_in) / 1e6).toFixed(6)}  -> demo EURe paid: ${(Number(latestFill.settlement_out ?? '0') / 1e6).toFixed(6)}`)
    console.log(`   Indicative live quote output: ${(Number(latestFill.simulated_out) / 1e18).toFixed(6)} EURe`)
    // Both links are the PARENT execute_chunk transaction; the EURe ft_transfer receipt is inside it.
    console.log(`   execute_chunk tx (parent; includes the EURe ft_transfer receipt): ${latestFill.explorer_url ?? 'n/a (reconciled from chain)'}`)
  }

  console.log('\n' + '═'.repeat(60))
  console.log(diff > 0n ? 'E2E VERIFICATION COMPLETE: demo EURe transferred from the prefunded vault' : 'No payout occurred this tick (see agent decisions: waiting / interval / quote).')
  console.log('═'.repeat(60))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

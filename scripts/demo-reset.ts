/**
 * GetNear — Demo Reset Utility (P12)
 * Lists all active or pending orders for the operator and cancels any open orders.
 *
 * Usage:
 *   pnpm demo:reset
 */

try {
  process.loadEnvFile()
} catch {}

import { NearClient } from '@getnear/near-client'
import { runCallFunction } from './near/near-runner.js'

const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const CONTRACT_ID = process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${OPERATOR_ID}`
const RPC_URLS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org']

async function main() {
  console.log('═'.repeat(64))
  console.log('            GetNear — Demo Reset Utility (P12)')
  console.log('═'.repeat(64))

  const client = new NearClient({ networkId: 'testnet', rpcUrls: RPC_URLS })

  console.log(`Checking orders for requester: ${OPERATOR_ID}...`)
  const orders = await client.callView<Array<any>>(CONTRACT_ID, 'list_orders', {
    from_index: 0,
    limit: 100,
  })

  const cancellable = orders.filter(
    (o) => o.requester === OPERATOR_ID && (o.status === 'Active' || o.status === 'Pending'),
  )

  if (cancellable.length === 0) {
    console.log('✓ No open Active or Pending orders found. Environment is clean.')
    return
  }

  console.log(`Found ${cancellable.length} open orders:`)
  for (const o of cancellable) {
    console.log(`  • Order #${o.id}: status=${o.status}, total_in=${Number(o.total_in) / 1e6} USDC, ref=${o.invoice_ref}`)
    try {
      console.log(`    Cancelling Order #${o.id}...`)
      const res = runCallFunction({
        contractId: CONTRACT_ID,
        methodName: 'cancel_order',
        args: { id: o.id },
        deposit: '0 NEAR',
        gas: '100.0 Tgas',
        signerId: OPERATOR_ID,
      })
      console.log(`    ✓ Cancelled. Tx: ${res.explorerUrl || res.txHash}`)
    } catch (err: any) {
      console.error(`    ✗ Could not cancel Order #${o.id}: ${err.message}`)
    }
  }

  console.log('\nDemo reset completed.')
}

main().catch((err) => {
  console.error('Demo reset failed:', err)
  process.exit(1)
})

/**
 * GetNear — Submit Sputnik DAO Proposal for an Order
 * Usage: pnpm tsx scripts/near/submit-order-proposal.ts <orderId>
 */

try {
  process.loadEnvFile()
} catch {}

import { NearClient } from '@getnear/near-client'
import { runCallFunction } from './near-runner.js'

const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const CONTRACT_ID = `fx-budget.${OPERATOR_ID}`
const DAO_ID = 'chilliroger-dao.sputnik-v2.testnet'

async function main() {
  const orderId = parseInt(process.argv[2] || '2', 10)
  console.log(`Submitting Sputnik DAO proposal to approve Order #${orderId}...`)

  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  })

  const order = await client.callView<any>(CONTRACT_ID, 'get_order', { id: orderId })
  if (!order) {
    throw new Error(`Order #${orderId} not found on contract ${CONTRACT_ID}`)
  }

  console.log(`Found Order #${orderId}: status=${order.status}, pair=${order.pair_label}, total=${Number(order.total_in) / 1e6} USDC`)

  const approveArgsBase64 = Buffer.from(JSON.stringify({ id: orderId })).toString('base64')

  const propRes = runCallFunction({
    contractId: DAO_ID,
    methodName: 'add_proposal',
    args: {
      proposal: {
        description: `Approve Treasury FX Order #${orderId} (${Number(order.total_in) / 1e6} USDC -> ${order.pair_label.split('/')[1] || 'EURe'})`,
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

  console.log(`✓ Sputnik Proposal submitted! Tx Hash: ${propRes.txHash || 'confirmed'}`)
  console.log(`  Explorer URL: ${propRes.explorerUrl || 'N/A'}`)

  await new Promise((r) => setTimeout(r, 4000))
  const lastId = await client.callView<number>(DAO_ID, 'get_last_proposal_id', {})
  const proposalId = lastId - 1
  const prop = await client.callView<any>(DAO_ID, 'get_proposal', { id: proposalId })
  console.log(`Verified Proposal #${proposalId} on DAO: status=${prop.status}`)
  console.log(`Proposal ready for Council voting!`)
}

main().catch(console.error)

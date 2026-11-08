/**
 * GetNear — Council Proposal Voting CLI (P8)
 * Allows council members to view open proposals and cast votes on-chain.
 *
 * Usage:
 *   pnpm tsx scripts/near/vote-proposal.ts --list
 *   pnpm tsx scripts/near/vote-proposal.ts --proposal 3 --council council1 --action VoteApprove
 */

try {
  process.loadEnvFile()
} catch {}

import { NearClient } from '@getnear/near-client'
import { runCallFunction } from './near-runner.js'

const DAO_ID = 'chilliroger-dao.sputnik-v2.testnet'

const COUNCIL_MAP: Record<string, string> = {
  council1: process.env.COUNCIL1_ACCOUNT_ID || 'chilliroger-council1.testnet',
  council2: process.env.COUNCIL2_ACCOUNT_ID || 'chilliroger-council2.testnet',
  council3: process.env.COUNCIL3_ACCOUNT_ID || 'chilliroger-council3.testnet',
}

async function main() {
  const args = process.argv.slice(2)
  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  })

  const propIndex = args.indexOf('--proposal')
  const councilIndex = args.indexOf('--council')
  const actionIndex = args.indexOf('--action')

  // If no arguments or --list, list all proposals
  if (args.includes('--list') || propIndex === -1) {
    console.log('═'.repeat(60))
    console.log(`      GetNear — Sputnik DAO Proposals on ${DAO_ID}`)
    console.log('═'.repeat(60))

    const lastId = await client.callView<number>(DAO_ID, 'get_last_proposal_id', {})
    console.log(`Total proposals registered: ${lastId}\n`)

    for (let id = 0; id < lastId; id++) {
      const p = await client.callView<any>(DAO_ID, 'get_proposal', { id })
      console.log(`[Proposal #${id}]`)
      console.log(`  Description: ${p.description}`)
      console.log(`  Proposer: ${p.proposer}`)
      console.log(`  Status: ${p.status}`)
      console.log(`  Votes: ${JSON.stringify(p.votes)}`)
      console.log(`  Kind: ${Object.keys(p.kind)[0]}`)
      console.log('─'.repeat(50))
    }
    return
  }

  const proposalId = parseInt(args[propIndex + 1], 10)
  const councilKey = (councilIndex !== -1 ? args[councilIndex + 1] : 'council1').toLowerCase()
  const councilAccount = COUNCIL_MAP[councilKey] || councilKey
  const action = actionIndex !== -1 ? args[actionIndex + 1] : 'VoteApprove'

  console.log(`\nCasting ${action} on Proposal #${proposalId} from ${councilAccount}...`)
  const res = runCallFunction({
    contractId: DAO_ID,
    methodName: 'act_proposal',
    args: { id: proposalId, action },
    deposit: '0 NEAR',
    gas: '150.0 Tgas',
    signerId: councilAccount,
  })

  console.log(`✓ Vote transaction submitted! Tx Hash: ${res.txHash || 'confirmed'}`)
  await new Promise((r) => setTimeout(r, 4000))

  const updated = await client.callView<any>(DAO_ID, 'get_proposal', { id: proposalId })
  console.log(`\nUpdated Proposal #${proposalId} Status: ${updated.status}`)
  console.log(`Recorded Votes:`, updated.votes)
}

main().catch(console.error)

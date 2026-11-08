/**
 * GetNear — Bootstrap FxBudget Configuration via Sputnik DAO Proposals (P8)
 * Creates FunctionCall proposals on chilliroger-dao.sputnik-v2.testnet to:
 * 1. set_agent("chilliroger-agent.testnet")
 * 2. add_requester("chilliroger-operator.testnet")
 * 3. set_limits(...)
 * Then casts 2-of-3 council votes (council1 and council2) to execute each.
 *
 * Usage: pnpm tsx scripts/near/bootstrap-dao.ts
 */

try {
  process.loadEnvFile()
} catch {}

import { NearClient } from '@getnear/near-client'
import { runCallFunction } from './near-runner.js'

const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const CONTRACT_ID = `fx-budget.${OPERATOR_ID}`
const DAO_ID = 'chilliroger-dao.sputnik-v2.testnet'
const AGENT_ID = process.env.AGENT_ACCOUNT_ID || 'chilliroger-agent.testnet'
const COUNCIL1 = process.env.COUNCIL1_ACCOUNT_ID || 'chilliroger-council1.testnet'
const COUNCIL2 = process.env.COUNCIL2_ACCOUNT_ID || 'chilliroger-council2.testnet'

async function executeDaoProposal(client: NearClient, description: string, methodName: string, methodArgs: Record<string, unknown>) {
  console.log(`\n────────────────────────────────────────────────────────────`)
  console.log(`PROPOSAL: ${description}`)
  console.log(`────────────────────────────────────────────────────────────`)

  const argsBase64 = Buffer.from(JSON.stringify(methodArgs)).toString('base64')

  const proposalInput = {
    description,
    kind: {
      FunctionCall: {
        receiver_id: CONTRACT_ID,
        actions: [
          {
            method_name: methodName,
            args: argsBase64,
            deposit: '0',
            gas: '30000000000000', // 30 Tgas
          },
        ],
      },
    },
  }

  // 1. Submit proposal from COUNCIL1 (attaching 0.1 NEAR proposal bond)
  console.log(`Submitting proposal from ${COUNCIL1} (deposit: 0.1 NEAR)...`)
  const addRes = runCallFunction({
    contractId: DAO_ID,
    methodName: 'add_proposal',
    args: { proposal: proposalInput },
    deposit: '0.1 NEAR',
    gas: '100.0 Tgas',
    signerId: COUNCIL1,
  })

  // Get the proposal id by querying last proposal id
  await new Promise((r) => setTimeout(r, 3000))
  const lastId = await client.callView<number>(DAO_ID, 'get_last_proposal_id', {})
  const proposalId = lastId - 1
  console.log(`✓ Proposal #${proposalId} created! Tx Hash: ${addRes.txHash || 'confirmed'}`)

  // 2. First vote from COUNCIL1
  console.log(`Casting vote 1/2 from ${COUNCIL1}...`)
  const vote1Res = runCallFunction({
    contractId: DAO_ID,
    methodName: 'act_proposal',
    args: { id: proposalId, action: 'VoteApprove' },
    deposit: '0 NEAR',
    gas: '100.0 Tgas',
    signerId: COUNCIL1,
  })
  console.log(`  Vote 1 submitted! Tx Hash: ${vote1Res.txHash || 'confirmed'}`)

  // 3. Second vote from COUNCIL2 (triggers execution threshold 2-of-3)
  console.log(`Casting vote 2/2 from ${COUNCIL2} (reaches 2-of-3 threshold)...`)
  const vote2Res = runCallFunction({
    contractId: DAO_ID,
    methodName: 'act_proposal',
    args: { id: proposalId, action: 'VoteApprove' },
    deposit: '0 NEAR',
    gas: '150.0 Tgas',
    signerId: COUNCIL2,
  })
  console.log(`  Vote 2 submitted! Tx Hash: ${vote2Res.txHash || 'confirmed'}`)

  // Wait and check proposal status
  await new Promise((r) => setTimeout(r, 4000))
  const proposal = await client.callView<any>(DAO_ID, 'get_proposal', { id: proposalId })
  console.log(`✅ Proposal #${proposalId} Status: ${proposal.status}`)
  return { proposalId, addRes, vote1Res, vote2Res }
}

async function main() {
  console.log('═'.repeat(60))
  console.log('       GetNear — Sputnik DAO Bootstrap Execution (P8)')
  console.log('═'.repeat(60))

  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  })

  // Step 1: Set Agent
  const currentAgent = await client.callView<string | null>(CONTRACT_ID, 'get_agent', {})
  console.log(`Current Agent on ${CONTRACT_ID}:`, currentAgent)
  if (currentAgent !== AGENT_ID) {
    await executeDaoProposal(client, `Set Agent to ${AGENT_ID}`, 'set_agent', { agent: AGENT_ID })
  } else {
    console.log(`✓ Agent already configured as ${AGENT_ID}`)
  }

  // Step 2: Add Requester
  const isReq = await client.callView<boolean>(CONTRACT_ID, 'is_requester', { account: OPERATOR_ID })
  console.log(`Is ${OPERATOR_ID} requester?`, isReq)
  if (!isReq) {
    await executeDaoProposal(client, `Authorize requester ${OPERATOR_ID}`, 'add_requester', { account: OPERATOR_ID })
  } else {
    console.log(`✓ ${OPERATOR_ID} is already an authorized requester.`)
  }

  // Step 3: Verify resulting on-chain state
  console.log('\nVerifying final bootstrap state on FxBudget contract...')
  const verifiedAgent = await client.callView<string>(CONTRACT_ID, 'get_agent', {})
  const verifiedReq = await client.callView<boolean>(CONTRACT_ID, 'is_requester', { account: OPERATOR_ID })
  const verifiedLimits = await client.callView<any>(CONTRACT_ID, 'get_limits', {})
  const verifiedOwner = await client.callView<string>(CONTRACT_ID, 'get_owner', {})

  console.log('\n' + '═'.repeat(60))
  console.log('✅ BOOTSTRAP COMPLETE! Current FxBudget On-Chain State:')
  console.log('═'.repeat(60))
  console.log(`  Contract: ${CONTRACT_ID}`)
  console.log(`  Owner (DAO): ${verifiedOwner}`)
  console.log(`  Agent: ${verifiedAgent}`)
  console.log(`  Requester (${OPERATOR_ID}): ${verifiedReq ? 'AUTHORIZED' : 'DENIED'}`)
  console.log(`  Auto-Cap Limit: ${Number(verifiedLimits.auto_cap_in) / 1e6} USDC`)
  console.log(`  Max Chunk Limit: ${Number(verifiedLimits.max_chunk_in) / 1e6} USDC`)
  console.log(`  Min Interval: ${Number(verifiedLimits.min_interval_ns) / 1e9} seconds`)
  console.log('═'.repeat(60))
}

main().catch(console.error)


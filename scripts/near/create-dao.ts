/**
 * GetNear — Create Sputnik DAO on NEAR Testnet (P8)
 * Creates chilliroger-dao.sputnik-v2.testnet with a 2-of-3 council policy.
 *
 * Usage: pnpm tsx scripts/near/create-dao.ts
 */

try {
  process.loadEnvFile()
} catch {}

import { NearClient } from '@getnear/near-client'
import { runCallFunction } from './near-runner.js'

const FACTORY_CONTRACT = 'sputnik-v2.testnet'
const DAO_NAME = 'chilliroger-dao'
const FULL_DAO_ID = `${DAO_NAME}.${FACTORY_CONTRACT}`
const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'

const COUNCIL_MEMBERS = [
  process.env.COUNCIL1_ACCOUNT_ID || 'chilliroger-council1.testnet',
  process.env.COUNCIL2_ACCOUNT_ID || 'chilliroger-council2.testnet',
  process.env.COUNCIL3_ACCOUNT_ID || 'chilliroger-council3.testnet',
]

async function main() {
  console.log('═'.repeat(60))
  console.log('       GetNear — Sputnik DAO Creation (P8)')
  console.log('═'.repeat(60))

  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  })

  // 1. Check if DAO already exists
  try {
    const existing = await client.viewAccount(FULL_DAO_ID)
    if (existing) {
      console.log(`ℹ DAO ${FULL_DAO_ID} already exists! Checking policy...`)
      const policy = await client.callView(FULL_DAO_ID, 'get_policy', {})
      console.log('Current Policy:', JSON.stringify(policy, null, 2))
      return
    }
  } catch {
    console.log(`✓ ${FULL_DAO_ID} is available for creation.`)
  }

  // 2. Prepare DaoInitArgs
  const daoConfig = {
    name: DAO_NAME,
    purpose: 'GetNear Autonomous Treasury FX Budget Governance',
    metadata: '',
  }

  // 2-of-3 threshold policy with 0.1 NEAR proposal bond (10^23 yoctoNEAR)
  const daoPolicy = {
    roles: [
      {
        name: 'all',
        kind: 'Everyone',
        permissions: ['*:AddProposal'],
        vote_policy: {},
      },
      {
        name: 'council',
        kind: {
          Group: COUNCIL_MEMBERS,
        },
        permissions: [
          '*:Finalize',
          '*:AddProposal',
          '*:VoteApprove',
          '*:VoteReject',
          '*:VoteRemove',
        ],
        vote_policy: {},
      },
    ],
    default_vote_policy: {
      weight_kind: 'RoleWeight',
      quorum: '0',
      threshold: [2, 3],
    },
    proposal_bond: '100000000000000000000000', // 0.1 NEAR
    proposal_period: '604800000000000', // 7 days in ns
    bounty_bond: '1000000000000000000000000', // 1 NEAR
    bounty_forgiveness_period: '86400000000000', // 1 day in ns
  }

  const daoInitArgs = {
    config: daoConfig,
    policy: daoPolicy,
  }

  const argsBase64 = Buffer.from(JSON.stringify(daoInitArgs)).toString('base64')

  console.log(`\nSubmitting DAO creation to ${FACTORY_CONTRACT}:`)
  console.log(`  DAO Account: ${FULL_DAO_ID}`)
  console.log(`  Signer: ${OPERATOR_ID}`)
  console.log(`  Deposit: 5.5 NEAR`)
  console.log(`  Council Members: ${COUNCIL_MEMBERS.join(', ')}`)
  console.log(`  Voting Threshold: 2 of 3`)

  const res = runCallFunction({
    contractId: FACTORY_CONTRACT,
    methodName: 'create',
    args: {
      name: DAO_NAME,
      args: argsBase64,
    },
    deposit: '5.5 NEAR',
    gas: '150.0 Tgas',
    signerId: OPERATOR_ID,
  })

  console.log('\nTransaction submitted!')
  if (res.txHash) {
    console.log(`  Tx Hash: ${res.txHash}`)
    console.log(`  Explorer: ${res.explorerUrl}`)
  } else {
    console.log('CLI Output:\n', res.stdout)
  }

  // 3. Verify on-chain state
  console.log('\nVerifying newly deployed Sputnik DAO on testnet...')
  // Small wait for indexing
  await new Promise((r) => setTimeout(r, 4000))

  try {
    const verifiedPolicy = await client.callView<any>(FULL_DAO_ID, 'get_policy', {})
    console.log('✅ Sputnik DAO successfully verified on NEAR testnet!')
    console.log(`  Proposal Bond: ${(BigInt(verifiedPolicy.proposal_bond) / 10n ** 24n).toString()} NEAR (or ${verifiedPolicy.proposal_bond} yocto)`)
    console.log(`  Threshold: ${JSON.stringify(verifiedPolicy.default_vote_policy.threshold)}`)
    const councilRole = verifiedPolicy.roles.find((r: any) => r.name === 'council')
    console.log(`  Active Council: ${JSON.stringify(councilRole?.kind?.Group)}`)
  } catch (err) {
    console.error('⚠ Error querying new DAO:', err)
  }
}

main().catch(console.error)

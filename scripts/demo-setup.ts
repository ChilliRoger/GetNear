/**
 * GetNear — Demo Setup & Environment Health Check (P12)
 * READ-ONLY: checks local environment, testnet RPC, contracts, and credentials. Signs nothing.
 *
 * Usage:
 *   pnpm demo:setup
 */

try {
  process.loadEnvFile()
} catch {}

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { NearClient } from '@getnear/near-client'

const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const CONTRACT_ID = process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${OPERATOR_ID}`
const DAO_ID = process.env.SPUTNIK_DAO_ACCOUNT_ID || 'chilliroger-dao.sputnik-v2.testnet'
const AGENT_ID = process.env.AGENT_ACCOUNT_ID || 'chilliroger-agent.testnet'
const CIRCLE_USDC =
  process.env.USDC_CONTRACT_ID || '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af'
const EURE = process.env.EURE_CONTRACT_ID || `eure.${OPERATOR_ID}`
const COUNCIL1 = process.env.COUNCIL1_ACCOUNT_ID || 'chilliroger-council1.testnet'
const COUNCIL2 = process.env.COUNCIL2_ACCOUNT_ID || 'chilliroger-council2.testnet'

const RPC_URLS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org']

async function main() {
  console.log('═'.repeat(64))
  console.log('   GetNear — Judge Demo Setup & Readiness Verification (P12)')
  console.log('═'.repeat(64))

  const client = new NearClient({ networkId: 'testnet', rpcUrls: RPC_URLS })

  console.log('\n[1/4] Node & Tooling Environment:')
  console.log(`  • Node Version:      ${process.version}`)
  console.log(`  • Platform:          ${process.platform} (${process.arch})`)

  console.log('\n[2/4] Testnet RPC Connectivity:')
  try {
    const status = await client.status()
    console.log(`  ✓ Chain ID:          ${status.chain_id} (Strictly testnet)`)
    console.log(`  ✓ Protocol Version:  ${status.protocol_version}`)
    console.log(`  ✓ Latest Block:      ${status.sync_info.latest_block_height}`)
  } catch (err: any) {
    console.error(`  ✗ RPC connection failed: ${err.message}`)
  }

  console.log('\n[3/4] Live Testnet Contracts:')
  try {
    const [owner, agent, inputToken, settlementToken, paused] = await Promise.all([
      client.callView<string>(CONTRACT_ID, 'get_owner', {}),
      client.callView<string>(CONTRACT_ID, 'get_agent', {}),
      client.callView<string>(CONTRACT_ID, 'get_input_token', {}),
      client.callView<string>(CONTRACT_ID, 'get_settlement_token', {}),
      client.callView<boolean>(CONTRACT_ID, 'is_paused', {}),
    ])
    console.log(`  ✓ FxBudget Contract: ${CONTRACT_ID}`)
    console.log(`      Owner (DAO):     ${owner}`)
    console.log(`      Agent:           ${agent}`)
    console.log(`      Input Token:     ${inputToken === CIRCLE_USDC ? 'Circle Native USDC' : inputToken}`)
    console.log(`      Settlement:      ${settlementToken}`)
    console.log(`      Status:          ${paused ? 'PAUSED' : 'ACTIVE'}`)
  } catch (err: any) {
    console.error(`  ✗ Contract check failed: ${err.message}`)
  }

  console.log('\n[4/4] Local Credentials & Account Balances:')
  const credsDir = path.join(os.homedir(), '.near-credentials', 'testnet')
  const accounts = [
    { id: OPERATOR_ID, role: 'Operator / Requester' },
    { id: AGENT_ID, role: 'Autonomous Agent' },
    { id: COUNCIL1, role: 'DAO Council Member 1' },
    { id: COUNCIL2, role: 'DAO Council Member 2' },
  ]

  for (const acct of accounts) {
    const credPath = path.join(credsDir, `${acct.id}.json`)
    const hasCred = fs.existsSync(credPath)
    try {
      const state = (await client.viewAccount(acct.id)) as { amount: string }
      const nearBal = (Number(BigInt(state.amount) / 10n ** 21n) / 1000).toFixed(2)
      console.log(`  • ${acct.role} (${acct.id}):`)
      console.log(`      NEAR: ${nearBal} NEAR | Local Key: ${hasCred ? 'Available' : 'Not Found'}`)
    } catch {
      console.log(`  • ${acct.role} (${acct.id}): Local Key: ${hasCred ? 'Available' : 'Not Found'} (On-chain not found)`)
    }
  }

  console.log('\n' + '─'.repeat(64))
  console.log('Readiness Guidance:')
  console.log('  • To run the automated end-to-end demo:    pnpm demo:run')
  console.log('  • To verify live assertions on testnet:   pnpm verify:readonly')
  console.log('  • To launch the web portal:               pnpm dev (apps/app on :3000)')
  console.log('─'.repeat(64) + '\n')
}

main().catch((err) => {
  console.error('Demo setup check failed:', err)
  process.exit(1)
})


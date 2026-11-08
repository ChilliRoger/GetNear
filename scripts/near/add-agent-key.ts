/**
 * GetNear — Add Restricted Function-Call Access Key for Agent (P8)
 * Adds an access key to chilliroger-agent.testnet with permissions restricted to:
 * - Receiver: fx-budget.chilliroger-operator.testnet
 * - Methods: ["execute_chunk"]
 * - Allowance: 0.25 NEAR
 *
 * Usage: pnpm tsx scripts/near/add-agent-key.ts
 */

try {
  process.loadEnvFile()
} catch {}

import { NearClient } from '@getnear/near-client'
import { runAddRestrictedKey } from './near-runner.js'

const AGENT_ID = process.env.AGENT_ACCOUNT_ID || 'chilliroger-agent.testnet'
const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const CONTRACT_ID = `fx-budget.${OPERATOR_ID}`

async function main() {
  console.log('═'.repeat(60))
  console.log('       GetNear — Agent Restricted Key Setup (P8)')
  console.log('═'.repeat(60))

  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  })

  // 1. Audit current keys on agent account
  const keysBefore = await client.viewAccessKeyList(AGENT_ID)
  console.log(`Agent account ${AGENT_ID} has ${keysBefore.keys.length} existing key(s).`)

  // Check if a restricted key for fx-budget already exists
  const existingRestricted = keysBefore.keys.find((k) => {
    if (k.access_key.permission === 'FullAccess') return false
    const fc = (k.access_key.permission as any).FunctionCall
    return fc?.receiver_id === CONTRACT_ID && fc?.method_names?.includes('execute_chunk')
  })

  if (existingRestricted) {
    console.log(`ℹ Agent already has a restricted key for ${CONTRACT_ID}:`)
    console.log(`  Public Key: ${existingRestricted.public_key}`)
    console.log(`  Permission:`, JSON.stringify(existingRestricted.access_key.permission, null, 2))
    return
  }

  // 2. Add restricted key via near-cli-rs
  console.log(`\nAdding restricted function-call access key to ${AGENT_ID}...`)
  console.log(`  Target Contract: ${CONTRACT_ID}`)
  console.log(`  Allowed Methods: ["execute_chunk"]`)
  console.log(`  Gas Allowance: 0.25 NEAR (2.5e23 yoctoNEAR)`)

  const res = runAddRestrictedKey({
    accountId: AGENT_ID,
    contractAccountId: CONTRACT_ID,
    functionNames: ['execute_chunk'],
    allowance: '0.25 NEAR',
  })

  console.log(`✓ Access key transaction submitted!`)
  if (res.txHash) {
    console.log(`  Tx Hash: ${res.txHash}`)
    console.log(`  Explorer: ${res.explorerUrl}`)
  }

  // 3. Verify on-chain via view_access_key_list RPC call
  await new Promise((r) => setTimeout(r, 4000))
  const keysAfter = await client.viewAccessKeyList(AGENT_ID)
  console.log(`\nAgent account now has ${keysAfter.keys.length} key(s).`)

  const verifiedKey = keysAfter.keys.find((k) => {
    if (k.access_key.permission === 'FullAccess') return false
    const fc = (k.access_key.permission as any).FunctionCall
    return fc?.receiver_id === CONTRACT_ID && fc?.method_names?.includes('execute_chunk')
  })

  if (!verifiedKey) {
    throw new Error('Failed to verify new restricted access key on NEAR testnet!')
  }

  const perm = (verifiedKey.access_key.permission as any).FunctionCall
  console.log('\n' + '═'.repeat(60))
  console.log('✅ RESTRICTED ACCESS KEY VERIFIED ON-CHAIN:')
  console.log('═'.repeat(60))
  console.log(`  Account ID: ${AGENT_ID}`)
  console.log(`  Public Key: ${verifiedKey.public_key}`)
  console.log(`  Allowed Receiver: ${perm.receiver_id}`)
  console.log(`  Allowed Methods: ${JSON.stringify(perm.method_names)}`)
  console.log(`  Allowance: ${(BigInt(perm.allowance) / 10n ** 24n).toString()} NEAR (${perm.allowance} yocto)`)
  console.log('═'.repeat(60))
  console.log('\n[Security Note]: Function-call keys cannot attach deposits and cannot execute any method other than execute_chunk.')
}

main().catch(console.error)

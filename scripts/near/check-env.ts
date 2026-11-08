/**
 * GetNear Environment & Testnet Health Check (P4)
 * Run with: pnpm near:check
 */

try {
  // Load local .env (Node 20.6+ built-in)
  process.loadEnvFile()
} catch {
  // .env not present or already in environment
}

import { loadConfig } from '@getnear/shared'
import { yoctoToNear, explorerAccountUrl } from '@getnear/shared'
import { NearClient } from '@getnear/near-client'

async function checkEnv() {
  console.log('═'.repeat(60))
  console.log('       GetNear — NEAR Testnet Environment Check (P4)')
  console.log('═'.repeat(60))

  let hasErrors = false

  // 1. Config validation
  let config
  try {
    config = loadConfig()
    console.log('\n[1/3] Configuration Validation:')
    console.log('  ✓ Config schema validated successfully with Zod')
    console.log(`  ✓ Network ID: ${config.NEAR_NETWORK_ID} (Strictly testnet)`)
    console.log(`  ✓ Primary RPC: ${config.NEAR_RPC_URLS[0]}`)
    if (config.NEAR_RPC_URLS[1]) {
      console.log(`  ✓ Fallback RPC: ${config.NEAR_RPC_URLS[1]}`)
    }
  } catch (err) {
    console.error('  ✗ Config validation failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  // 2. RPC connectivity check
  console.log('\n[2/3] RPC Reachability & Chain Check:')
  const client = new NearClient({
    networkId: config.NEAR_NETWORK_ID,
    rpcUrls: config.NEAR_RPC_URLS,
  })

  try {
    const status = await client.status()
    if (status.chain_id !== 'testnet') {
      console.error(`  ✗ Chain ID mismatch: expected "testnet", got "${status.chain_id}"`)
      hasErrors = true
    } else {
      console.log(`  ✓ Chain ID verified: "${status.chain_id}"`)
      console.log(`  ✓ Node version: ${status.version.version}`)
      console.log(`  ✓ Latest block height: ${status.sync_info.latest_block_height}`)
      console.log(`  ✓ Syncing: ${status.sync_info.syncing ? 'YES' : 'NO (in sync)'}`)
    }
  } catch (err) {
    console.error('  ✗ RPC status check failed:', err instanceof Error ? err.message : err)
    hasErrors = true
  }

  // 3. Testnet accounts check
  console.log('\n[3/3] Configured Testnet Accounts Check:')
  const accountsToCheck: Array<{ role: string; id: string }> = [
    { role: 'Operator (Requester)', id: process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet' },
    { role: 'Council Member 1', id: process.env.COUNCIL1_ACCOUNT_ID || 'chilliroger-council1.testnet' },
    { role: 'Council Member 2', id: process.env.COUNCIL2_ACCOUNT_ID || 'chilliroger-council2.testnet' },
    { role: 'Council Member 3', id: process.env.COUNCIL3_ACCOUNT_ID || 'chilliroger-council3.testnet' },
    { role: 'Agent Runner', id: config.AGENT_ACCOUNT_ID || process.env.AGENT_ACCOUNT_ID || 'chilliroger-agent.testnet' },
  ]

  for (const acc of accountsToCheck) {
    if (!acc.id) {
      console.log(`  ⚠ ${acc.role}: Not set in .env`)
      continue
    }

    try {
      const view = await client.viewAccount(acc.id)
      const nearBal = yoctoToNear(view.amount).toFixed(2)
      const keys = await client.viewAccessKeyList(acc.id)
      const explorer = explorerAccountUrl(acc.id, config.NEAR_EXPLORER_BASE)

      console.log(`  ✓ ${acc.role}: ${acc.id}`)
      console.log(`      Balance: ${nearBal} NEAR | Keys: ${keys.keys.length}`)
      console.log(`      Explorer: ${explorer}`)
    } catch (err) {
      console.error(`  ✗ ${acc.role} (${acc.id}): Account check failed!`)
      console.error(`      Error: ${err instanceof Error ? err.message : err}`)
      hasErrors = true
    }
  }

  console.log('\n' + '─'.repeat(60))
  if (hasErrors) {
    console.error('❌ NEAR Environment Check completed with ERRORS. See above.')
    process.exit(1)
  } else {
    console.log('✅ All checks passed! NEAR testnet environment is READY.')
    console.log('─'.repeat(60))
  }
}

checkEnv().catch((err) => {
  console.error('Fatal error in check-env:', err)
  process.exit(1)
})

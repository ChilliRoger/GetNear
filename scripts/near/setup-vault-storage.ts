/**
 * GetNear — Setup NEP-145 Storage Registration & Vault Liquidity
 * Registers FX Budget Contract and accounts on USDC & EURe token contracts,
 * and seeds the FX vault with 100,000 EURe liquidity for real on-chain chunk settlements.
 *
 * Usage: pnpm tsx scripts/near/setup-vault-storage.ts
 */

try {
  process.loadEnvFile()
} catch {}

import { NearClient } from '@getnear/near-client'
import { runCallFunction } from './near-runner.js'

const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const FX_BUDGET_ID = process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${OPERATOR_ID}`
const USDC_ID = `usdc.${OPERATOR_ID}`
const EURE_ID = `eure.${OPERATOR_ID}`

// 100,000 EURe seed liquidity for FX Vault (6 decimals = 100_000_000_000)
const VAULT_SEED_EURE = '100000000000'

const ACCOUNTS_TO_REGISTER = [
  FX_BUDGET_ID,
  'chilliroger-council1.testnet',
  'chilliroger-council2.testnet',
  'chilliroger-council3.testnet',
  'chilliroger-agent.testnet',
]

async function registerAccount(tokenId: string, symbol: string, accountId: string, client: NearClient) {
  try {
    const bal = await client.callView<any>(tokenId, 'storage_balance_of', { account_id: accountId })
    if (bal && BigInt(bal.total) > 0n) {
      console.log(`ℹ Account ${accountId} already registered on ${symbol}.`)
      return
    }
  } catch {}

  console.log(`Registering storage for ${accountId} on ${symbol}...`)
  try {
    runCallFunction({
      contractId: tokenId,
      methodName: 'storage_deposit',
      args: { account_id: accountId, registration_only: false },
      deposit: '0.0125 NEAR',
      gas: '30.0 Tgas',
      signerId: OPERATOR_ID,
    })
    console.log(`✓ Storage registered for ${accountId} on ${symbol}!`)
  } catch (err: any) {
    console.warn(`Storage registration warning for ${accountId}: ${err.message}`)
  }
}

async function main() {
  console.log('═'.repeat(60))
  console.log('   GetNear — Vault Storage Registration & Liquidity Seeding')
  console.log('═'.repeat(60))

  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  })

  // 1. Register Accounts on USDC
  console.log('\nRegistering accounts on USDC contract...')
  for (const acc of ACCOUNTS_TO_REGISTER) {
    await registerAccount(USDC_ID, 'USDC', acc, client)
  }

  // 2. Register Accounts on EURe
  console.log('\nRegistering accounts on EURe contract...')
  for (const acc of ACCOUNTS_TO_REGISTER) {
    await registerAccount(EURE_ID, 'EURe', acc, client)
  }

  // 3. Fund FX Budget Vault with EURe liquidity
  const currentVaultEure = await client.callView<string>(EURE_ID, 'ft_balance_of', { account_id: FX_BUDGET_ID })
  console.log(`\nCurrent FX Budget EURe Balance: ${Number(currentVaultEure || '0') / 1e6} EURe`)

  if (BigInt(currentVaultEure || '0') < BigInt(VAULT_SEED_EURE)) {
    console.log(`Transferring ${Number(VAULT_SEED_EURE) / 1e6} EURe from Operator to FX Budget Vault...`)
    runCallFunction({
      contractId: EURE_ID,
      methodName: 'ft_transfer',
      args: {
        receiver_id: FX_BUDGET_ID,
        amount: VAULT_SEED_EURE,
        memo: 'GetNear FX Budget Vault Liquidity Seed',
      },
      deposit: '1 yoctoNEAR',
      gas: '50.0 Tgas',
      signerId: OPERATOR_ID,
    })
    console.log(`✓ Successfully seeded FX Budget Vault with ${Number(VAULT_SEED_EURE) / 1e6} EURe!`)
  } else {
    console.log(`ℹ Vault is already well-funded.`)
  }

  // 4. Verify Final Balances
  const opUsdc = await client.callView<string>(USDC_ID, 'ft_balance_of', { account_id: OPERATOR_ID })
  const opEure = await client.callView<string>(EURE_ID, 'ft_balance_of', { account_id: OPERATOR_ID })
  const vaultEure = await client.callView<string>(EURE_ID, 'ft_balance_of', { account_id: FX_BUDGET_ID })

  console.log('\n' + '═'.repeat(60))
  console.log('✅ SUMMARY OF VERIFIED ON-CHAIN BALANCES:')
  console.log(`  Operator USDC:   ${(Number(opUsdc) / 1e6).toLocaleString()} USDC`)
  console.log(`  Operator EURe:   ${(Number(opEure) / 1e6).toLocaleString()} EURe`)
  console.log(`  FX Vault EURe:   ${(Number(vaultEure) / 1e6).toLocaleString()} EURe`)
  console.log('═'.repeat(60))
}

main().catch(console.error)


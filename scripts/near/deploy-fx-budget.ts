/**
 * GetNear — Deploy FxBudget Smart Contract on NEAR Testnet (P8)
 * Creates subaccount fx-budget.chilliroger-operator.testnet, deploys WASM,
 * and initializes contract with owner = chilliroger-dao.sputnik-v2.testnet.
 *
 * Usage: pnpm tsx scripts/near/deploy-fx-budget.ts
 */

try {
  process.loadEnvFile()
} catch {}

import * as path from 'node:path'
import * as fs from 'node:fs'
import { NearClient } from '@getnear/near-client'
import { runCallFunction, runCreateSubaccount, runDeployContract } from './near-runner.js'

const CIRCLE_NEAR_TESTNET_USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af'
const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const CONTRACT_ID = process.env.FX_BUDGET_CONTRACT_ID || `fx-budget.${OPERATOR_ID}`
const DAO_ID = process.env.SPUTNIK_DAO_ACCOUNT_ID || 'chilliroger-dao.sputnik-v2.testnet'
const EURE_ID = process.env.EURE_CONTRACT_ID || `eure.${OPERATOR_ID}`
const INPUT_USDC_ID = process.env.USDC_CONTRACT_ID || CIRCLE_NEAR_TESTNET_USDC
const IS_MIGRATE = process.argv.includes('--migrate')
const IS_MIGRATE_V3 = process.argv.includes('--migrate-v3')

const WASM_PATH = path.resolve(process.cwd(), 'contracts/fx-budget/res/fx_budget.wasm')

async function main() {
  console.log('═'.repeat(60))
  console.log('       GetNear — FxBudget Contract Deployment (P8)')
  console.log('═'.repeat(60))

  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  })

  if (!fs.existsSync(WASM_PATH)) {
    throw new Error(`WASM file not found at ${WASM_PATH}. Run "pnpm build:contract" first.`)
  }
  const wasmSize = (fs.statSync(WASM_PATH).size / 1024).toFixed(1)
  console.log(`✓ WASM artifact located: ${WASM_PATH} (${wasmSize} KB)`)

  // 1. Check if contract subaccount exists; if not, create it
  let accountExists = false
  try {
    const acc = await client.viewAccount(CONTRACT_ID)
    if (acc) {
      console.log(`ℹ Subaccount ${CONTRACT_ID} already exists.`)
      accountExists = true
    }
  } catch {
    console.log(`Creating subaccount ${CONTRACT_ID} funded from ${OPERATOR_ID}...`)
    const subRes = runCreateSubaccount({
      subaccountId: CONTRACT_ID,
      initialBalance: '3.5 NEAR',
      signerId: OPERATOR_ID,
    })
    console.log(`✓ Subaccount creation transaction submitted!`)
    if (subRes.txHash) {
      console.log(`  Tx Hash: ${subRes.txHash}`)
      console.log(`  Explorer: ${subRes.explorerUrl}`)
    }
    // Wait for account propagation
    await new Promise((r) => setTimeout(r, 4000))
  }

  // 2. Deploy contract WASM with either migrate_v3, legacy migrate, or fresh new(...) init call
  let hasV2Settlement = false
  if (accountExists) {
    try {
      const tok = await client.callView<string | null>(CONTRACT_ID, 'get_settlement_token', {})
      hasV2Settlement = Boolean(tok)
    } catch {}
  }

  const initMethod = IS_MIGRATE_V3 || hasV2Settlement
    ? 'migrate_v3'
    : IS_MIGRATE || accountExists
    ? 'migrate'
    : 'new'
  const initArgs =
    initMethod === 'migrate_v3'
      ? { input_token: INPUT_USDC_ID }
      : initMethod === 'migrate'
      ? { settlement_token: EURE_ID }
      : { owner: DAO_ID, settlement_token: EURE_ID }

  console.log(`\nDeploying FxBudget WASM to ${CONTRACT_ID} with ${initMethod}(${JSON.stringify(initArgs)})...`)
  const deployRes = runDeployContract({
    contractAccountId: CONTRACT_ID,
    wasmPath: WASM_PATH,
    initMethod,
    initArgs,
    initDeposit: '0 NEAR',
    initGas: '100.0 Tgas',
    signerId: CONTRACT_ID,
  })

  console.log(`✓ Deployment transaction submitted!`)
  if (deployRes.txHash) {
    console.log(`  Tx Hash: ${deployRes.txHash}`)
    console.log(`  Explorer: ${deployRes.explorerUrl}`)
  }

  // 3. Verify deployed contract on-chain
  console.log('\nVerifying deployed contract state on NEAR testnet...')
  await new Promise((r) => setTimeout(r, 4000))

  try {
    const owner = await client.callView<string>(CONTRACT_ID, 'get_owner', {})
    const agent = await client.callView<string | null>(CONTRACT_ID, 'get_agent', {})
    const settlementToken = await client.callView<string | null>(CONTRACT_ID, 'get_settlement_token', {})
    const inputToken = await client.callView<string | null>(CONTRACT_ID, 'get_input_token', {})
    const limits = await client.callView<any>(CONTRACT_ID, 'get_limits', {})
    const paused = await client.callView<boolean>(CONTRACT_ID, 'is_paused', {})
    const orders = await client.callView<any[]>(CONTRACT_ID, 'list_orders', { from_index: 0, limit: 50 })

    console.log('✅ FxBudget Contract successfully deployed and verified!')
    console.log(`  Contract ID: ${CONTRACT_ID}`)
    console.log(`  Owner (DAO): ${owner}`)
    console.log(`  Agent: ${agent}`)
    console.log(`  Settlement Token: ${settlementToken}`)
    console.log(`  Input Escrow Token: ${inputToken}`)
    console.log(`  Paused: ${paused}`)
    console.log(`  Limits: Auto-Cap ${Number(limits.auto_cap_in) / 1e6} | Max Chunk ${Number(limits.max_chunk_in) / 1e6} | Min Interval ${Number(limits.min_interval_ns) / 1e9}s`)
    console.log(`  Orders Count: ${orders.length}`)

    // Ensure FxBudget contract is storage-registered on the configured Circle USDC contract
    if (inputToken) {
      const storage = await client.callView<any>(inputToken, 'storage_balance_of', {
        account_id: CONTRACT_ID,
      })
      if (!storage || BigInt(storage.total || '0') === 0n) {
        console.log(`\nRegistering ${CONTRACT_ID} on Circle USDC (${inputToken})...`)
        const regRes = runCallFunction({
          contractId: inputToken,
          methodName: 'storage_deposit',
          args: { account_id: CONTRACT_ID, registration_only: true },
          deposit: '0.00125 NEAR',
          gas: '30.0 Tgas',
          signerId: OPERATOR_ID,
        })
        console.log(`✓ Storage registered! Tx: ${regRes.txHash}`)
      }
    }
  } catch (err) {
    console.error('⚠ Error querying deployed contract:', err)
  }
}

main().catch(console.error)


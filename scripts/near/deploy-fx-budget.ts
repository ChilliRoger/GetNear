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
import { runCreateSubaccount, runDeployContract } from './near-runner.js'

const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const CONTRACT_ID = `fx-budget.${OPERATOR_ID}`
const DAO_ID = `chilliroger-dao.sputnik-v2.testnet`

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

  // 2. Deploy contract WASM and initialize with new(owner = DAO)
  console.log(`\nDeploying FxBudget WASM to ${CONTRACT_ID} with init call new(owner: "${DAO_ID}")...`)
  const deployRes = runDeployContract({
    contractAccountId: CONTRACT_ID,
    wasmPath: WASM_PATH,
    initMethod: 'new',
    initArgs: {
      owner: DAO_ID,
    },
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
    const limits = await client.callView<any>(CONTRACT_ID, 'get_limits', {})
    const paused = await client.callView<boolean>(CONTRACT_ID, 'is_paused', {})
    const orders = await client.callView<any[]>(CONTRACT_ID, 'list_orders', { from_index: 0, limit: 10 })

    console.log('✅ FxBudget Contract successfully deployed and verified!')
    console.log(`  Contract ID: ${CONTRACT_ID}`)
    console.log(`  Owner (DAO): ${owner}`)
    console.log(`  Paused: ${paused}`)
    console.log(`  Limits: Auto-Cap ${Number(limits.auto_cap_in) / 1e6} USDC | Max Chunk ${Number(limits.max_chunk_in) / 1e6} USDC | Min Interval ${Number(limits.min_interval_ns) / 1e9}s`)
    console.log(`  Orders Count: ${orders.length}`)
  } catch (err) {
    console.error('⚠ Error querying deployed contract:', err)
  }
}

main().catch(console.error)

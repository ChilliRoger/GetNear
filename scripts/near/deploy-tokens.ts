/**
 * GetNear — Deploy Testnet NEP-141 USDC & EURe Token Contracts
 * Deploys standard NEP-141 Fungible Token contracts for real on-chain FX settlement.
 *
 * Usage: pnpm tsx scripts/near/deploy-tokens.ts
 */

try {
  process.loadEnvFile()
} catch {}

import * as path from 'node:path'
import * as fs from 'node:fs'
import { NearClient } from '@getnear/near-client'
import { runCreateSubaccount, runDeployContract, runCallFunction, runTransferNear } from './near-runner.js'

const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const USDC_ID = `usdc.${OPERATOR_ID}`
const EURE_ID = `eure.${OPERATOR_ID}`
const WASM_PATH = path.resolve(process.cwd(), 'contracts/fungible_token.wasm')

// 1 Million tokens with 6 decimals = 1_000_000_000_000 atomic units
const INITIAL_SUPPLY = '1000000000000'

const USDC_ICON =
  "data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='16' cy='16' r='16' fill='%232775C9'/%3E%3Cpath d='M15.75 27.5C9.26 27.5 4 22.24 4 15.75S9.26 4 15.75 4 27.5 9.26 27.5 15.75A11.75 11.75 0 0115.75 27.5zm-.7-16.11a2.58 2.58 0 00-2.45 2.47c0 1.21.74 2 2.31 2.33l1.1.26c1.07.25 1.51.61 1.51 1.22s-.77 1.21-1.77 1.21a1.9 1.9 0 01-1.8-.91.68.68 0 00-.61-.39h-.59a.35.35 0 00-.28.41 2.73 2.73 0 002.61 2.08v.84a.705.705 0 001.41 0v-.85a2.62 2.62 0 002.59-2.58c0-1.27-.73-2-2.46-2.37l-1-.22c-1-.25-1.47-.58-1.47-1.14 0-.56.6-1.18 1.6-1.18a1.64 1.64 0 011.59.81.8.8 0 00.72.46h.47a.42.42 0 00.31-.5 2.65 2.65 0 00-2.38-2v-.69a.705.705 0 00-1.41 0v.74zm-8.11 4.36a8.79 8.79 0 006 8.33h.14a.45.45 0 00.45-.45v-.21a.94.94 0 00-.58-.87 7.36 7.36 0 010-13.65.93.93 0 00.58-.86v-.23a.42.42 0 00-.56-.4 8.79 8.79 0 00-6.03 8.34zm17.62 0a8.79 8.79 0 00-6-8.32h-.15a.47.47 0 00-.47.47v.15a1 1 0 00.61.9 7.36 7.36 0 010 13.64 1 1 0 00-.6.89v.17a.47.47 0 00.62.44 8.79 8.79 0 005.99-8.34z' fill='%23FFF'/%3E%3C/svg%3E"

const EURE_ICON =
  "data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='16' cy='16' r='16' fill='%2310B981'/%3E%3Ctext x='16' y='21' font-size='16' font-family='Arial, sans-serif' font-weight='bold' fill='white' text-anchor='middle'%3E€%3C/text%3E%3C/svg%3E"

async function deployToken(params: {
  accountId: string
  name: string
  symbol: string
  icon: string
  client: NearClient
}) {
  const { accountId, name, symbol, icon, client } = params
  console.log(`\n────────────────────────────────────────────────────────────`)
  console.log(`Deploying NEP-141 Token: ${symbol} (${accountId})`)
  console.log(`────────────────────────────────────────────────────────────`)

  // 1. Check or create subaccount
  let acc: any = null
  try {
    acc = await client.viewAccount(accountId)
    if (acc) {
      console.log(`ℹ Subaccount ${accountId} already exists.`)
    }
  } catch {
    console.log(`Creating subaccount ${accountId} funded from ${OPERATOR_ID}...`)
    runCreateSubaccount({
      subaccountId: accountId,
      initialBalance: '2.5 NEAR',
      signerId: OPERATOR_ID,
    })
    console.log(`✓ Subaccount ${accountId} created!`)
    await new Promise((r) => setTimeout(r, 4000))
    acc = await client.viewAccount(accountId)
  }

  // 1b. Check if account has enough storage balance for the WASM binary (~205KB requires ~2.1 NEAR)
  if (acc && BigInt(acc.amount) < 2300000000000000000000000n) {
    console.log(`Account ${accountId} balance is low for bytecode storage. Topping up 1.0 NEAR from ${OPERATOR_ID}...`)
    runTransferNear({
      receiverId: accountId,
      amount: '1.0 NEAR',
      signerId: OPERATOR_ID,
    })
    console.log(`✓ Topped up 1.0 NEAR!`)
    await new Promise((r) => setTimeout(r, 3000))
  }

  // 2. Check if already initialized
  let isInitialized = false
  try {
    const meta = await client.callView<any>(accountId, 'ft_metadata', {})
    if (meta && meta.symbol) {
      isInitialized = true
      console.log(`ℹ Contract ${accountId} already initialized with symbol ${meta.symbol}.`)
    }
  } catch {}

  if (!isInitialized) {
    console.log(`Deploying fungible_token.wasm to ${accountId}...`)
    const deployRes = runDeployContract({
      contractAccountId: accountId,
      wasmPath: WASM_PATH,
      initMethod: 'new',
      initArgs: {
        name,
        symbol,
        decimals: 6,
      },
      initDeposit: '0 NEAR',
      initGas: '100.0 Tgas',
      signerId: accountId,
    })

    console.log(`✓ Deployed and initialized ${symbol}! Tx: ${deployRes.txHash || 'confirmed'}`)
    await new Promise((r) => setTimeout(r, 3000))

    // 3. Set Token Icon
    if (icon) {
      try {
        console.log(`Setting icon for ${symbol}...`)
        runCallFunction({
          contractId: accountId,
          methodName: 'set_icon',
          args: { icon },
          deposit: '0 NEAR',
          gas: '30.0 Tgas',
          signerId: accountId,
        })
        console.log(`✓ Icon set for ${symbol}!`)
      } catch (err: any) {
        console.warn(`Could not set icon: ${err.message}`)
      }
    }
  }

  // 4. Register storage deposit for operator if needed
  try {
    const storageBal = await client.callView<any>(accountId, 'storage_balance_of', { account_id: OPERATOR_ID })
    if (!storageBal || BigInt(storageBal.total) === 0n) {
      console.log(`Registering storage deposit for operator ${OPERATOR_ID}...`)
      runCallFunction({
        contractId: accountId,
        methodName: 'storage_deposit',
        args: { account_id: OPERATOR_ID, registration_only: false },
        deposit: '0.0125 NEAR',
        gas: '30.0 Tgas',
        signerId: OPERATOR_ID,
      })
      console.log(`✓ Storage registered for ${OPERATOR_ID}!`)
    } else {
      console.log(`ℹ Operator ${OPERATOR_ID} storage already registered on ${symbol}.`)
    }
  } catch (e: any) {
    console.log(`Registering storage deposit for operator ${OPERATOR_ID}...`)
    runCallFunction({
      contractId: accountId,
      methodName: 'storage_deposit',
      args: { account_id: OPERATOR_ID, registration_only: false },
      deposit: '0.0125 NEAR',
      gas: '30.0 Tgas',
      signerId: OPERATOR_ID,
    })
  }

  // 5. Mint Initial Supply to operator if balance is 0
  const bal = await client.callView<string>(accountId, 'ft_balance_of', { account_id: OPERATOR_ID })
  if (BigInt(bal || '0') === 0n) {
    console.log(`Minting initial supply (${Number(INITIAL_SUPPLY) / 1e6} ${symbol}) to ${OPERATOR_ID}...`)
    runCallFunction({
      contractId: accountId,
      methodName: 'mint',
      args: { account_id: OPERATOR_ID, amount: INITIAL_SUPPLY },
      deposit: '0 NEAR',
      gas: '30.0 Tgas',
      signerId: accountId,
    })
    console.log(`✓ Minted ${Number(INITIAL_SUPPLY) / 1e6} ${symbol}!`)
    await new Promise((r) => setTimeout(r, 2000))
  } else {
    console.log(`ℹ Operator already holds ${Number(bal) / 1e6} ${symbol}.`)
  }

  // 6. Verify on-chain metadata & balance
  const meta = await client.callView<any>(accountId, 'ft_metadata', {})
  const finalBal = await client.callView<string>(accountId, 'ft_balance_of', { account_id: OPERATOR_ID })

  console.log(`✅ Verified on-chain:`)
  console.log(`   Name: ${meta.name}`)
  console.log(`   Symbol: ${meta.symbol}`)
  console.log(`   Decimals: ${meta.decimals}`)
  console.log(`   Operator Balance: ${Number(finalBal) / 1e6} ${meta.symbol}`)
}

async function main() {
  console.log('═'.repeat(60))
  console.log('     GetNear — NEP-141 Stablecoin Token Deployment')
  console.log('═'.repeat(60))

  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  })

  if (!fs.existsSync(WASM_PATH)) {
    throw new Error(`WASM file not found at ${WASM_PATH}`)
  }

  // Deploy USDC
  await deployToken({
    accountId: USDC_ID,
    name: 'USD Coin (Testnet)',
    symbol: 'USDC',
    icon: USDC_ICON,
    client,
  })

  // Deploy EURe
  await deployToken({
    accountId: EURE_ID,
    name: 'Euro Stablecoin (Testnet)',
    symbol: 'EURe',
    icon: EURE_ICON,
    client,
  })

  console.log('\n' + '═'.repeat(60))
  console.log('🎉 BOTH NEP-141 TOKENS SUCCESSFULLY DEPLOYED & VERIFIED!')
  console.log(`  USDC: ${USDC_ID}`)
  console.log(`  EURe: ${EURE_ID}`)
  console.log('═'.repeat(60))
}

main().catch(console.error)

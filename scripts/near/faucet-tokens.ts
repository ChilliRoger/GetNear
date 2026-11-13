/**
 * GetNear — Testnet Stablecoin Faucet
 * Automatically registers NEP-145 storage and mints testnet USDC to a user's account,
 * preparing their wallet for real on-chain FX swap orders.
 *
 * Usage: pnpm tsx scripts/near/faucet-tokens.ts <receiver.testnet> [amount]
 */

try {
  process.loadEnvFile()
} catch {}

import { NearClient } from '@getnear/near-client'
import { runCallFunction } from './near-runner.js'

const MAX_FAUCET_AMOUNT = 1000
const TESTNET_ACCOUNT_RE = /^(?=.{8,64}$)(?:[a-z\d]+[-_])*[a-z\d]+(?:\.(?:[a-z\d]+[-_])*[a-z\d]+)*\.testnet$/

const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
const USDC_ID = `usdc.${OPERATOR_ID}`
const EURE_ID = `eure.${OPERATOR_ID}`

export async function claimFaucetTokens(receiverId: string, amountUsdc: number = 500) {
  if (!TESTNET_ACCOUNT_RE.test(receiverId)) {
    throw new Error(`Invalid NEAR testnet account ID: ${JSON.stringify(receiverId)}`)
  }
  if (!Number.isInteger(amountUsdc) || amountUsdc < 1 || amountUsdc > MAX_FAUCET_AMOUNT) {
    throw new Error(`Faucet amount must be an integer between 1 and ${MAX_FAUCET_AMOUNT}`)
  }

  const client = new NearClient({
    networkId: 'testnet',
    rpcUrls: ['https://rpc.testnet.near.org', 'https://test.rpc.fastnear.com'],
  })

  console.log(`\n────────────────────────────────────────────────────────────`)
  console.log(`Dispensing ${amountUsdc} Testnet USDC to ${receiverId}...`)
  console.log(`────────────────────────────────────────────────────────────`)

  // 1. Ensure storage is registered on USDC
  try {
    const bal = await client.callView<any>(USDC_ID, 'storage_balance_of', { account_id: receiverId })
    if (!bal || BigInt(bal.total) === 0n) {
      console.log(`Registering storage on USDC contract for ${receiverId}...`)
      runCallFunction({
        contractId: USDC_ID,
        methodName: 'storage_deposit',
        args: { account_id: receiverId, registration_only: false },
        deposit: '0.0125 NEAR',
        gas: '30.0 Tgas',
        signerId: OPERATOR_ID,
      })
      console.log(`✓ Storage registered on USDC!`)
    }
  } catch {
    console.log(`Registering storage on USDC for ${receiverId}...`)
    runCallFunction({
      contractId: USDC_ID,
      methodName: 'storage_deposit',
      args: { account_id: receiverId, registration_only: false },
      deposit: '0.0125 NEAR',
      gas: '30.0 Tgas',
      signerId: OPERATOR_ID,
    })
  }

  // 2. Ensure storage is registered on EURe so settlements succeed without error
  try {
    const bal = await client.callView<any>(EURE_ID, 'storage_balance_of', { account_id: receiverId })
    if (!bal || BigInt(bal.total) === 0n) {
      console.log(`Registering storage on EURe contract for ${receiverId}...`)
      runCallFunction({
        contractId: EURE_ID,
        methodName: 'storage_deposit',
        args: { account_id: receiverId, registration_only: false },
        deposit: '0.0125 NEAR',
        gas: '30.0 Tgas',
        signerId: OPERATOR_ID,
      })
      console.log(`✓ Storage registered on EURe!`)
    }
  } catch {
    console.log(`Registering storage on EURe for ${receiverId}...`)
    runCallFunction({
      contractId: EURE_ID,
      methodName: 'storage_deposit',
      args: { account_id: receiverId, registration_only: false },
      deposit: '0.0125 NEAR',
      gas: '30.0 Tgas',
      signerId: OPERATOR_ID,
    })
  }

  // 3. Mint USDC to receiver
  const atomicAmount = (BigInt(amountUsdc) * 1_000_000n).toString()
  console.log(`Minting ${amountUsdc} USDC to ${receiverId}...`)
  const mintRes = runCallFunction({
    contractId: USDC_ID,
    methodName: 'mint',
    args: { account_id: receiverId, amount: atomicAmount },
    deposit: '0 NEAR',
    gas: '30.0 Tgas',
    signerId: OPERATOR_ID,
  })
  console.log(`✓ Minted! Tx: ${mintRes.txHash || 'confirmed'}`)

  // 4. Verify new balances
  const usdcBal = await client.callView<string>(USDC_ID, 'ft_balance_of', { account_id: receiverId })
  const eureBal = await client.callView<string>(EURE_ID, 'ft_balance_of', { account_id: receiverId })

  console.log(`\nVerified Balances for ${receiverId}:`)
  console.log(`  USDC: ${Number(usdcBal) / 1e6} USDC`)
  console.log(`  EURe: ${Number(eureBal) / 1e6} EURe`)

  return {
    receiverId,
    usdcBalance: Number(usdcBal) / 1e6,
    eureBalance: Number(eureBal) / 1e6,
    txHash: mintRes.txHash,
  }
}

// Standalone execution if run from CLI
if (process.argv[1]?.endsWith('faucet-tokens.ts')) {
  const target = process.argv[2] || OPERATOR_ID
  const amount = process.argv[3] === undefined ? 500 : Number(process.argv[3])
  claimFaucetTokens(target, amount)
    .then((res) => {
      console.log('Faucet claim complete:', res)
    })
    .catch((err) => {
      console.error('Faucet claim failed:', err)
      process.exit(1)
    })
}


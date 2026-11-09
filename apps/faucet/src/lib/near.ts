/**
 * GetNear Faucet — Serverless NEAR Testnet Transaction Engine
 * Operates purely in-memory via near-api-js v7 without local CLI binaries.
 * Works seamlessly on Vercel Serverless Functions and local Node environments.
 */

import {
  Account,
  JsonRpcProvider,
  KeyPairSigner,
  KeyPair,
} from 'near-api-js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

export const OPERATOR_ID = process.env.OPERATOR_ACCOUNT_ID || 'chilliroger-operator.testnet'
export const USDC_CONTRACT_ID = process.env.USDC_CONTRACT_ID || `usdc.${OPERATOR_ID}`
export const EURE_CONTRACT_ID = process.env.EURE_CONTRACT_ID || `eure.${OPERATOR_ID}`
export const NETWORK_ID = process.env.NEAR_NETWORK_ID || 'testnet'
export const RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org'

// 0.0125 NEAR deposit for NEP-145 storage registration
const STORAGE_DEPOSIT_YOCTO = 12500000000000000000000n
const FUNCTION_GAS = 30000000000000n // 30 Tgas

function getPrivateKey(): string {
  // 1. Check explicit environment variable (Vercel standard)
  if (process.env.OPERATOR_PRIVATE_KEY) {
    return process.env.OPERATOR_PRIVATE_KEY.trim()
  }

  // 2. Check local credentials file (local dev fallback)
  try {
    const credPath = path.join(os.homedir(), '.near-credentials', 'testnet', `${OPERATOR_ID}.json`)
    if (fs.existsSync(credPath)) {
      const data = JSON.parse(fs.readFileSync(credPath, 'utf8'))
      return data.private_key || data.secret_key
    }
  } catch {}

  throw new Error(
    `Operator private key not found. Please set OPERATOR_PRIVATE_KEY environment variable.`,
  )
}

export function getProvider(): JsonRpcProvider {
  return new JsonRpcProvider({ url: RPC_URL })
}

export function getOperatorAccount(): Account {
  const provider = getProvider()
  const privateKey = getPrivateKey()
  const keyPair = KeyPair.fromString(privateKey as `ed25519:${string}`)
  const signer = new KeyPairSigner(keyPair)
  return new Account(OPERATOR_ID, provider, signer)
}

/**
 * Check if an account is registered on NEP-145 storage
 */
export async function isStorageRegistered(contractId: string, accountId: string): Promise<boolean> {
  const provider = getProvider()
  try {
    const res: any = await provider.callFunction({
      contractId,
      method: 'storage_balance_of',
      args: { account_id: accountId },
    })
    return Boolean(res && BigInt(res.total || '0') > 0n)
  } catch {
    return false
  }
}

/**
 * Ensure account is registered on NEP-145 storage, depositing 0.0125 NEAR if needed
 */
export async function ensureStorageRegistered(contractId: string, accountId: string): Promise<string | null> {
  const registered = await isStorageRegistered(contractId, accountId)
  if (registered) return null

  console.log(`[Faucet] Registering storage for ${accountId} on ${contractId}...`)
  const account = getOperatorAccount()
  const outcome: any = await account.callFunctionRaw({
    contractId,
    methodName: 'storage_deposit',
    args: { account_id: accountId, registration_only: false },
    deposit: STORAGE_DEPOSIT_YOCTO,
    gas: FUNCTION_GAS,
  })

  const txHash = outcome?.transaction?.hash || outcome?.transaction_outcome?.id || null
  return txHash
}

/**
 * View on-chain token balance for an account
 */
export async function getTokenBalance(contractId: string, accountId: string): Promise<number> {
  const provider = getProvider()
  try {
    const res: any = await provider.callFunction({
      contractId,
      method: 'ft_balance_of',
      args: { account_id: accountId },
    })
    return Number(BigInt(res || '0')) / 1e6
  } catch {
    return 0
  }
}

export interface DispenseResult {
  receiverId: string
  tokens: {
    symbol: string
    contractId: string
    amount: number
    txHash: string
    explorerUrl: string
  }[]
}

/**
 * Dispense testnet stablecoins to a receiver
 */
export async function dispenseTokens(params: {
  receiverId: string
  token: 'USDC' | 'EURE' | 'BOTH'
  amount?: number
}): Promise<DispenseResult> {
  const { receiverId, token } = params
  const defaultAmount = params.amount || 500

  if (!receiverId || !receiverId.endsWith('.testnet')) {
    throw new Error('Invalid account ID: must be a valid NEAR testnet account ending with .testnet')
  }

  const account = getOperatorAccount()
  const results: DispenseResult['tokens'] = []

  const tokensToDispense: Array<{ symbol: string; contractId: string }> = []
  if (token === 'USDC' || token === 'BOTH') {
    tokensToDispense.push({ symbol: 'USDC', contractId: USDC_CONTRACT_ID })
  }
  if (token === 'EURE' || token === 'BOTH') {
    tokensToDispense.push({ symbol: 'EURe', contractId: EURE_CONTRACT_ID })
  }

  for (const t of tokensToDispense) {
    // 1. Ensure storage registration
    await ensureStorageRegistered(t.contractId, receiverId)

    // 2. Mint tokens
    const atomicAmount = (BigInt(defaultAmount) * 1_000_000n).toString()
    console.log(`[Faucet] Minting ${defaultAmount} ${t.symbol} to ${receiverId}...`)

    const outcome: any = await account.callFunctionRaw({
      contractId: t.contractId,
      methodName: 'mint',
      args: {
        account_id: receiverId,
        amount: atomicAmount,
      },
      deposit: 0n,
      gas: FUNCTION_GAS,
    })

    const txHash = outcome?.transaction?.hash || outcome?.transaction_outcome?.id || 'tx_confirmed'
    results.push({
      symbol: t.symbol,
      contractId: t.contractId,
      amount: defaultAmount,
      txHash,
      explorerUrl: `https://testnet.nearblocks.io/txns/${txHash}`,
    })
  }

  return {
    receiverId,
    tokens: results,
  }
}

/**
 * Get faucet system status
 */
export async function getFaucetStatus() {
  const provider = getProvider()
  let operatorNear = 0
  try {
    const state: any = await provider.query({
      request_type: 'view_account',
      finality: 'final',
      account_id: OPERATOR_ID,
    })
    operatorNear = Number(BigInt(state.amount || '0') / 10n**22n) / 100
  } catch {}

  const [usdcSupply, eureSupply] = await Promise.allSettled([
    provider.callFunction({ contractId: USDC_CONTRACT_ID, method: 'ft_total_supply', args: {} }),
    provider.callFunction({ contractId: EURE_CONTRACT_ID, method: 'ft_total_supply', args: {} }),
  ])

  return {
    operatorId: OPERATOR_ID,
    operatorNearBalance: operatorNear,
    usdcContractId: USDC_CONTRACT_ID,
    eureContractId: EURE_CONTRACT_ID,
    usdcTotalSupply: usdcSupply.status === 'fulfilled' ? Number(BigInt(usdcSupply.value as string || '0')) / 1e6 : 0,
    eureTotalSupply: eureSupply.status === 'fulfilled' ? Number(BigInt(eureSupply.value as string || '0')) / 1e6 : 0,
    networkId: NETWORK_ID,
  }
}

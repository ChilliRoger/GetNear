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

// Security Guardrails
export const DISPENSE_AMOUNT_PER_TOKEN = 500
export const MIN_DISPENSE_AMOUNT = 1
export const MAX_DISPENSE_AMOUNT = 500
export const MAX_HOLDING_BALANCE_CAP = 2500

// Dynamic native NEAR stipend computed from NEP-642 upfront gas purchase price (10^9 yocto/gas)
// + Meteor Wallet ref-finance-101.testnet import (0.10 NEAR deposit + 30 Tgas + 300 Tgas = ~0.432 NEAR upfront,
// with ~99% of prepaid gas refunded once executed)
export const REF_CONTRACT_ID = process.env.REF_FINANCE_CONTRACT_ID || 'ref-finance-101.testnet'
export const NEP642_MIN_GAS_PURCHASE_PRICE = 1_000_000_000n // 1 NEAR/Pgas = 0.001 NEAR/Tgas
export const METEOR_REF_STORAGE_DEPOSIT_YOCTO = 10n * 10n ** 22n // 0.10 NEAR
export const METEOR_IMPORT_GAS_BUDGET = 350_000_000_000_000n // 350 Tgas (332 Tgas observed + buffer)
export const METEOR_REGISTER_ONLY_GAS_BUDGET = 320_000_000_000_000n // 320 Tgas (301 Tgas observed + buffer)
export const DEFAULT_TARGET_MIN_NATIVE_YOCTO =
  METEOR_REF_STORAGE_DEPOSIT_YOCTO + METEOR_IMPORT_GAS_BUDGET * NEP642_MIN_GAS_PURCHASE_PRICE // 0.45 NEAR
export const TARGET_MIN_NATIVE_YOCTO = DEFAULT_TARGET_MIN_NATIVE_YOCTO
export const TARGET_MIN_NATIVE_NEAR = 0.45
export const OPERATOR_NEAR_RESERVE_FLOOR_YOCTO = 40n * 10n ** 22n // 0.40 NEAR
export const MIN_SIGNABLE_IMPORT_NEAR = 0.44
export const MIN_SIGNABLE_REGISTER_ONLY_NEAR = 0.31

// 0.00125 NEAR deposit matching on-chain storage_balance_bounds for NEP-145 registration
const STORAGE_DEPOSIT_YOCTO = 125n * 10n ** 19n // 0.00125 NEAR
const FUNCTION_GAS = 30_000_000_000_000n // 30 Tgas

export type NativeNearSkipReason =
  | 'already_funded'
  | 'repeat_wallet'
  | 'ip_drip_cap'
  | 'operator_low_reserve'
  | 'transfer_failed'

export function yoctoToNearNumber(yocto: bigint): number {
  return Number(yocto / 10n ** 18n) / 1e6
}

function assertTestnetNetwork(): void {
  if (NETWORK_ID !== 'testnet') {
    throw new Error(`Unsafe network configuration "${NETWORK_ID}": GetNear faucet is testnet-only.`)
  }
}

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
  assertTestnetNetwork()
  return new JsonRpcProvider({ url: RPC_URL })
}

export function getOperatorAccount(): Account {
  assertTestnetNetwork()
  const provider = getProvider()
  const privateKey = getPrivateKey()
  const keyPair = KeyPair.fromString(privateKey as `ed25519:${string}`)
  const signer = new KeyPairSigner(keyPair)
  return new Account(OPERATOR_ID, provider, signer)
}

export interface AccountStateInfo {
  exists: boolean
  nativeBalanceYocto: bigint
  nativeBalanceNear: number
}

/**
 * Inspect on-chain account existence and native NEAR balance via single RPC call
 */
export async function getAccountState(accountId: string): Promise<AccountStateInfo> {
  const provider = getProvider()
  try {
    const res: any = await provider.query({
      request_type: 'view_account',
      finality: 'final',
      account_id: accountId,
    })
    if (!res || res.amount === undefined) {
      return { exists: false, nativeBalanceYocto: 0n, nativeBalanceNear: 0 }
    }
    const nativeBalanceYocto = BigInt(res.amount)
    return {
      exists: true,
      nativeBalanceYocto,
      nativeBalanceNear: yoctoToNearNumber(nativeBalanceYocto),
    }
  } catch {
    return { exists: false, nativeBalanceYocto: 0n, nativeBalanceNear: 0 }
  }
}

/**
 * Fetch live NEAR Testnet gas price (yoctoNEAR per gas unit). Returns 0n on transient error.
 */
export async function getLiveGasPrice(): Promise<bigint> {
  const provider = getProvider()
  try {
    const res = await provider.viewGasPrice()
    return BigInt(res?.gas_price || '0')
  } catch {
    return 0n
  }
}

/**
 * Compute required upfront native NEAR dynamically using live gas price and NEP-642
 * minimum gas purchase price floor (0.001 NEAR per Tgas).
 */
export function computeTargetMinNativeYocto(params?: {
  liveGasPriceYocto?: bigint
  refStorageAlreadyPaid?: boolean
}): bigint {
  const live = params?.liveGasPriceYocto ?? 0n
  const effectiveGasPrice =
    live > NEP642_MIN_GAS_PURCHASE_PRICE ? live : NEP642_MIN_GAS_PURCHASE_PRICE

  if (params?.refStorageAlreadyPaid) {
    return METEOR_REGISTER_ONLY_GAS_BUDGET * effectiveGasPrice
  }

  return METEOR_REF_STORAGE_DEPOSIT_YOCTO + METEOR_IMPORT_GAS_BUDGET * effectiveGasPrice
}

/**
 * Calculate the conditional native NEAR delta required to reach targetMinYocto.
 * Pure helper so eligibility and reserve guardrails are deterministic and unit-tested.
 */
export function computeNativeNearTopUpDelta(params: {
  recipientBalanceYocto: bigint
  operatorBalanceYocto: bigint
  isFirstTimeWallet: boolean
  ipDripAllowed: boolean
  targetMinYocto?: bigint
}): {
  deltaYocto: bigint
  skippedReason?: Exclude<NativeNearSkipReason, 'transfer_failed'>
} {
  const {
    recipientBalanceYocto,
    operatorBalanceYocto,
    isFirstTimeWallet,
    ipDripAllowed,
    targetMinYocto = DEFAULT_TARGET_MIN_NATIVE_YOCTO,
  } = params

  if (recipientBalanceYocto >= targetMinYocto) {
    return { deltaYocto: 0n, skippedReason: 'already_funded' }
  }

  if (!isFirstTimeWallet) {
    return { deltaYocto: 0n, skippedReason: 'repeat_wallet' }
  }

  if (!ipDripAllowed) {
    return { deltaYocto: 0n, skippedReason: 'ip_drip_cap' }
  }

  const deltaYocto = targetMinYocto - recipientBalanceYocto
  if (operatorBalanceYocto <= OPERATOR_NEAR_RESERVE_FLOOR_YOCTO + deltaYocto) {
    return { deltaYocto: 0n, skippedReason: 'operator_low_reserve' }
  }

  return { deltaYocto }
}

/**
 * Query total NEP-145 storage deposit balance (yoctoNEAR) for an account on any contract.
 */
export async function getStorageTotal(contractId: string, accountId: string): Promise<bigint> {
  const provider = getProvider()
  try {
    const res: any = await provider.callFunction({
      contractId,
      method: 'storage_balance_of',
      args: { account_id: accountId },
    })
    return BigInt(res?.total || '0')
  } catch {
    return 0n
  }
}

/**
 * Check if an account is registered on NEP-145 storage
 */
export async function isStorageRegistered(contractId: string, accountId: string): Promise<boolean> {
  return (await getStorageTotal(contractId, accountId)) > 0n
}

/**
 * Verify whether an account ID actually exists on NEAR testnet
 * Prevents Sybil attacks that drain operator NEAR on storage deposits for fake accounts.
 */
export async function verifyAccountExists(accountId: string): Promise<boolean> {
  const state = await getAccountState(accountId)
  return state.exists
}

/**
 * Ensure account is registered on NEP-145 storage, depositing 0.00125 NEAR if needed
 */
export async function ensureStorageRegistered(
  contractId: string,
  accountId: string,
  knownRegistered?: boolean,
): Promise<string | null> {
  const registered = knownRegistered ?? (await isStorageRegistered(contractId, accountId))
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

export interface NativeNearTopUpInfo {
  toppedUp: boolean
  amountNear: number
  previousBalanceNear: number
  currentBalanceNear: number
  txHash: string | null
  explorerUrl: string | null
  skippedReason?: NativeNearSkipReason
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
  nativeNear: NativeNearTopUpInfo
}

/**
 * Dispense testnet stablecoins (plus conditional native NEAR stipend for zero/low-balance wallets)
 */
export async function dispenseTokens(params: {
  receiverId: string
  token: 'USDC' | 'EURE'
  amount?: number
  ipDripAllowed?: boolean
}): Promise<DispenseResult> {
  assertTestnetNetwork()
  const { receiverId, token } = params
  const rawAmount = Number(params.amount)
  const dispenseAmount = isNaN(rawAmount) ? DISPENSE_AMOUNT_PER_TOKEN : Math.floor(rawAmount)

  if (dispenseAmount < MIN_DISPENSE_AMOUNT || dispenseAmount > MAX_DISPENSE_AMOUNT) {
    throw new Error(`Invalid amount: must be between ${MIN_DISPENSE_AMOUNT} and ${MAX_DISPENSE_AMOUNT} tokens.`)
  }

  if (!receiverId || !receiverId.endsWith('.testnet')) {
    throw new Error('Invalid account ID: must be a valid NEAR testnet account ending with .testnet')
  }

  // 1. Verify recipient account exists and read its live native NEAR balance (Sybil defense)
  const recipientState = await getAccountState(receiverId)
  if (!recipientState.exists) {
    throw new Error(`Account "${receiverId}" does not exist on NEAR testnet. Please activate your testnet wallet first.`)
  }

  const targetToken =
    token === 'EURE'
      ? { symbol: 'EURe', contractId: EURE_CONTRACT_ID }
      : { symbol: 'USDC', contractId: USDC_CONTRACT_ID }

  // 2. Enforce holding cap to prevent serverless race conditions and hoarding
  const currentBal = await getTokenBalance(targetToken.contractId, receiverId)
  if (currentBal >= MAX_HOLDING_BALANCE_CAP) {
    throw new Error(
      `Account ${receiverId} already holds ${currentBal.toLocaleString('en-US')} ${targetToken.symbol}. Maximum faucet holding cap is ${MAX_HOLDING_BALANCE_CAP.toLocaleString('en-US')} tokens.`
    )
  }

  // 3. Verify operator has sufficient NEAR gas reserves
  const operatorState = await getAccountState(OPERATOR_ID)
  if (operatorState.exists && operatorState.nativeBalanceNear < 0.05) {
    throw new Error('Faucet operator NEAR reserves are temporarily low. Please try again shortly.')
  }

  // 4. Inspect on-chain registration state, gas price, and operator token inventory
  const [usdcRegistered, eureRegistered, refStorageTotal, liveGasPriceYocto, operatorTokenBal] =
    await Promise.all([
      isStorageRegistered(USDC_CONTRACT_ID, receiverId),
      isStorageRegistered(EURE_CONTRACT_ID, receiverId),
      getStorageTotal(REF_CONTRACT_ID, receiverId),
      getLiveGasPrice(),
      getTokenBalance(targetToken.contractId, OPERATOR_ID),
    ])
  const isFirstTimeWallet = !usdcRegistered && !eureRegistered
  const targetMinYocto = computeTargetMinNativeYocto({
    liveGasPriceYocto,
    refStorageAlreadyPaid: refStorageTotal >= METEOR_REF_STORAGE_DEPOSIT_YOCTO,
  })

  const nearPlan = computeNativeNearTopUpDelta({
    recipientBalanceYocto: recipientState.nativeBalanceYocto,
    operatorBalanceYocto: operatorState.nativeBalanceYocto,
    isFirstTimeWallet,
    ipDripAllowed: params.ipDripAllowed ?? true,
    targetMinYocto,
  })

  const account = getOperatorAccount()
  const results: DispenseResult['tokens'] = []
  let nativeNear: NativeNearTopUpInfo = {
    toppedUp: false,
    amountNear: 0,
    previousBalanceNear: recipientState.nativeBalanceNear,
    currentBalanceNear: recipientState.nativeBalanceNear,
    txHash: null,
    explorerUrl: null,
    skippedReason: nearPlan.skippedReason,
  }

  // Execute operator transactions strictly sequentially so access-key nonces never collide
  if (nearPlan.deltaYocto > 0n) {
    try {
      const amountNear = yoctoToNearNumber(nearPlan.deltaYocto)
      console.log(`[Faucet] Sponsoring +${amountNear} NEAR gas/import stipend to ${receiverId}...`)
      const transferOutcome: any = await account.transfer({
        receiverId,
        amount: nearPlan.deltaYocto,
      })
      const transferTxHash =
        transferOutcome?.transaction?.hash || transferOutcome?.transaction_outcome?.id || null
      nativeNear = {
        toppedUp: true,
        amountNear,
        previousBalanceNear: recipientState.nativeBalanceNear,
        currentBalanceNear: yoctoToNearNumber(recipientState.nativeBalanceYocto + nearPlan.deltaYocto),
        txHash: transferTxHash,
        explorerUrl: transferTxHash ? `https://testnet.nearblocks.io/txns/${transferTxHash}` : null,
      }
    } catch (err) {
      console.warn(`[Faucet] Non-fatal native NEAR stipend transfer failed for ${receiverId}:`, err)
      nativeNear.skippedReason = 'transfer_failed'
    }
  }

  // Ensure NEP-145 storage registration on target token
  const targetRegistered = token === 'EURE' ? eureRegistered : usdcRegistered
  await ensureStorageRegistered(targetToken.contractId, receiverId, targetRegistered)

  // Replenish operator inventory via mint() only when low, then distribute via ft_transfer
  // (1 yoctoNEAR) so fungible_token.wasm emits a "Transfer ..." log that indexers discover.
  const atomicAmount = (BigInt(dispenseAmount) * 1_000_000n).toString()
  if (operatorTokenBal < dispenseAmount) {
    console.log(`[Faucet] Replenishing operator ${targetToken.symbol} inventory (+${dispenseAmount})...`)
    await account.callFunctionRaw({
      contractId: targetToken.contractId,
      methodName: 'mint',
      args: {
        account_id: OPERATOR_ID,
        amount: atomicAmount,
      },
      deposit: 0n,
      gas: FUNCTION_GAS,
    })
  }

  console.log(`[Faucet] Transferring ${dispenseAmount} ${targetToken.symbol} to ${receiverId}...`)
  const outcome: any = await account.callFunctionRaw({
    contractId: targetToken.contractId,
    methodName: 'ft_transfer',
    args: {
      receiver_id: receiverId,
      amount: atomicAmount,
      memo: 'GetNear Testnet Faucet',
    },
    deposit: 1n,
    gas: FUNCTION_GAS,
  })

  const txHash = outcome?.transaction?.hash || outcome?.transaction_outcome?.id || 'tx_confirmed'
  results.push({
    symbol: targetToken.symbol,
    contractId: targetToken.contractId,
    amount: dispenseAmount,
    txHash,
    explorerUrl: `https://testnet.nearblocks.io/txns/${txHash}`,
  })

  return {
    receiverId,
    tokens: results,
    nativeNear,
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

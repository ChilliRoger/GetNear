/**
 * GetNear — Testnet Automation Runner for near-cli-rs
 * Provides non-interactive, typed execution of transactions on NEAR testnet.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execFileSync } from 'node:child_process'

export function getNearBin(): string {
  const binaryCandidates = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', 'near-cli-rs', 'node_modules', '.bin_real', 'near.exe'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', 'near-cli-rs', 'bin', 'near.exe'),
    'near',
  ]
  for (const bin of binaryCandidates) {
    if (fs.existsSync(bin)) return bin
  }
  return 'near'
}

export function getCredentialPath(accountId: string): string {
  const p = path.join(os.homedir(), '.near-credentials', 'testnet', `${accountId}.json`)
  if (!fs.existsSync(p)) {
    throw new Error(`Credentials file not found for ${accountId} at ${p}`)
  }
  return p
}

export interface TxResult {
  stdout: string
  txHash?: string
  explorerUrl?: string
}

export function extractTxInfo(output: string): { txHash?: string; explorerUrl?: string } {
  // Look for explorer URL: explorer.testnet.near.org or testnet.nearblocks.io
  const urlMatch = output.match(/https:\/\/(?:explorer\.testnet\.near\.org\/transactions|testnet\.nearblocks\.io\/txns)\/([1-9A-HJ-NP-Za-km-z]{40,64})/)
  if (urlMatch) {
    return {
      txHash: urlMatch[1],
      explorerUrl: `https://testnet.nearblocks.io/txns/${urlMatch[1]}`,
    }
  }
  // Look for transaction id pattern
  const txMatch = output.match(/Transaction ID:\s*([1-9A-HJ-NP-Za-km-z]{40,64})/i)
  if (txMatch) {
    return {
      txHash: txMatch[1],
      explorerUrl: `https://testnet.nearblocks.io/txns/${txMatch[1]}`,
    }
  }
  return {}
}

export function runCallFunction(params: {
  contractId: string
  methodName: string
  args: Record<string, unknown>
  deposit: string
  gas: string
  signerId: string
}): TxResult {
  const bin = getNearBin()
  const credPath = getCredentialPath(params.signerId)

  const argsList = [
    'contract',
    'call-function',
    'as-transaction',
    params.contractId,
    params.methodName,
    'json-args',
    JSON.stringify(params.args),
    'prepaid-gas',
    params.gas,
    'attached-deposit',
    params.deposit,
    'sign-as',
    params.signerId,
    'network-config',
    'testnet',
    'sign-with-access-key-file',
    credPath,
    'send',
  ]

  const output = execFileSync(bin, argsList, {
    encoding: 'utf-8',
    shell: false,
    maxBuffer: 10 * 1024 * 1024,
  })

  const { txHash, explorerUrl } = extractTxInfo(output)
  return { stdout: output, txHash, explorerUrl }
}

export function runDeployContract(params: {
  contractAccountId: string
  wasmPath: string
  initMethod?: string
  initArgs?: Record<string, unknown>
  initDeposit?: string
  initGas?: string
  signerId: string
}): TxResult {
  const bin = getNearBin()
  const credPath = getCredentialPath(params.signerId)

  const argsList: string[] = [
    'contract',
    'deploy',
    params.contractAccountId,
    'use-file',
    params.wasmPath,
  ]

  if (params.initMethod && params.initArgs) {
    argsList.push(
      'with-init-call',
      params.initMethod,
      'json-args',
      JSON.stringify(params.initArgs),
      'prepaid-gas',
      params.initGas || '100.0 Tgas',
      'attached-deposit',
      params.initDeposit || '0 NEAR',
    )
  } else {
    argsList.push('without-init-call')
  }

  argsList.push(
    'network-config',
    'testnet',
    'sign-with-access-key-file',
    credPath,
    'send',
  )

  const output = execFileSync(bin, argsList, {
    encoding: 'utf-8',
    shell: false,
    maxBuffer: 10 * 1024 * 1024,
  })

  const { txHash, explorerUrl } = extractTxInfo(output)
  return { stdout: output, txHash, explorerUrl }
}

export function runCreateSubaccount(params: {
  subaccountId: string
  initialBalance: string
  signerId: string
}): TxResult {
  const bin = getNearBin()
  const credPath = getCredentialPath(params.signerId)

  const argsList = [
    'account',
    'create-account',
    'fund-myself',
    params.subaccountId,
    params.initialBalance,
    'autogenerate-new-keypair',
    'save-to-legacy-keychain',
    'sign-as',
    params.signerId,
    'network-config',
    'testnet',
    'sign-with-access-key-file',
    credPath,
    'send',
  ]

  const output = execFileSync(bin, argsList, {
    encoding: 'utf-8',
    shell: false,
    maxBuffer: 10 * 1024 * 1024,
  })

  const { txHash, explorerUrl } = extractTxInfo(output)
  return { stdout: output, txHash, explorerUrl }
}

export function runAddRestrictedKey(params: {
  accountId: string
  contractAccountId: string
  functionNames: string[]
  allowance: string
}): TxResult {
  const bin = getNearBin()
  const credPath = getCredentialPath(params.accountId)

  const argsList = [
    'account',
    'add-key',
    params.accountId,
    'grant-function-call-access',
    '--contract-account-id',
    params.contractAccountId,
    '--function-names',
    params.functionNames.join(','),
    '--allowance',
    params.allowance,
    'autogenerate-new-keypair',
    'save-to-legacy-keychain',
    'network-config',
    'testnet',
    'sign-with-access-key-file',
    credPath,
    'send',
  ]

  const output = execFileSync(bin, argsList, {
    encoding: 'utf-8',
    shell: false,
    maxBuffer: 10 * 1024 * 1024,
  })

  const { txHash, explorerUrl } = extractTxInfo(output)
  return { stdout: output, txHash, explorerUrl }
}

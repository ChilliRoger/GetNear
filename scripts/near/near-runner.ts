/**
 * GetNear — Testnet Automation Runner for near-cli-rs
 * Provides non-interactive, typed execution of transactions on NEAR testnet.
 *
 * Every invocation is bounded by a timeout (NEAR_CLI_TIMEOUT_MS, default 120s) and failures are
 * classified so callers can tell "definitely never broadcast" apart from "outcome unknown".
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { spawnSync } from 'node:child_process'

const DEFAULT_TIMEOUT_MS = 120_000

export function getCliTimeoutMs(): number {
  const raw = Number(process.env.NEAR_CLI_TIMEOUT_MS)
  return Number.isFinite(raw) && raw >= 1_000 ? raw : DEFAULT_TIMEOUT_MS
}

export function getNearBin(): string {
  const custom = process.env.NEAR_CLI_PATH?.trim()
  if (custom && fs.existsSync(custom)) return custom
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

/** NEAR account IDs only: blocks path traversal when an account ID is turned into a credential path. */
const ACCOUNT_ID_RE = /^(?=.{2,64}$)(?:[a-z\d]+[-_])*[a-z\d]+(?:\.(?:[a-z\d]+[-_])*[a-z\d]+)*$/

export function assertValidAccountId(accountId: string): string {
  if (typeof accountId !== 'string' || !ACCOUNT_ID_RE.test(accountId)) {
    throw new Error(`Invalid NEAR account ID: ${JSON.stringify(accountId)}`)
  }
  return accountId
}

export function getCredentialPath(accountId: string, overridePath?: string): string {
  if (overridePath && fs.existsSync(overridePath)) {
    return overridePath
  }
  assertValidAccountId(accountId)
  const p = path.join(os.homedir(), '.near-credentials', 'testnet', `${accountId}.json`)
  if (!fs.existsSync(p)) {
    throw new Error(`Credentials file not found for ${accountId} at ${p}`)
  }
  return p
}

export function findKeyCredentialPath(accountId: string, publicKey: string): string | undefined {
  assertValidAccountId(accountId)
  const normalized = publicKey.replace(':', '_')
  const subPath = path.join(os.homedir(), '.near-credentials', 'testnet', accountId, `${normalized}.json`)
  if (fs.existsSync(subPath)) {
    return subPath
  }
  return undefined
}

export interface TxResult {
  stdout: string
  txHash?: string
  explorerUrl?: string
}

/**
 * How a failed CLI invocation should be interpreted by a caller that must not double-pay.
 *  - not_sent:      the transaction was definitely never broadcast (spawn failure, missing credentials).
 *  - landed_failed: the transaction executed and the contract/runtime rejected it (a chunk record may not exist).
 *  - uncertain:     timeout, transport error or unknown output: the transaction MAY still land.
 */
export type NearCliFailureKind = 'not_sent' | 'landed_failed' | 'uncertain'

export class NearCliError extends Error {
  constructor(
    message: string,
    public readonly kind: NearCliFailureKind,
    public readonly output: string,
    public readonly txHash?: string,
  ) {
    super(message)
    this.name = 'NearCliError'
  }
}

export function classifyCliFailure(output: string, opts?: { timedOut?: boolean; spawnError?: string }): NearCliFailureKind {
  if (opts?.timedOut) return 'uncertain'
  if (opts?.spawnError) return 'not_sent'
  if (/Credentials file not found|Invalid NEAR account ID/i.test(output)) return 'not_sent'
  if (/Smart contract panicked|FunctionCallError|ExecutionError|ActionError|Execution error/i.test(output)) {
    return 'landed_failed'
  }
  return 'uncertain'
}

export function extractTxInfo(output: string): { txHash?: string; explorerUrl?: string } {
  // Robust ANSI escape code stripping
  const clean = output.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')

  // 1. Check for Explorer URL
  const urlMatch = clean.match(/https:\/\/(?:explorer\.testnet\.near\.org\/transactions|testnet\.nearblocks\.io\/txns)\/([1-9A-HJ-NP-Za-km-z]{32,64})/i)
  if (urlMatch) {
    const hash = urlMatch[1].trim()
    return {
      txHash: hash,
      explorerUrl: `https://testnet.nearblocks.io/txns/${hash}`,
    }
  }

  // 2. Check for Transaction ID label
  const txMatch = clean.match(/Transaction ID:\s*([1-9A-HJ-NP-Za-km-z]{32,64})/i)
  if (txMatch) {
    const hash = txMatch[1].trim()
    return {
      txHash: hash,
      explorerUrl: `https://testnet.nearblocks.io/txns/${hash}`,
    }
  }

  return {}
}

/** Run near-cli-rs with a bounded timeout and classified failures. */
function runNear(argsList: string[], timeoutMs: number = getCliTimeoutMs()): TxResult {
  const bin = getNearBin()
  const res = spawnSync(bin, argsList, {
    encoding: 'utf-8',
    shell: false,
    maxBuffer: 10 * 1024 * 1024,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  })

  const output = `${res.stdout || ''}\n${res.stderr || ''}`
  const { txHash, explorerUrl } = extractTxInfo(output)

  const errCode = (res.error as NodeJS.ErrnoException | undefined)?.code
  if (errCode === 'ETIMEDOUT' || (res.error && res.signal)) {
    throw new NearCliError(
      `ETIMEDOUT: near-cli did not finish within ${timeoutMs}ms; transaction outcome unknown`,
      'uncertain',
      output,
      txHash,
    )
  }
  if (res.error) {
    throw new NearCliError(`Failed to spawn near-cli (${errCode ?? res.error.message})`, 'not_sent', output)
  }
  if (res.status !== 0) {
    throw new NearCliError(
      `Command failed with status ${res.status}:\n${output}`,
      classifyCliFailure(output),
      output,
      txHash,
    )
  }
  return { stdout: output, txHash, explorerUrl }
}

export function runCallFunction(params: {
  contractId: string
  methodName: string
  args: Record<string, unknown>
  deposit: string
  gas: string
  signerId: string
  credentialPath?: string
  timeoutMs?: number
}): TxResult {
  let credPath: string
  try {
    credPath = getCredentialPath(params.signerId, params.credentialPath)
  } catch (err) {
    throw new NearCliError(err instanceof Error ? err.message : String(err), 'not_sent', '')
  }

  return runNear(
    [
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
    ],
    params.timeoutMs,
  )
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

  return runNear(argsList)
}

export function runCreateSubaccount(params: {
  subaccountId: string
  initialBalance: string
  signerId: string
}): TxResult {
  const credPath = getCredentialPath(params.signerId)

  return runNear([
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
  ])
}

export function runAddRestrictedKey(params: {
  accountId: string
  contractAccountId: string
  functionNames: string[]
  allowance: string
}): TxResult {
  const credPath = getCredentialPath(params.accountId)

  return runNear([
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
  ])
}

export function runTransferNear(params: {
  receiverId: string
  amount: string
  signerId: string
}): TxResult {
  const credPath = getCredentialPath(params.signerId)

  return runNear([
    'tokens',
    params.signerId,
    'send-near',
    params.receiverId,
    params.amount,
    'network-config',
    'testnet',
    'sign-with-access-key-file',
    credPath,
    'send',
  ])
}

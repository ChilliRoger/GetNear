import { NextRequest, NextResponse } from 'next/server'
import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { authorizeSignerRequest, checkDemoAccess, getDemoContext } from '../../../../lib/demo-guard'

export const dynamic = 'force-dynamic'

/**
 * Optional server-side DEMO signer (team roles only). Disabled by default.
 *
 * Enable with GETNEAR_DEMO_SIGNER=1 + GETNEAR_DEMO_TOKEN. Requests must carry `Authorization: Bearer <token>`,
 * come from the same origin, and match an exact allow-listed (signer, contract, method, deposit) combination.
 * Ordinary users sign with their own wallet; this route is never reachable without explicit opt-in.
 */

function getNearBin(): string {
  const custom = process.env.NEAR_CLI_PATH
  if (custom && fs.existsSync(custom)) return custom
  const npmReal = path.join(
    os.homedir(),
    'AppData',
    'Roaming',
    'npm',
    'node_modules',
    'near-cli-rs',
    'node_modules',
    '.bin_real',
    'near.exe',
  )
  if (fs.existsSync(npmReal)) return npmReal
  return 'near'
}

function getCredentialPath(accountId: string): string {
  // accountId has already been matched against the allow-listed demo roles (no path separators possible).
  const p = path.join(os.homedir(), '.near-credentials', 'testnet', `${accountId}.json`)
  if (!fs.existsSync(p)) {
    throw new Error(`Credentials file not found for ${accountId} at ${p}`)
  }
  return p
}

function extractTxInfo(output: string): { txHash?: string; explorerUrl?: string } {
  const clean = output.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')

  const urlMatch = clean.match(
    /https:\/\/(?:explorer\.testnet\.near\.org\/transactions|testnet\.nearblocks\.io\/txns)\/([1-9A-HJ-NP-Za-km-z]{32,64})/i,
  )
  if (urlMatch) {
    const hash = urlMatch[1].trim()
    return {
      txHash: hash,
      explorerUrl: `https://testnet.nearblocks.io/txns/${hash}`,
    }
  }

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

export async function POST(req: NextRequest) {
  // 1. Opt-in, content-type, same-origin and bearer-token checks happen BEFORE the body is parsed.
  const access = checkDemoAccess(req)
  if (!access.ok) {
    return NextResponse.json({ error: access.error, success: false }, { status: access.status })
  }

  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', success: false }, { status: 400 })
    }

    // 2. Exact allow-list of (signer, contract, method, deposit) combinations.
    const auth = authorizeSignerRequest((body ?? {}) as Record<string, unknown>, getDemoContext())
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error, success: false }, { status: auth.status })
    }

    console.log(`[API /near/tx] Demo signer: ${auth.signerId} -> ${auth.contractId}.${auth.methodName}()`)

    const bin = getNearBin()
    const credPath = getCredentialPath(auth.signerId)

    const argsList = [
      'contract',
      'call-function',
      'as-transaction',
      auth.contractId,
      auth.methodName,
      'json-args',
      JSON.stringify(auth.args),
      'prepaid-gas',
      auth.gas,
      'attached-deposit',
      auth.deposit,
      'sign-as',
      auth.signerId,
      'network-config',
      'testnet',
      'sign-with-access-key-file',
      credPath,
      'send',
    ]

    const res = spawnSync(bin, argsList, {
      encoding: 'utf-8',
      shell: false,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    })

    const combinedOutput = `${res.stdout || ''}\n${res.stderr || ''}`
    if (res.error || res.status !== 0) {
      throw new Error(`NEAR CLI command failed (exit code ${res.status}):\n${combinedOutput}`)
    }

    const { txHash, explorerUrl } = extractTxInfo(combinedOutput)

    return NextResponse.json({
      success: true,
      txHash: txHash || 'tx_pending',
      explorerUrl: explorerUrl || `https://testnet.nearblocks.io/address/${auth.contractId}`,
    })
  } catch (err: unknown) {
    let errMsg = err instanceof Error ? err.message : String(err)
    if (errMsg.includes('ERR_PERMISSION_DENIED')) {
      errMsg = `Permission Denied: Sputnik DAO rejected this vote because the signer is not a Council member. Switch to Council 1, 2, or 3.`
    }
    console.error('[API /near/tx Error]:', errMsg)
    return NextResponse.json(
      { error: errMsg, success: false },
      { status: 500 },
    )
  }
}

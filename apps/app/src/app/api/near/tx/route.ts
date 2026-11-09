import { NextRequest, NextResponse } from 'next/server'
import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'

export const dynamic = 'force-dynamic'

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
  try {
    const body = await req.json()
    const { contractId, methodName, args, signerId, deposit, gas } = body

    if (!contractId || !methodName || !signerId) {
      return NextResponse.json(
        { error: 'Missing required parameters: contractId, methodName, or signerId' },
        { status: 400 },
      )
    }

    // Pre-flight check for Sputnik DAO proposal voting permissions
    if (contractId.includes('sputnik') && methodName === 'act_proposal' && !signerId.includes('council')) {
      return NextResponse.json(
        {
          error: `Permission Denied: Account "${signerId}" is not a Council member. Only Council members (chilliroger-council1.testnet, chilliroger-council2.testnet, chilliroger-council3.testnet) have voting permissions on this DAO.`,
          success: false,
        },
        { status: 403 },
      )
    }

    console.log(`[API /near/tx] Calling ${signerId} -> ${contractId}.${methodName}()`)

    const bin = getNearBin()
    const credPath = getCredentialPath(signerId)

    const argsList = [
      'contract',
      'call-function',
      'as-transaction',
      contractId,
      methodName,
      'json-args',
      JSON.stringify(args || {}),
      'prepaid-gas',
      gas || '100.0 Tgas',
      'attached-deposit',
      deposit || '0 NEAR',
      'sign-as',
      signerId,
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
    })

    const combinedOutput = `${res.stdout || ''}\n${res.stderr || ''}`
    if (res.status !== 0) {
      throw new Error(`NEAR CLI command failed (exit code ${res.status}):\n${combinedOutput}`)
    }

    const { txHash, explorerUrl } = extractTxInfo(combinedOutput)

    return NextResponse.json({
      success: true,
      txHash: txHash || 'tx_pending',
      explorerUrl: explorerUrl || `https://testnet.nearblocks.io/address/${contractId}`,
      stdout: combinedOutput,
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

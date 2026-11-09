import { NextRequest, NextResponse } from 'next/server'
import { spawnSync } from 'node:child_process'
import * as path from 'node:path'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const receiverId = body.accountId?.trim()
    const amount = Number(body.amount) || 500

    if (!receiverId || !receiverId.includes('.')) {
      return NextResponse.json(
        { error: 'Invalid NEAR testnet account ID (must end with .testnet)' },
        { status: 400 },
      )
    }

    const repoRoot = path.resolve(process.cwd(), '../..')
    const scriptPath = path.resolve(repoRoot, 'scripts/near/faucet-tokens.ts')

    console.log(`[API /faucet] Dispensing ${amount} USDC to ${receiverId}...`)

    const res = spawnSync('pnpm', ['tsx', scriptPath, receiverId, String(amount)], {
      cwd: repoRoot,
      encoding: 'utf-8',
      shell: process.platform === 'win32',
      maxBuffer: 10 * 1024 * 1024,
    })

    const output = `${res.stdout || ''}\n${res.stderr || ''}`

    if (res.status !== 0) {
      console.error(`[API /faucet Error]:`, output)
      return NextResponse.json(
        { error: 'Faucet claim transaction failed', details: output },
        { status: 500 },
      )
    }

    const txMatch = output.match(/Tx:\s*([1-9A-HJ-NP-Za-km-z]{32,64})/i)
    const txHash = txMatch ? txMatch[1] : undefined

    return NextResponse.json({
      success: true,
      receiverId,
      amount,
      txHash,
      explorerUrl: txHash ? `https://testnet.nearblocks.io/txns/${txHash}` : undefined,
    })
  } catch (err: unknown) {
    console.error(`[API /faucet Exception]:`, err)
    const errorMsg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}


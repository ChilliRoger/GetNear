import { NextRequest, NextResponse } from 'next/server'
import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import { buildFaucetCommand, checkDemoAccess, validateFaucetRequest } from '../../../lib/demo-guard'

export const dynamic = 'force-dynamic'

/**
 * Demo-token faucet (mints the team's demo USDC, NOT Circle testnet USDC).
 * Same access boundary as the demo signer (opt-in + bearer token + same origin) because it spends
 * the operator account. No shell is ever used: the account ID and amount are validated first and then
 * passed as separate argv entries to Node.
 */
export async function POST(req: NextRequest) {
  const access = checkDemoAccess(req)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = validateFaucetRequest(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    }
    const { accountId: receiverId, amount } = parsed

    const repoRoot = path.resolve(process.cwd(), '../..')
    const scriptPath = path.resolve(repoRoot, 'scripts/near/faucet-tokens.ts')
    const cmd = buildFaucetCommand(repoRoot, scriptPath, receiverId, amount)

    console.log(`[API /faucet] Dispensing ${amount} demo USDC to ${receiverId}...`)

    const res = spawnSync(cmd.command, cmd.args, cmd.options)
    const output = `${res.stdout || ''}\n${res.stderr || ''}`

    if (res.error || res.status !== 0) {
      console.error(`[API /faucet Error]:`, output)
      return NextResponse.json({ error: 'Faucet claim transaction failed' }, { status: 500 })
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

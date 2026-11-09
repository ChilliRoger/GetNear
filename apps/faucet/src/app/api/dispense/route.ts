import { NextRequest, NextResponse } from 'next/server'
import { dispenseTokens, getTokenBalance, USDC_CONTRACT_ID, EURE_CONTRACT_ID } from '@/lib/near'
import { checkRateLimit, recordClaim } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const NEAR_ACCOUNT_REGEX = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const accountId = body.accountId?.trim().toLowerCase()
    const token = (body.token || 'BOTH').toUpperCase()
    const amount = Number(body.amount) || 500

    // 1. Validate Account ID format
    if (!accountId || !accountId.endsWith('.testnet')) {
      return NextResponse.json(
        { error: 'Invalid NEAR account ID: must end with .testnet' },
        { status: 400 },
      )
    }

    if (accountId.length < 2 || accountId.length > 64 || !NEAR_ACCOUNT_REGEX.test(accountId)) {
      return NextResponse.json(
        { error: 'Invalid NEAR account ID syntax. Alphanumeric, lowercase, hyphen, and period only.' },
        { status: 400 },
      )
    }

    // 2. Validate token choice
    if (!['USDC', 'EURE', 'BOTH'].includes(token)) {
      return NextResponse.json(
        { error: 'Invalid token choice. Select USDC, EURE, or BOTH.' },
        { status: 400 },
      )
    }

    // 3. Extract client IP
    const forwarded = req.headers.get('x-forwarded-for')
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1'

    // 4. Check Rate Limit
    const rateCheck = checkRateLimit(accountId, clientIp)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.reason, remainingSeconds: rateCheck.remainingSeconds },
        { status: 429 },
      )
    }

    // 5. Dispense tokens on NEAR Testnet
    console.log(`[API /dispense] Dispensing ${amount} ${token} to ${accountId}...`)
    const result = await dispenseTokens({
      receiverId: accountId,
      token: token as 'USDC' | 'EURE' | 'BOTH',
      amount,
    })

    // 6. Record claim for rate limiting
    recordClaim(accountId, clientIp)

    // 7. Fetch updated balances
    const [usdcBal, eureBal] = await Promise.all([
      getTokenBalance(USDC_CONTRACT_ID, accountId),
      getTokenBalance(EURE_CONTRACT_ID, accountId),
    ])

    return NextResponse.json({
      success: true,
      receiverId: accountId,
      dispensed: result.tokens,
      balances: {
        usdc: usdcBal,
        eure: eureBal,
      },
    })
  } catch (err: unknown) {
    console.error('[API /dispense Exception]:', err)
    const msg = err instanceof Error ? err.message : 'Failed to dispense tokens'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

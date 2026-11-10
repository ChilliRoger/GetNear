import { NextRequest, NextResponse } from 'next/server'
import { dispenseTokens, getTokenBalance, USDC_CONTRACT_ID, EURE_CONTRACT_ID } from '@/lib/near'
import { checkRateLimit, recordClaim } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const NEAR_ACCOUNT_REGEX = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const accountId = body.accountId?.trim().toLowerCase()
    const token = (body.token || 'USDC').toUpperCase()
    
    // User-specified amount (between 1 and 500)
    const rawAmount = Number(body.amount)
    const amount = isNaN(rawAmount) ? 500 : Math.floor(rawAmount)

    if (amount < 1 || amount > 500) {
      return NextResponse.json(
        { error: 'Invalid amount. You can request between 1 and 500 tokens per claim.' },
        { status: 400 },
      )
    }

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

    // 2. Validate token choice (USDC or EURE only)
    if (!['USDC', 'EURE'].includes(token)) {
      return NextResponse.json(
        { error: 'Invalid token choice. Select either USDC or EURE.' },
        { status: 400 },
      )
    }

    // 3. Extract client IP (support Vercel x-real-ip and proxy chains)
    const clientIp =
      req.headers.get('x-real-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      '127.0.0.1'

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
      token: token as 'USDC' | 'EURE',
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
    const isClientError =
      msg.includes('does not exist') ||
      msg.includes('holding cap') ||
      msg.includes('Invalid') ||
      msg.includes('temporarily low')
    return NextResponse.json({ error: msg }, { status: isClientError ? 400 : 500 })
  }
}

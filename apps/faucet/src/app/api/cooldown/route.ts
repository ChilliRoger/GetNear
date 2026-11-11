import { NextRequest, NextResponse } from 'next/server'
import { checkAccountCooldown } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('accountId')?.trim().toLowerCase()

    if (!accountId) {
      return NextResponse.json(
        { error: 'Missing accountId query parameter' },
        { status: 400 },
      )
    }

    // Cooldown inspection strictly checks if this user account ID is on 24h cooldown
    const rateCheck = checkAccountCooldown(accountId)

    return NextResponse.json({
      success: true,
      accountId,
      allowed: rateCheck.allowed,
      remainingSeconds: rateCheck.remainingSeconds,
      reason: rateCheck.reason || null,
    })
  } catch (err: unknown) {
    console.error('[API /cooldown Exception]:', err)
    return NextResponse.json({ error: 'Failed to check cooldown' }, { status: 500 })
  }
}


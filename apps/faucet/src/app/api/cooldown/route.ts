import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

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

    // Extract client IP
    const clientIp =
      req.headers.get('x-real-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      '127.0.0.1'

    const rateCheck = checkRateLimit(accountId, clientIp)

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


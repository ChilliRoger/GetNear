import { NextResponse } from 'next/server'
import { getFaucetStatus } from '@/lib/near'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const status = await getFaucetStatus()
    return NextResponse.json({
      success: true,
      status,
      timestamp: Date.now(),
    })
  } catch (err: unknown) {
    console.error('[API /status Exception]:', err)
    const msg = err instanceof Error ? err.message : 'Failed to fetch status'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

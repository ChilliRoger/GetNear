import { NextRequest, NextResponse } from 'next/server'
import { checkDemoAccess } from '../../../../lib/demo-guard'

export const dynamic = 'force-dynamic'

/**
 * Dashboard proxy for the agent's manual trigger. It enforces the SAME access boundary as the agent
 * itself (opt-in + bearer token + same origin) and forwards with the server-side AGENT_TRIGGER_TOKEN.
 * There is no fallback that spawns a local process: if the agent daemon is not reachable the request fails.
 */
export async function POST(req: NextRequest) {
  const access = checkDemoAccess(req)
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status })
  }

  const agentToken = (process.env.AGENT_TRIGGER_TOKEN ?? '').trim()
  if (!agentToken) {
    return NextResponse.json(
      { success: false, error: 'AGENT_TRIGGER_TOKEN is not configured for the dashboard server.' },
      { status: 503 },
    )
  }

  const agentUrl = (process.env.AGENT_TRIGGER_URL || 'http://127.0.0.1:38175').replace(/\/+$/, '')
  try {
    const res = await fetch(`${agentUrl}/trigger`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${agentToken}` },
      signal: AbortSignal.timeout(60_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: (data as { error?: string }).error || `Agent returned HTTP ${res.status}` },
        { status: res.status === 401 ? 502 : res.status },
      )
    }
    return NextResponse.json({ ...data, source: 'agent_daemon' })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { success: false, error: `Agent daemon unreachable at ${agentUrl}: ${errMsg}. Start it with \`pnpm agent:start\`.` },
      { status: 502 },
    )
  }
}

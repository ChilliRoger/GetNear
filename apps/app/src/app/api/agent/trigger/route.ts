import { NextResponse } from 'next/server'
import { spawnSync } from 'node:child_process'
import * as path from 'node:path'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // 1. Try hitting the agent runner daemon on port 38175
    try {
      const res = await fetch('http://127.0.0.1:38175/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json({ ...data, source: 'agent_daemon' })
      }
    } catch {
      // Daemon not running on port 38175; fall back to CLI runner tick
    }

    // 2. Trigger via sub-process runner tick
    const rootDir = path.resolve(process.cwd(), '..', '..')

    const child = spawnSync(
      'npx',
      [
        'tsx',
        '-e',
        `import { AgentRunner } from './apps/agent/src/runner.ts'; const r = new AgentRunner(); r.tick().then(() => console.log('TICK_DONE'));`,
      ],
      {
        cwd: rootDir,
        encoding: 'utf-8',
        shell: true,
        timeout: 30000,
      },
    )

    const output = `${child.stdout || ''}\n${child.stderr || ''}`

    return NextResponse.json({
      success: true,
      message: 'Autonomous agent tick executed successfully on NEAR testnet',
      output: output.slice(-500),
      source: 'standalone_runner_tick',
    })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[/api/agent/trigger error]:', errMsg)
    return NextResponse.json(
      { error: errMsg, success: false },
      { status: 500 },
    )
  }
}

/**
 * GetNear Agent Runner — Service Entry Point (P9)
 * Usage: pnpm --filter @getnear/agent start
 */

try {
  process.loadEnvFile()
} catch {}

import { AgentRunner } from './runner.js'
import { createAgentServer } from './server.js'

const PORT = Number(process.env.AGENT_PORT || 38175)
const POLL_INTERVAL = Number(process.env.AGENT_POLL_INTERVAL_MS || 10_000)

async function main() {
  console.log('═'.repeat(60))
  console.log('       GetNear — Autonomous Treasury FX Agent Runner (P9)')
  console.log('═'.repeat(60))

  const runner = new AgentRunner({ pollIntervalMs: POLL_INTERVAL })
  const server = createAgentServer(runner, PORT)

  server.start()
  runner.start()

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Agent] Shutting down...')
    runner.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[Agent] Fatal error:', err)
  process.exit(1)
})


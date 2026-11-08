/**
 * GetNear Agent Runner — HTTP Metrics & Observability Server (P9)
 * Exposes status, recent fills, strategy decisions, and manual trigger endpoints.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { getRecentFills, getRecentDecisions } from './db.js'
import type { AgentRunner } from './runner.js'

export function createAgentServer(runner: AgentRunner, port = 38175) {
  const app = new Hono()

  app.use('*', cors({ origin: '*' }))

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      service: 'getnear-agent',
      uptime: process.uptime(),
      timestamp: Date.now(),
    })
  })

  app.get('/status', (c) => {
    return c.json({
      ...runner.getStatus(),
      timestamp: Date.now(),
    })
  })

  app.get('/fills', (c) => {
    const limit = Number(c.req.query('limit') || 50)
    const fills = getRecentFills(limit)
    return c.json({
      total: fills.length,
      fills,
    })
  })

  app.get('/decisions', (c) => {
    const limit = Number(c.req.query('limit') || 100)
    const decisions = getRecentDecisions(limit)
    return c.json({
      total: decisions.length,
      decisions,
    })
  })

  app.post('/trigger', async (c) => {
    await runner.tick()
    return c.json({
      success: true,
      message: 'Agent tick triggered',
      status: runner.getStatus(),
    })
  })

  return {
    app,
    start: () => {
      console.log(`[Agent Server] Listening on http://localhost:${port}`)
      return serve({ fetch: app.fetch, port })
    },
  }
}


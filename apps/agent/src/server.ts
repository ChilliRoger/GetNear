/**
 * GetNear Agent Runner — HTTP Metrics & Observability Server (P9)
 * Exposes status, recent fills, strategy decisions, and an authenticated manual trigger.
 *
 * Access model:
 *  - Binds to loopback (127.0.0.1) by default. A non-loopback AGENT_HOST requires AGENT_ALLOW_REMOTE=1.
 *  - Read-only routes (/health, /status, /fills, /decisions) are unauthenticated but loopback-only by default.
 *  - State-changing routes (POST /trigger) require `Authorization: Bearer $AGENT_TRIGGER_TOKEN`.
 *    If no token is configured the trigger is DISABLED (503), never open.
 *  - CORS is closed unless AGENT_CORS_ORIGINS lists explicit origins.
 */

import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { getRecentFills, getRecentDecisions } from './db.js'
import type { AgentRunner } from './runner.js'

export interface AgentServerOptions {
  port?: number
  host?: string
  /** Bearer token for state-changing routes. Defaults to process.env.AGENT_TRIGGER_TOKEN. */
  triggerToken?: string
  /** Explicit browser origins allowed by CORS. Defaults to process.env.AGENT_CORS_ORIGINS (comma separated). */
  corsOrigins?: string[]
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])
export const MIN_TRIGGER_TOKEN_LENGTH = 16

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase())
}

/** Resolve the listen host: loopback unless the operator explicitly opted into a remote bind. */
export function resolveBindHost(env: NodeJS.ProcessEnv = process.env, requested?: string): string {
  const host = (requested ?? env.AGENT_HOST ?? '127.0.0.1').trim() || '127.0.0.1'
  if (!isLoopbackHost(host) && env.AGENT_ALLOW_REMOTE !== '1') {
    throw new Error(
      `Refusing to bind the agent API to non-loopback host "${host}". Set AGENT_ALLOW_REMOTE=1 and a strong AGENT_TRIGGER_TOKEN to override.`,
    )
  }
  return host
}

export function tokensMatch(provided: string | undefined | null, expected: string): boolean {
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function createAgentServer(runner: AgentRunner, portOrOptions: number | AgentServerOptions = 38175) {
  const options: AgentServerOptions =
    typeof portOrOptions === 'number' ? { port: portOrOptions } : portOrOptions
  const port = options.port ?? 38175
  const triggerToken = (options.triggerToken ?? process.env.AGENT_TRIGGER_TOKEN ?? '').trim()
  const corsOrigins = (
    options.corsOrigins ??
    (process.env.AGENT_CORS_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  ).filter((o) => o !== '*')

  const app = new Hono()

  app.use(
    '*',
    cors({
      origin: (origin) => (origin && corsOrigins.includes(origin) ? origin : ''),
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
    }),
  )

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
    const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') || 50) || 50))
    const fills = getRecentFills(limit)
    return c.json({
      total: fills.length,
      fills,
    })
  })

  app.get('/decisions', (c) => {
    const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') || 100) || 100))
    const decisions = getRecentDecisions(limit)
    return c.json({
      total: decisions.length,
      decisions,
    })
  })

  app.post('/trigger', async (c) => {
    if (triggerToken.length < MIN_TRIGGER_TOKEN_LENGTH) {
      return c.json(
        {
          success: false,
          error: `Manual trigger is disabled: set AGENT_TRIGGER_TOKEN (at least ${MIN_TRIGGER_TOKEN_LENGTH} characters).`,
        },
        503,
      )
    }
    const header = c.req.header('authorization') ?? ''
    const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
    if (!tokensMatch(provided, triggerToken)) {
      return c.json({ success: false, error: 'Unauthorized' }, 401)
    }

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
      const host = resolveBindHost(process.env, options.host)
      console.log(`[Agent Server] Listening on http://${host}:${port}`)
      return serve({ fetch: app.fetch, port, hostname: host })
    },
  }
}

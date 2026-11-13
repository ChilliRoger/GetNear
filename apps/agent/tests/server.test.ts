/**
 * Agent HTTP server access-boundary tests: loopback bind by default, authenticated trigger, closed CORS.
 */

import { test, describe, after } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'getnear-agent-server-'))
process.env.GETNEAR_AGENT_DB_PATH = path.join(tempDir, 'server.db')

const { createAgentServer, resolveBindHost, tokensMatch } = await import('../src/server.js')
const db = await import('../src/db.js')

after(() => {
  try {
    db.db.close()
  } catch {}
  try {
    fs.rmSync(tempDir, { recursive: true, force: true })
  } catch {}
})

function stubRunner() {
  const calls = { tick: 0 }
  const runner = {
    tick: async () => {
      calls.tick++
    },
    getStatus: () => ({ stub: true }),
  } as any
  return { runner, calls }
}

const TOKEN = 'test-token-0123456789abcdef'

describe('bind host', () => {
  test('defaults to loopback', () => {
    assert.equal(resolveBindHost({} as any), '127.0.0.1')
  })
  test('refuses a non-loopback host without explicit opt-in', () => {
    assert.throws(() => resolveBindHost({ AGENT_HOST: '0.0.0.0' } as any), /Refusing to bind/)
    assert.throws(() => resolveBindHost({} as any, '192.168.1.10'), /Refusing to bind/)
  })
  test('allows a remote bind only with AGENT_ALLOW_REMOTE=1', () => {
    assert.equal(resolveBindHost({ AGENT_HOST: '0.0.0.0', AGENT_ALLOW_REMOTE: '1' } as any), '0.0.0.0')
  })
})

describe('POST /trigger authentication', () => {
  test('is disabled (503) when no token is configured', async () => {
    const { runner, calls } = stubRunner()
    const { app } = createAgentServer(runner, { triggerToken: '' })
    const res = await app.request('/trigger', { method: 'POST' })
    assert.equal(res.status, 503)
    assert.equal(calls.tick, 0)
  })

  test('rejects missing and wrong tokens (401) without ticking', async () => {
    const { runner, calls } = stubRunner()
    const { app } = createAgentServer(runner, { triggerToken: TOKEN })
    assert.equal((await app.request('/trigger', { method: 'POST' })).status, 401)
    assert.equal(
      (await app.request('/trigger', { method: 'POST', headers: { Authorization: 'Bearer wrong-token-0123456789' } })).status,
      401,
    )
    assert.equal((await app.request('/trigger', { method: 'POST', headers: { Authorization: TOKEN } })).status, 401)
    assert.equal(calls.tick, 0)
  })

  test('accepts the configured bearer token', async () => {
    const { runner, calls } = stubRunner()
    const { app } = createAgentServer(runner, { triggerToken: TOKEN })
    const res = await app.request('/trigger', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } })
    assert.equal(res.status, 200)
    assert.equal(calls.tick, 1)
  })

  test('refuses a too-short configured token', async () => {
    const { runner } = stubRunner()
    const { app } = createAgentServer(runner, { triggerToken: 'short' })
    assert.equal((await app.request('/trigger', { method: 'POST', headers: { Authorization: 'Bearer short' } })).status, 503)
  })

  test('tokensMatch is length-safe', () => {
    assert.equal(tokensMatch('a', 'abc'), false)
    assert.equal(tokensMatch('', 'abc'), false)
    assert.equal(tokensMatch('abc', 'abc'), true)
  })
})

describe('CORS', () => {
  test('does not allow arbitrary origins (no wildcard)', async () => {
    const { runner } = stubRunner()
    const { app } = createAgentServer(runner, { triggerToken: TOKEN })
    const res = await app.request('/health', { headers: { Origin: 'https://evil.example' } })
    assert.notEqual(res.headers.get('access-control-allow-origin'), '*')
    assert.notEqual(res.headers.get('access-control-allow-origin'), 'https://evil.example')
  })

  test('allows only explicitly configured origins; a wildcard entry is ignored', async () => {
    const { runner } = stubRunner()
    const { app } = createAgentServer(runner, { triggerToken: TOKEN, corsOrigins: ['http://localhost:3100', '*'] })
    const ok = await app.request('/health', { headers: { Origin: 'http://localhost:3100' } })
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:3100')
    const bad = await app.request('/health', { headers: { Origin: 'https://evil.example' } })
    assert.ok(!bad.headers.get('access-control-allow-origin'))
  })
})

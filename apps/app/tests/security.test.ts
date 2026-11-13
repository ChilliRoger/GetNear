/**
 * Dashboard server-side access-boundary tests.
 *  - the demo signer is disabled by default
 *  - unauthenticated, cross-origin, wrong-content-type and out-of-scope requests are rejected
 *  - the faucet validates input and never uses a shell
 * Route-level tests only exercise REJECTION paths, so nothing is ever signed or spawned.
 */

import { test, describe, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import {
  authorizeSignerRequest,
  buildFaucetCommand,
  checkDemoAccess,
  getDemoContext,
  parseDeposit,
  validateFaucetRequest,
  MAX_FAUCET_AMOUNT,
} from '../src/lib/demo-guard'
import { POST as signerPost } from '../src/app/api/near/tx/route'
import { POST as faucetPost } from '../src/app/api/faucet/route'
import { POST as triggerPost } from '../src/app/api/agent/trigger/route'

const TOKEN = 'demo-token-0123456789abcdef'
const BASE = 'http://localhost:3100'
const ctx = getDemoContext({})

function req(url: string, init: { headers?: Record<string, string>; body?: unknown; method?: string; raw?: string } = {}) {
  return new NextRequest(`${BASE}${url}`, {
    method: init.method ?? 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
  })
}

const auth = { authorization: `Bearer ${TOKEN}` }

function enableDemo() {
  process.env.GETNEAR_DEMO_SIGNER = '1'
  process.env.GETNEAR_DEMO_TOKEN = TOKEN
  process.env.AGENT_TRIGGER_TOKEN = 'agent-token-0123456789abcdef'
}

beforeEach(() => {
  delete process.env.GETNEAR_DEMO_SIGNER
  delete process.env.GETNEAR_DEMO_TOKEN
  delete process.env.GETNEAR_ALLOWED_ORIGINS
  delete process.env.AGENT_TRIGGER_TOKEN
})

describe('demo signer is disabled by default', () => {
  test('every server-side signing/payout route refuses with 403 when not opted in', async () => {
    const body = { contractId: ctx.fxBudget, methodName: 'create_order', signerId: ctx.operator, args: {} }
    assert.equal((await signerPost(req('/api/near/tx', { headers: auth, body }))).status, 403)
    assert.equal((await faucetPost(req('/api/faucet', { headers: auth, body: { accountId: 'a-user.testnet' } }))).status, 403)
    assert.equal((await triggerPost(req('/api/agent/trigger', { headers: auth }))).status, 403)
  })

  test('enabled without a configured token is a configuration error (503), never open', () => {
    process.env.GETNEAR_DEMO_SIGNER = '1'
    const r = checkDemoAccess(req('/api/near/tx', { headers: auth }))
    assert.deepEqual(r, { ok: false, status: 503, error: r.ok ? '' : r.error })
  })
})

describe('checkDemoAccess (opted in)', () => {
  beforeEach(enableDemo)

  test('rejects unauthenticated requests (401)', () => {
    assert.equal((checkDemoAccess(req('/x')) as any).status, 401)
    assert.equal((checkDemoAccess(req('/x', { headers: { authorization: 'Bearer nope-nope-nope-nope' } })) as any).status, 401)
    assert.equal((checkDemoAccess(req('/x', { headers: { authorization: TOKEN } })) as any).status, 401)
  })

  test('rejects a text/plain body (blocks cross-site simple-request CSRF) with 415', () => {
    const r = checkDemoAccess(req('/x', { headers: { ...auth, 'content-type': 'text/plain' } })) as any
    assert.equal(r.status, 415)
  })

  test('rejects cross-origin requests and cross-site fetch metadata (403) even with a valid token', () => {
    assert.equal((checkDemoAccess(req('/x', { headers: { ...auth, origin: 'https://evil.example' } })) as any).status, 403)
    assert.equal((checkDemoAccess(req('/x', { headers: { ...auth, 'sec-fetch-site': 'cross-site' } })) as any).status, 403)
  })

  test('accepts a same-origin request with the bearer token', () => {
    assert.deepEqual(checkDemoAccess(req('/x', { headers: { ...auth, origin: BASE, 'sec-fetch-site': 'same-origin' } })), { ok: true })
  })

  test('rejects non-POST methods', () => {
    assert.equal((checkDemoAccess(req('/x', { method: 'GET', headers: auth })) as any).status, 405)
  })
})

describe('signer allow-list (exact signer / contract / method / deposit)', () => {
  const council = ctx.councils[0]

  test('allows the exact combinations the dashboard uses', () => {
    const cases = [
      { signerId: ctx.operator, contractId: ctx.fxBudget, methodName: 'create_order', deposit: '0 NEAR', args: { pair_label: 'USDC/EURe' } },
      { signerId: ctx.operator, contractId: ctx.fxBudget, methodName: 'refund_unused_escrow', deposit: '0 NEAR', args: { id: 12 } },
      { signerId: ctx.operator, contractId: ctx.circleUsdc, methodName: 'ft_transfer_call', deposit: '1 yoctoNEAR', gas: '120.0 Tgas', args: { receiver_id: ctx.fxBudget, amount: '15000000', msg: '{}' } },
      {
        signerId: ctx.operator,
        contractId: ctx.dao,
        methodName: 'add_proposal',
        deposit: '0.1 NEAR',
        args: { proposal: { description: 'x', kind: { FunctionCall: { receiver_id: ctx.fxBudget, actions: [{ method_name: 'approve_order', args: 'e30=', deposit: '0', gas: '30000000000000' }] } } } },
      },
      { signerId: council, contractId: ctx.dao, methodName: 'act_proposal', deposit: '0 NEAR', args: { id: 3, action: 'VoteApprove' } },
    ]
    for (const c of cases) {
      const r = authorizeSignerRequest(c, ctx)
      assert.equal(r.ok, true, `${c.signerId} -> ${c.contractId}.${c.methodName}: ${(r as any).error ?? ''}`)
    }
  })

  test('normalizes deposit and gas to the exact formats near-cli expects', () => {
    const r = authorizeSignerRequest(
      { signerId: ctx.operator, contractId: ctx.circleUsdc, methodName: 'ft_transfer_call', deposit: '1 yoctoNEAR', gas: '120 Tgas', args: { receiver_id: ctx.fxBudget } },
      ctx,
    )
    assert.ok(r.ok)
    if (r.ok) {
      assert.equal(r.deposit, '1 yoctoNEAR')
      assert.equal(r.gas, '120.0 Tgas')
    }
  })

  test('rejects out-of-scope requests', () => {
    const denied: Array<[string, any]> = [
      ['unknown signer', { signerId: 'attacker.testnet', contractId: ctx.fxBudget, methodName: 'create_order', deposit: '0 NEAR' }],
      ['path traversal signer', { signerId: '../../victim', contractId: ctx.fxBudget, methodName: 'create_order', deposit: '0 NEAR' }],
      ['operator drains the EURe vault token', { signerId: ctx.operator, contractId: `eure.${ctx.operator}`, methodName: 'ft_transfer', deposit: '1 yoctoNEAR', args: { receiver_id: 'x.testnet', amount: '1' } }],
      ['operator mints demo USDC', { signerId: ctx.operator, contractId: `usdc.${ctx.operator}`, methodName: 'mint', deposit: '0 NEAR', args: {} }],
      ['council signs on FxBudget', { signerId: council, contractId: ctx.fxBudget, methodName: 'approve_order', deposit: '0 NEAR', args: { id: 1 } }],
      ['operator votes', { signerId: ctx.operator, contractId: ctx.dao, methodName: 'act_proposal', deposit: '0 NEAR', args: { id: 1, action: 'VoteApprove' } }],
      ['council VoteRemove', { signerId: council, contractId: ctx.dao, methodName: 'act_proposal', deposit: '0 NEAR', args: { id: 1, action: 'VoteRemove' } }],
      ['funding sent to another receiver', { signerId: ctx.operator, contractId: ctx.circleUsdc, methodName: 'ft_transfer_call', deposit: '1 yoctoNEAR', args: { receiver_id: 'thief.testnet' } }],
      ['wrong deposit on escrow funding', { signerId: ctx.operator, contractId: ctx.circleUsdc, methodName: 'ft_transfer_call', deposit: '5 NEAR', args: { receiver_id: ctx.fxBudget } }],
      ['deposit on create_order', { signerId: ctx.operator, contractId: ctx.fxBudget, methodName: 'create_order', deposit: '10 NEAR', args: {} }],
      ['proposal for another action', { signerId: ctx.operator, contractId: ctx.dao, methodName: 'add_proposal', deposit: '0.1 NEAR', args: { proposal: { description: 'x', kind: { FunctionCall: { receiver_id: ctx.fxBudget, actions: [{ method_name: 'set_agent', args: 'e30=' }] } } } } }],
      ['proposal for another contract', { signerId: ctx.operator, contractId: ctx.dao, methodName: 'add_proposal', deposit: '0.1 NEAR', args: { proposal: { description: 'x', kind: { FunctionCall: { receiver_id: 'other.testnet', actions: [{ method_name: 'approve_order', args: 'e30=' }] } } } } }],
      ['transfer-style proposal', { signerId: ctx.operator, contractId: ctx.dao, methodName: 'add_proposal', deposit: '0.1 NEAR', args: { proposal: { description: 'x', kind: { Transfer: { token_id: '', receiver_id: 'x.testnet', amount: '1' } } } } }],
      ['excessive gas', { signerId: ctx.operator, contractId: ctx.fxBudget, methodName: 'create_order', deposit: '0 NEAR', gas: '900 Tgas', args: {} }],
      ['non-object args', { signerId: ctx.operator, contractId: ctx.fxBudget, methodName: 'create_order', deposit: '0 NEAR', args: [1, 2] }],
    ]
    for (const [label, body] of denied) {
      const r = authorizeSignerRequest(body, ctx)
      assert.equal(r.ok, false, `must reject: ${label}`)
    }
  })

  test('deposit parsing is strict', () => {
    assert.equal(parseDeposit('0 NEAR'), 0n)
    assert.equal(parseDeposit('0.1 NEAR'), 10n ** 23n)
    assert.equal(parseDeposit('1 yoctoNEAR'), 1n)
    assert.equal(parseDeposit('1; rm -rf /'), null)
    assert.equal(parseDeposit(5 as any), null)
  })
})

describe('/api/near/tx route (rejection paths only)', () => {
  beforeEach(enableDemo)

  test('unauthenticated request is rejected before the body is parsed (401)', async () => {
    const res = await signerPost(req('/api/near/tx', { body: { contractId: ctx.fxBudget, methodName: 'create_order', signerId: ctx.operator } }))
    assert.equal(res.status, 401)
  })

  test('authenticated but out-of-scope request is rejected (403) without signing', async () => {
    const res = await signerPost(
      req('/api/near/tx', {
        headers: auth,
        body: { contractId: `eure.${ctx.operator}`, methodName: 'ft_transfer', signerId: ctx.operator, deposit: '1 yoctoNEAR', args: { receiver_id: 'thief.testnet', amount: '99999999999' } },
      }),
    )
    assert.equal(res.status, 403)
    assert.equal(((await res.json()) as any).success, false)
  })

  test('cross-origin request with a valid token is rejected (403)', async () => {
    const res = await signerPost(
      req('/api/near/tx', { headers: { ...auth, origin: 'https://evil.example' }, body: { contractId: ctx.fxBudget, methodName: 'create_order', signerId: ctx.operator, deposit: '0 NEAR' } }),
    )
    assert.equal(res.status, 403)
  })

  test('malformed JSON is a 400, not a crash', async () => {
    const res = await signerPost(req('/api/near/tx', { headers: auth, raw: '{not json' }))
    assert.equal(res.status, 400)
  })
})

describe('faucet', () => {
  test('rejects shell metacharacters and malformed account IDs', () => {
    const bad = [
      'a-user.testnet & calc',
      'a-user.testnet && whoami',
      '$(id).testnet',
      'a-user.testnet; rm -rf /',
      'a-user.testnet\nb.testnet',
      'a user.testnet',
      '`id`.testnet',
      'UPPER.testnet',
      'a-user.near',
      'a-user',
      '.testnet',
      '..testnet',
      '../../etc/passwd.testnet',
      '',
    ]
    for (const accountId of bad) {
      const r = validateFaucetRequest({ accountId })
      assert.equal(r.ok, false, `must reject ${JSON.stringify(accountId)}`)
    }
  })

  test('bounds the amount: integer 1..MAX only', () => {
    for (const amount of [0, -5, 1.5, MAX_FAUCET_AMOUNT + 1, 1e12, '500', NaN, Infinity, {}]) {
      assert.equal(validateFaucetRequest({ accountId: 'a-user.testnet', amount }).ok, false, `must reject amount ${String(amount)}`)
    }
    const ok = validateFaucetRequest({ accountId: 'a-user.testnet', amount: MAX_FAUCET_AMOUNT })
    assert.ok(ok.ok)
    const dflt = validateFaucetRequest({ accountId: 'a-user.testnet' })
    assert.ok(dflt.ok)
    if (dflt.ok) assert.equal(dflt.amount, 500)
  })

  test('the spawned command never uses a shell and keeps the account as ONE argv entry', () => {
    const cmd = buildFaucetCommand('/repo', '/repo/scripts/near/faucet-tokens.ts', 'a-user.testnet', 500)
    assert.equal(cmd.options.shell, false)
    assert.equal(cmd.command, process.execPath)
    assert.deepEqual(cmd.args.slice(-2), ['a-user.testnet', '500'])
    assert.equal(cmd.args.filter((a) => a.includes('a-user.testnet')).length, 1)
    assert.ok(cmd.options.timeout > 0)
  })

  test('route: an injection payload is a 400 and nothing is spawned (even when authenticated)', async () => {
    enableDemo()
    const res = await faucetPost(req('/api/faucet', { headers: auth, body: { accountId: 'a-user.testnet & echo INJECTED', amount: 500 } }))
    assert.equal(res.status, 400)
    const res2 = await faucetPost(req('/api/faucet', { headers: auth, body: { accountId: 'a-user.testnet', amount: 1_000_000 } }))
    assert.equal(res2.status, 400)
  })
})

describe('/api/agent/trigger proxy', () => {
  test('requires the same access boundary as the agent: unauthenticated (401) and no agent token (503)', async () => {
    enableDemo()
    assert.equal((await triggerPost(req('/api/agent/trigger'))).status, 401)
    delete process.env.AGENT_TRIGGER_TOKEN
    assert.equal((await triggerPost(req('/api/agent/trigger', { headers: auth }))).status, 503)
  })
})

import { test, describe } from 'node:test'
import * as assert from 'node:assert/strict'
import { checkRateLimit, recordClaim, COOLDOWN_MS } from '../src/lib/rate-limit.js'

describe('Faucet Rate Limiter', () => {
  test('allows first claim for a new account', () => {
    const testAccount = `test-user-${Date.now()}.testnet`
    const check = checkRateLimit(testAccount, '192.168.1.100')
    assert.equal(check.allowed, true)
    assert.equal(check.remainingSeconds, 0)
  })

  test('blocks immediate subsequent claims within cooldown window', () => {
    const testAccount = `test-user-repeat-${Date.now()}.testnet`
    recordClaim(testAccount, '192.168.1.101')

    const check = checkRateLimit(testAccount, '192.168.1.101')
    assert.equal(check.allowed, false)
    assert.ok(check.remainingSeconds > 0)
    assert.ok(check.remainingSeconds <= Math.ceil(COOLDOWN_MS / 1000))
    assert.ok(check.reason?.includes(testAccount))
  })
})

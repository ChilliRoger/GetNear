import { test, describe } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  checkRateLimit,
  checkAccountCooldown,
  recordClaim,
  COOLDOWN_MS,
  formatRemainingTime,
} from '../src/lib/rate-limit.js'

describe('Faucet Rate Limiter', () => {
  test('allows first claim for a new account', () => {
    const testAccount = `test-user-${Date.now()}.testnet`
    const check = checkRateLimit(testAccount, '192.168.1.100')
    assert.equal(check.allowed, true)
    assert.equal(check.remainingSeconds, 0)
  })

  test('checkAccountCooldown returns allowed for fresh account', () => {
    const freshAccount = `fresh-${Date.now()}.testnet`
    const check = checkAccountCooldown(freshAccount)
    assert.equal(check.allowed, true)
    assert.equal(check.remainingSeconds, 0)
  })

  test('blocks immediate subsequent claims for the same account within cooldown window', () => {
    const testAccount = `test-user-repeat-${Date.now()}.testnet`
    recordClaim(testAccount, '192.168.1.101')

    const check = checkRateLimit(testAccount, '192.168.1.101')
    assert.equal(check.allowed, false)
    assert.ok(check.remainingSeconds > 0)
    assert.ok(check.remainingSeconds <= Math.ceil(COOLDOWN_MS / 1000))
    assert.ok(check.reason?.includes(testAccount))
  })

  test('does not block a different account with a 24h lockout', () => {
    const acc1 = `acc1-${Date.now()}.testnet`
    const acc2 = `acc2-${Date.now()}.testnet`
    recordClaim(acc1, '10.0.0.5')

    // Cooldown check for second account should remain allowed
    const checkAcc2 = checkAccountCooldown(acc2)
    assert.equal(checkAcc2.allowed, true)
    assert.equal(checkAcc2.remainingSeconds, 0)
  })

  test('formats remaining cooldown time strings correctly', () => {
    assert.equal(formatRemainingTime(45), '45s')
    assert.equal(formatRemainingTime(125), '2m 5s')
    assert.equal(formatRemainingTime(3665), '1h 1m')
    assert.equal(formatRemainingTime(86400), '24h 0m')
  })
})

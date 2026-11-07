/**
 * GetNear Utility Unit Tests (P3)
 *
 * Run with: npx tsx packages/shared/src/utils.test.ts
 */

import {
  nearToYocto,
  yoctoToNear,
  stablecoinToAtomic,
  atomicToStablecoin,
  msToNs,
  nsToMs,
  computeDeviationBps,
  bpsToPercent,
  applyBpsFee,
  explorerTxUrl,
  explorerAccountUrl,
  secondsFromNowNs,
  timeRemainingHuman,
  YOCTO_PER_NEAR,
} from './utils.js'

let passed = 0
let failed = 0

function assert(label: string, actual: unknown, expected: unknown) {
  const serialize = (v: unknown): string =>
    JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() + 'n' : val))
  const ok = serialize(actual) === serialize(expected)
  if (ok) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}`)
    console.error(`    expected: ${serialize(expected)}`)
    console.error(`    actual:   ${serialize(actual)}`)
    failed++
  }
}

function assertClose(label: string, actual: number, expected: number, tolerance = 0.0001) {
  const ok = Math.abs(actual - expected) <= tolerance
  if (ok) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}`)
    console.error(`    expected: ${expected} (±${tolerance})`)
    console.error(`    actual:   ${actual}`)
    failed++
  }
}

function assertThrows(label: string, fn: () => unknown) {
  try {
    fn()
    console.error(`  ✗ ${label} — expected throw but didn't`)
    failed++
  } catch {
    console.log(`  ✓ ${label} (threw as expected)`)
    passed++
  }
}

// ── NEAR amount helpers ──────────────────────────────────────────────
console.log('\n[NEAR Amount Helpers]')

assert('1 NEAR → yocto string',
  nearToYocto(1),
  YOCTO_PER_NEAR.toString()
)
assertClose('yocto → NEAR round-trip (1 NEAR)',
  yoctoToNear(YOCTO_PER_NEAR.toString()),
  1.0
)
assertClose('yocto → NEAR (2.5 NEAR)',
  yoctoToNear((YOCTO_PER_NEAR * 5n / 2n).toString()),
  2.5
)
assert('0 yocto → 0 NEAR', yoctoToNear('0'), 0)

// ── Stablecoin helpers ───────────────────────────────────────────────
console.log('\n[Stablecoin Amount Helpers]')

assert('100 USDC → atomic', stablecoinToAtomic(100), 100_000_000n)
assert('1 USDC → atomic',   stablecoinToAtomic(1),   1_000_000n)
assert('0.5 USDC → atomic', stablecoinToAtomic(0.5), 500_000n)
assertClose('atomic → stablecoin (100M → 100)',
  atomicToStablecoin('100000000'),
  100.0
)
assertClose('atomic → stablecoin (1M → 1)',
  atomicToStablecoin('1000000'),
  1.0
)
assert('roundtrip: 500 USDC',
  atomicToStablecoin(stablecoinToAtomic(500).toString()),
  500
)

// ── Nanosecond helpers ───────────────────────────────────────────────
console.log('\n[Nanosecond Time Helpers]')

const testMs = 1700000000000  // fixed timestamp
const testNs = '1700000000000000000'
assert('ms → ns', msToNs(testMs), testNs)
assert('ns → ms', nsToMs(testNs), testMs)
assert('ns roundtrip', nsToMs(msToNs(testMs)), testMs)

// secondsFromNowNs: just verify it's in the future
const futureNs = secondsFromNowNs(60)
const futureMs = nsToMs(futureNs)
const ok = futureMs > Date.now() && futureMs < Date.now() + 61_000
assert('secondsFromNowNs(60) is ~60s in future', ok, true)

// timeRemainingHuman
const expiredNs = msToNs(Date.now() - 1000)
assert('timeRemainingHuman: expired', timeRemainingHuman(expiredNs), 'expired')
const future30sNs = msToNs(Date.now() + 30_000)
// Should be "30s" or close — just check it doesn't say expired
const rem30 = timeRemainingHuman(future30sNs)
assert('timeRemainingHuman: 30s future not expired', rem30 !== 'expired', true)

// ── Basis-point math ─────────────────────────────────────────────────
console.log('\n[Basis-Point Math]')

// 1.08 (reference) vs 1.0908 (quote = 1% better) → ~100 bps
assertClose('deviationBps: 1% favorable',
  computeDeviationBps(1.0908, 1.08),
  100,
  2
)
// equal rates → 0 bps
assert('deviationBps: equal rates', computeDeviationBps(1.08, 1.08), 0)
// quote worse → negative
assert('deviationBps: worse quote is negative',
  computeDeviationBps(1.07, 1.08) < 0,
  true
)
assertThrows('deviationBps: referenceRate=0 throws', () =>
  computeDeviationBps(1.0, 0)
)
assert('bpsToPercent: 25 bps', bpsToPercent(25), '0.25%')
assert('bpsToPercent: 100 bps', bpsToPercent(100), '1.00%')
assert('bpsToPercent: 0 bps', bpsToPercent(0), '0.00%')

// applyBpsFee: 100 USDC with 50 bps (0.5%) fee → 99.5 USDC
assert('applyBpsFee: 100M atomic - 50bps',
  applyBpsFee(100_000_000n, 50),
  99_500_000n
)
assert('applyBpsFee: 0 fee', applyBpsFee(100_000_000n, 0), 100_000_000n)

// ── Explorer links ───────────────────────────────────────────────────
console.log('\n[Explorer Link Builders]')

assert('explorerTxUrl',
  explorerTxUrl('ABC123'),
  'https://testnet.nearblocks.io/txns/ABC123'
)
assert('explorerAccountUrl',
  explorerAccountUrl('agent.getnear.testnet'),
  'https://testnet.nearblocks.io/address/agent.getnear.testnet'
)
assert('explorerTxUrl: custom base',
  explorerTxUrl('XYZ', 'https://custom.explorer'),
  'https://custom.explorer/txns/XYZ'
)

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`)
if (failed === 0) {
  console.log(`✓ All ${passed} utility tests passed!`)
} else {
  console.error(`✗ ${failed} of ${passed + failed} tests FAILED`)
  process.exit(1)
}

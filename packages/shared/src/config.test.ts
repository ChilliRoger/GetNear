/**
 * GetNear Config Unit Tests (P3)
 *
 * Run with: npx tsx packages/shared/src/config.test.ts
 */

import { loadConfig, configSummary } from './config.js'

let passed = 0
let failed = 0

function assert(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}`)
    console.error(`    expected: ${JSON.stringify(expected)}`)
    console.error(`    actual:   ${JSON.stringify(actual)}`)
    failed++
  }
}

function assertThrows(label: string, fn: () => unknown, matchMsg?: string) {
  try {
    fn()
    console.error(`  ✗ ${label} — expected throw but didn't`)
    failed++
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (matchMsg && !msg.includes(matchMsg)) {
      console.error(`  ✗ ${label} — threw but wrong message: ${msg}`)
      failed++
    } else {
      console.log(`  ✓ ${label} (threw as expected)`)
      passed++
    }
  }
}

// ── Default / valid config ───────────────────────────────────────────
console.log('\n[Config: defaults]')

const baseEnv: NodeJS.ProcessEnv = {
  NEAR_NETWORK_ID: 'testnet',
  NEAR_RPC_URLS: 'https://rpc.testnet.near.org,https://test.rpc.fastnear.com',
  GETNEAR_MODE: 'mock',
}

const cfg = loadConfig(baseEnv)
assert('network_id is testnet', cfg.NEAR_NETWORK_ID, 'testnet')
assert('RPC URLs parsed as array', cfg.NEAR_RPC_URLS, [
  'https://rpc.testnet.near.org',
  'https://test.rpc.fastnear.com',
])
assert('mode defaults to mock', cfg.GETNEAR_MODE, 'mock')
assert('DEMO_MODE defaults false', cfg.DEMO_MODE, false)
assert('AGENT_PRIVATE_KEY undefined', cfg.AGENT_PRIVATE_KEY, undefined)

// ── Mode validation ──────────────────────────────────────────────────
console.log('\n[Config: mode]')

const testnetCfg = loadConfig({ ...baseEnv, GETNEAR_MODE: 'testnet' })
assert('mode=testnet accepted', testnetCfg.GETNEAR_MODE, 'testnet')

assertThrows(
  'mode=mainnet rejected',
  () => loadConfig({ ...baseEnv, GETNEAR_MODE: 'mainnet' }),
)

// ── Network ID validation ───────────────────────────────────────────
console.log('\n[Config: network ID validation]')

const mainnetCfg = loadConfig({ GETNEAR_MODE: 'mock', NEAR_NETWORK_ID: 'mainnet' })
assert('NEAR_NETWORK_ID=mainnet accepted', mainnetCfg.NEAR_NETWORK_ID, 'mainnet')
assert('NEAR_NETWORK_ID=mainnet defaults to mainnet RPCs', mainnetCfg.NEAR_RPC_URLS, [
  'https://rpc.mainnet.near.org',
  'https://free.rpc.fastnear.com',
])
assert('NEAR_NETWORK_ID=mainnet defaults to mainnet explorer', mainnetCfg.NEAR_EXPLORER_BASE, 'https://nearblocks.io')

const defaultCfg = loadConfig({ ...baseEnv, NEAR_NETWORK_ID: undefined })
assert('NEAR_NETWORK_ID missing defaults to testnet', defaultCfg.NEAR_NETWORK_ID, 'testnet')

assertThrows(
  'NEAR_NETWORK_ID=polygon throws',
  () => loadConfig({ ...baseEnv, NEAR_NETWORK_ID: 'polygon' as any }),
  'testnet" or "mainnet"',
)

// ── DEMO_MODE parsing ────────────────────────────────────────────────
console.log('\n[Config: DEMO_MODE]')

assert('DEMO_MODE=true parsed', loadConfig({ ...baseEnv, DEMO_MODE: 'true' }).DEMO_MODE, true)
assert('DEMO_MODE=1 parsed', loadConfig({ ...baseEnv, DEMO_MODE: '1' }).DEMO_MODE, true)
assert('DEMO_MODE=false parsed', loadConfig({ ...baseEnv, DEMO_MODE: 'false' }).DEMO_MODE, false)
assert('DEMO_MODE absent → false', loadConfig(baseEnv).DEMO_MODE, false)

// ── Secret masking in summary ────────────────────────────────────────
console.log('\n[Config: secret masking]')

const cfgWithKey = loadConfig({ ...baseEnv, AGENT_PRIVATE_KEY: 'ed25519:supersecret' })
const summary = configSummary(cfgWithKey)
assert('AGENT_PRIVATE_KEY is hidden in summary',
  summary['AGENT_PRIVATE_KEY'],
  '[SET — hidden]'
)
assert('NEAR_NETWORK_ID visible in summary',
  summary['NEAR_NETWORK_ID'],
  'testnet'
)
// Ensure the actual secret is NOT in the summary string
const summaryStr = JSON.stringify(summary)
assert('summary does not contain raw key value',
  summaryStr.includes('supersecret'),
  false
)

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`)
if (failed === 0) {
  console.log(`✓ All ${passed} config tests passed!`)
} else {
  console.error(`✗ ${failed} of ${passed + failed} tests FAILED`)
  process.exit(1)
}


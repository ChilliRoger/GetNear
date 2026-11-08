/**
 * NearClient Unit & Integration Tests (P4)
 */

import { NearClient, NearRpcError } from './client'

let passed = 0
let failed = 0

function assert(label: string, condition: boolean, extra?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}${extra ? `: ${extra}` : ''}`)
    failed++
  }
}

async function runUnitTests() {
  console.log('\n[NearClient Unit Tests with Mocked RPC]')

  // 1. Successful RPC call
  {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            chain_id: 'testnet',
            version: { version: '2.4.0', build: 'crates' },
            sync_info: {
              latest_block_hash: 'mockhash',
              latest_block_height: 123456,
              latest_block_time: '2026-11-08T00:00:00Z',
              latest_state_root: 'stateroot',
              syncing: false,
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )

    const client = new NearClient({
      rpcUrls: ['https://rpc.primary.test', 'https://rpc.fallback.test'],
    })

    const status = await client.status()
    assert('status returns chain_id testnet', status.chain_id === 'testnet')
    assert('status returns block height', status.sync_info.latest_block_height === 123456)

    globalThis.fetch = originalFetch
  }

  // 2. Failover to secondary RPC when primary returns HTTP 500
  {
    const originalFetch = globalThis.fetch
    let callCount = 0

    globalThis.fetch = async (url) => {
      callCount++
      if (url === 'https://rpc.primary.test') {
        return new Response('Internal Server Error', { status: 500 })
      }
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { amount: '10000000000000000000000000', storage_usage: 182 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const client = new NearClient({
      rpcUrls: ['https://rpc.primary.test', 'https://rpc.fallback.test'],
      maxRetries: 0,
    })

    const account = await client.viewAccount('test.testnet')
    assert('failover successfully gets response from fallback', account.amount === '10000000000000000000000000')
    assert('client active URL updated to fallback', client.currentRpcUrl === 'https://rpc.fallback.test')

    globalThis.fetch = originalFetch
  }

  // 3. callView decodes base64 response correctly
  {
    const originalFetch = globalThis.fetch
    const mockReturnData = { orders_count: 5, active: true }
    const encoded = Array.from(Buffer.from(JSON.stringify(mockReturnData)))

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { result: encoded, logs: [] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )

    const client = new NearClient({ rpcUrls: ['https://rpc.testnet.near.org'] })
    const result = await client.callView<{ orders_count: number }>('contract.testnet', 'get_stats')
    assert('callView decodes JSON payload', result.orders_count === 5)

    globalThis.fetch = originalFetch
  }

  // 4. Exhaustion of all endpoints throws NearRpcError
  {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response('Bad Gateway', { status: 502 })

    const client = new NearClient({
      rpcUrls: ['https://rpc.primary.test', 'https://rpc.fallback.test'],
      maxRetries: 0,
    })

    let threw = false
    try {
      await client.status()
    } catch (e) {
      threw = e instanceof NearRpcError
    }
    assert('throws NearRpcError when all endpoints fail', threw)

    globalThis.fetch = originalFetch
  }
}

async function runLiveIntegrationTest() {
  console.log('\n[NearClient Live Testnet Integration Test]')

  try {
    const client = new NearClient({
      rpcUrls: [
        'https://rpc.testnet.near.org',
        'https://test.rpc.fastnear.com',
      ],
      timeoutMs: 15_000,
    })

    const status = await client.status()
    assert(
      `live status: chain_id is "${status.chain_id}"`,
      status.chain_id === 'testnet',
    )
    assert(
      `live block height > 0 (current: ${status.sync_info.latest_block_height})`,
      status.sync_info.latest_block_height > 0,
    )

    const account = await client.viewAccount('chilliroger-operator.testnet')
    const nearAmount = BigInt(account.amount) / 10n ** 24n
    assert(
      `live viewAccount on chilliroger-operator.testnet has balance (${nearAmount} NEAR)`,
      nearAmount >= 10n,
    )

    const keys = await client.viewAccessKeyList('chilliroger-operator.testnet')
    assert(
      `live viewAccessKeyList has registered keys (count: ${keys.keys.length})`,
      keys.keys.length > 0,
    )
  } catch (err) {
    console.error('  ✗ Live testnet integration test failed:', err)
    failed++
  }
}

async function main() {
  await runUnitTests()
  await runLiveIntegrationTest()

  console.log(`\n${'─'.repeat(40)}`)
  if (failed === 0) {
    console.log(`✓ All ${passed} near-client tests passed!`)
  } else {
    console.error(`✗ ${failed} tests failed!`)
    process.exit(1)
  }
}

main()

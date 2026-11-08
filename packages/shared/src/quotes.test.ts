/**
 * Unit Tests for OneClickQuoteSource & FrankfurterReferenceSource (P5)
 */

import { test, describe, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  OneClickQuoteSource,
  KNOWN_ASSETS,
} from './oneclick-quote-source.js'
import { FrankfurterReferenceSource } from './frankfurter-reference-source.js'
import { computeDeviationBps } from './utils.js'

describe('OneClickQuoteSource Unit Tests', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('Hard guard: throws immediately if dry=false', async () => {
    const source = new OneClickQuoteSource()
    await assert.rejects(
      async () => {
        await source.getQuote({
          fromToken: 'USDC',
          toToken: 'EURe',
          amountIn: '10000000',
          dry: false,
        })
      },
      {
        name: 'Error',
        message: /Live execution \(dry=false\) is strictly forbidden/,
      },
    )
  })

  test('Resolves token symbols and asset IDs correctly', () => {
    const source = new OneClickQuoteSource()
    assert.equal(source.resolveAssetId('USDC'), KNOWN_ASSETS.USDC_NEAR)
    assert.equal(source.resolveAssetId('EURe'), KNOWN_ASSETS.EURE_GNOSIS)
    assert.equal(source.resolveAssetId('USDT'), KNOWN_ASSETS.USDT_NEAR)
    assert.equal(source.resolveAssetId('wNEAR'), KNOWN_ASSETS.WNEAR)
    assert.equal(source.resolveDecimals('USDC'), 6)
    assert.equal(source.resolveDecimals('EURe'), 18)
    assert.equal(source.resolveDecimals('wNEAR'), 24)
  })

  test('Maps 1Click mock response to canonical QuoteResult', async () => {
    const mockFixture = {
      quote: {
        amountIn: '10000000',
        amountInFormatted: '10.0',
        amountInUsd: '10.00',
        minAmountIn: '10000000',
        amountOut: '9200000000000000000', // 9.2 EURe (18 dec)
        amountOutFormatted: '9.2',
        amountOutUsd: '10.00',
        minAmountOut: '9100000000000000000',
        timeEstimate: 15,
      },
      signature: 'ed25519:mock_sig_12345',
      timestamp: '2026-11-08T10:00:00.000Z',
      correlationId: 'mock-correlation-id-999',
    }

    globalThis.fetch = async (url, init) => {
      // Verify outgoing request has dry=true
      const body = JSON.parse(init?.body as string)
      assert.equal(body.dry, true)
      assert.equal(body.swapType, 'EXACT_INPUT')

      return {
        ok: true,
        status: 201,
        json: async () => mockFixture,
      } as Response
    }

    const source = new OneClickQuoteSource({ ttlMs: 5000 })
    const quote = await source.getQuote({
      fromToken: 'USDC',
      toToken: 'EURe',
      amountIn: '10000000',
      dry: true,
    })

    assert.equal(quote.quoteId, 'mock-correlation-id-999')
    assert.equal(quote.fromToken, 'USDC')
    assert.equal(quote.toToken, 'EURe')
    assert.equal(quote.amountIn, '10000000')
    assert.equal(quote.amountOut, '9200000000000000000')
    assert.ok(Math.abs(quote.rate - 0.92) < 1e-6, `Expected rate close to 0.92, got ${quote.rate}`)
    assert.equal(quote.source, '1Click (dry-quote)')
    assert.equal(quote.signature, 'ed25519:mock_sig_12345')
    assert.equal(quote.decimalsIn, 6)
    assert.equal(quote.decimalsOut, 18)
  })

  test('Serves repeated queries from short-TTL cache', async () => {
    let networkCalls = 0
    globalThis.fetch = async () => {
      networkCalls++
      return {
        ok: true,
        status: 201,
        json: async () => ({
          quote: {
            amountIn: '10000000',
            amountOut: '9200000000000000000',
          },
          correlationId: 'cache-test-id',
        }),
      } as Response
    }

    const source = new OneClickQuoteSource({ ttlMs: 60_000, minRequestIntervalMs: 0 })
    await source.getQuote({ fromToken: 'USDC', toToken: 'EURe', amountIn: '10000000', dry: true })
    await source.getQuote({ fromToken: 'USDC', toToken: 'EURe', amountIn: '10000000', dry: true })

    assert.equal(networkCalls, 1, 'Expected second call to be served from cache')
  })
})

describe('FrankfurterReferenceSource Unit Tests', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('Fetches EUR/USD reference rate and parses rates', async () => {
    globalThis.fetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          amount: 1.0,
          base: 'USD',
          date: '2026-11-06',
          rates: { EUR: 0.89566 },
        }),
      } as Response
    }

    const source = new FrankfurterReferenceSource()
    const ref = await source.getReferenceRate('USDC/EURe')

    assert.equal(ref.pair, 'USD/EUR')
    assert.equal(ref.rate, 0.89566)
    assert.equal(ref.source, 'ECB via Frankfurter API')
  })

  test('Throws descriptive error when reference API fails and no cache exists', async () => {
    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as Response
    }

    const source = new FrankfurterReferenceSource({ allowStaleOnFailure: false })
    await assert.rejects(
      async () => {
        await source.getReferenceRate('USD/EUR')
      },
      {
        name: 'Error',
        message: /Reference rate unavailable for USD\/EUR: strategy must WAIT/,
      },
    )
  })

  test('Computes deviation BPS correctly with sign convention', () => {
    // Quote is 0.90 EUR/USD, Reference is 0.89 EUR/USD -> Quote is better by ~112 bps
    const favorable = computeDeviationBps(0.90, 0.89)
    assert.ok(favorable > 0)
    assert.equal(favorable, 112)

    // Quote is 0.88 EUR/USD, Reference is 0.89 EUR/USD -> Quote is worse by ~-112 bps
    const adverse = computeDeviationBps(0.88, 0.89)
    assert.ok(adverse < 0)
    assert.equal(adverse, -112)
  })
})

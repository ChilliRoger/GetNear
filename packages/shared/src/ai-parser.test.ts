import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import * as http from 'node:http'
import {
  resolveAiProviderConfig,
  validateParsedOrderResponse,
  parseNaturalLanguageOrder,
  parseOrderWithFailover,
  getAvailableProviders,
} from './ai-parser'

describe('P11 Natural-Language Order Parser (@getnear/shared)', () => {
  test('resolves NEAR AI Cloud, Gemini, and Groq configs dynamically without leaking keys', () => {
    const empty = resolveAiProviderConfig({})
    assert.equal(empty.configured, false)
    assert.equal(empty.provider, 'nearai')

    const nearCfg = resolveAiProviderConfig({ NEAR_AI_API_KEY: 'sk-near-test' })
    assert.equal(nearCfg.configured, true)
    assert.equal(nearCfg.provider, 'nearai')
    assert.equal(nearCfg.baseUrl, 'https://cloud-api.near.ai/v1')
    assert.equal(nearCfg.model, 'z-ai/glm-5.3-flash')
    assert.equal(nearCfg.supportsAttestation, true)

    const geminiCfg = resolveAiProviderConfig({ GEMINI_API_KEY: 'AIza-free-test' })
    assert.equal(geminiCfg.configured, true)
    assert.equal(geminiCfg.provider, 'gemini')
    assert.equal(geminiCfg.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai')
    assert.equal(geminiCfg.supportsAttestation, false)

    const groqCfg = resolveAiProviderConfig({ GROQ_API_KEY: 'gsk_free_test' })
    assert.equal(groqCfg.configured, true)
    assert.equal(groqCfg.provider, 'groq')
    assert.equal(groqCfg.baseUrl, 'https://api.groq.com/openai/v1')
    assert.equal(groqCfg.supportsAttestation, false)

    const avail = getAvailableProviders({ GEMINI_API_KEY: 'AIza-free-test' })
    assert.deepEqual(avail, { nearai: false, gemini: true, groq: false })
  })

  test('validates strict zod structure and leaves unstated optional fields null', () => {
    const nowMs = Date.parse('2026-11-12T12:00:00Z')
    const valid = validateParsedOrderResponse(
      {
        status: 'ok',
        order: {
          pair: 'USDC/EURe',
          totalUsdc: 500,
          maxChunkUsdc: 100,
          deadlineHours: 24,
          deadlineIso: '2026-11-13T12:00:00Z',
          maxDevBps: null,
          recipient: 'supplier-eu.chilliroger-operator.testnet',
          targetEuRe: null,
          invoiceRef: null,
          fundingMode: null,
        },
      },
      nowMs,
    )
    assert.equal(valid.ok, true)
    if (valid.ok) {
      assert.equal(valid.order.totalUsdc, 500)
      assert.equal(valid.order.maxChunkUsdc, 100)
      assert.equal(valid.order.maxDevBps, null)
      assert.equal(valid.order.targetEuRe, null)
    }
  })

  test('rejects ambiguous, past-deadline, over-horizon, and chunk > total inputs cleanly', () => {
    const nowMs = Date.parse('2026-11-12T12:00:00Z')

    const chunkTooLarge = validateParsedOrderResponse(
      {
        status: 'ok',
        order: {
          pair: 'USDC/EURe',
          totalUsdc: 50,
          maxChunkUsdc: 100,
          deadlineHours: 4,
          deadlineIso: '2026-11-12T16:00:00Z',
          maxDevBps: null,
          recipient: null,
          targetEuRe: null,
          invoiceRef: null,
          fundingMode: null,
        },
      },
      nowMs,
    )
    assert.equal(chunkTooLarge.ok, false)

    const pastDeadline = validateParsedOrderResponse(
      {
        status: 'ok',
        order: {
          pair: 'USDC/EURe',
          totalUsdc: 50,
          maxChunkUsdc: 10,
          deadlineHours: 4,
          deadlineIso: '2026-11-11T12:00:00Z',
          maxDevBps: null,
          recipient: null,
          targetEuRe: null,
          invoiceRef: null,
          fundingMode: null,
        },
      },
      nowMs,
    )
    assert.equal(pastDeadline.ok, false)

    const llmAmbiguous = validateParsedOrderResponse(
      {
        status: 'ambiguous',
        ambiguities: ['Unsupported currency pair ETH/BTC; only USDC/EURe is allowed.'],
      },
      nowMs,
    )
    assert.equal(llmAmbiguous.ok, false)
    if (!llmAmbiguous.ok) {
      assert.match(llmAmbiguous.ambiguities[0], /USDC\/EURe/)
    }
  })

  test('executes live HTTP completion parse and never claims verified Private AI without attestation check', async () => {
    const server = http.createServer((req, res) => {
      if (req.url === '/v1/chat/completions' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            id: 'chatcmpl-test-123',
            model: 'z-ai/glm-5.3-flash',
            usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    status: 'ok',
                    order: {
                      pair: 'USDC/EURe',
                      totalUsdc: 15,
                      maxChunkUsdc: 10,
                      deadlineHours: 24,
                      deadlineIso: '2026-11-13T12:00:00.000Z',
                      maxDevBps: 200,
                      recipient: 'supplier-eu.chilliroger-operator.testnet',
                      targetEuRe: 8.7,
                      invoiceRef: 'INV-CIRCLE-15',
                      fundingMode: 'circle_escrow',
                    },
                  }),
                },
              },
            ],
          }),
        )
        return
      }
      res.writeHead(404)
      res.end()
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address() as { port: number }
    const baseUrl = `http://127.0.0.1:${addr.port}/v1`

    try {
      const result = await parseNaturalLanguageOrder({
        prompt:
          'Pay supplier-eu.chilliroger-operator.testnet 8.70 EURe from $15 Circle USDC escrow within 24h using max 10 USDC chunks and 200 bps max deviation for INV-CIRCLE-15',
        nowMs: Date.parse('2026-11-12T12:00:00Z'),
        config: {
          configured: true,
          provider: 'nearai',
          baseUrl,
          model: 'z-ai/glm-5.3-flash',
          apiKey: 'sk-local-test',
          supportsAttestation: false,
        },
      })

      assert.equal(result.ok, true)
      if (result.ok) {
        assert.equal(result.order.totalUsdc, 15)
        assert.equal(result.order.targetEuRe, 8.7)
        assert.equal(result.order.fundingMode, 'circle_escrow')
        assert.equal(result.audit.model, 'z-ai/glm-5.3-flash')
        assert.equal(result.audit.attestation.verified, false)
      }
    } finally {
      server.close()
    }
  })

  test('falls back automatically across configured providers when primary fails', async () => {
    let calls = 0
    const mockFetch: typeof fetch = async (input) => {
      calls += 1
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('cloud-api.near.ai')) {
        return new Response(JSON.stringify({ error: { message: 'Invalid key' } }), { status: 401 })
      }
      return new Response(
        JSON.stringify({
          id: 'gemini-fallback-1',
          model: 'gemini-2.5-flash',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  status: 'ok',
                  order: {
                    pair: 'USDC/EURe',
                    totalUsdc: 500,
                    maxChunkUsdc: 100,
                    deadlineHours: 24,
                    deadlineIso: '2026-11-13T12:00:00.000Z',
                    maxDevBps: null,
                    recipient: null,
                    targetEuRe: null,
                    invoiceRef: null,
                    fundingMode: null,
                  },
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const res = await parseOrderWithFailover({
      prompt: 'Convert 500 USDC to EURe in 100 USDC chunks within 24 hours',
      nowMs: Date.parse('2026-11-12T12:00:00Z'),
      env: { NEAR_AI_API_KEY: 'sk-expired', GEMINI_API_KEY: 'AIza-valid' },
      fetchImpl: mockFetch,
    })

    assert.equal(calls, 2)
    assert.equal(res.ok, true)
    if (res.ok) {
      assert.equal(res.audit.provider, 'gemini')
      assert.equal(res.audit.fallbackAttempts?.length, 1)
      assert.equal(res.audit.fallbackAttempts?.[0].provider, 'nearai')
    }
  })
})


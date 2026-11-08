/**
 * 1Click Dry-Quote Source Adapter (P5)
 *
 * Implements QuoteSource interface against the 1Click API (https://1click.chaindefuser.com/v0/quote).
 *
 * SAFETY GUARD:
 * - Strictly enforces dry=true. Any call with dry=false throws an explicit error.
 * - Testnet prototype only: Never executes on mainnet; uses dry quotes for price discovery.
 */

import type { QuoteRequest, QuoteResult, QuoteSource } from './adapters.js'

export const KNOWN_ASSETS = {
  USDC_NEAR: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
  USDT_NEAR: 'nep141:usdt.tether-token.near',
  EURE_GNOSIS: 'nep141:gnosis-0x420ca0f9b9b604ce0fd9c18ef134c705e5fa3430.omft.near',
  WNEAR: 'nep141:wrap.near',
} as const

const DEFAULT_DECIMALS: Record<string, number> = {
  [KNOWN_ASSETS.USDC_NEAR]: 6,
  USDC: 6,
  [KNOWN_ASSETS.USDT_NEAR]: 6,
  USDT: 6,
  [KNOWN_ASSETS.EURE_GNOSIS]: 18,
  EURE: 18,
  [KNOWN_ASSETS.WNEAR]: 24,
  NEAR: 24,
  WNEAR: 24,
}

export interface OneClickQuoteSourceOptions {
  baseUrl?: string
  ttlMs?: number
  maxRetries?: number
  minRequestIntervalMs?: number
  defaultRecipient?: string
  defaultRefundTo?: string
}

interface CacheEntry {
  result: QuoteResult
  expiresAt: number
}

interface OneClickRawResponse {
  quote: {
    amountIn: string
    amountInFormatted?: string
    amountInUsd?: string
    minAmountIn?: string
    amountOut: string
    amountOutFormatted?: string
    amountOutUsd?: string
    minAmountOut?: string
    timeEstimate?: number
    refundFee?: string
    withdrawFee?: string
  }
  signature?: string
  timestamp?: string
  correlationId?: string
  message?: string
}

export class OneClickQuoteSource implements QuoteSource {
  private readonly baseUrl: string
  private readonly ttlMs: number
  private readonly maxRetries: number
  private readonly minRequestIntervalMs: number
  private readonly defaultRecipient: string
  private readonly defaultRefundTo: string

  private cache = new Map<string, CacheEntry>()
  private lastRequestTime = 0

  constructor(options: OneClickQuoteSourceOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://1click.chaindefuser.com'
    this.ttlMs = options.ttlMs ?? 15_000 // 15s cache
    this.maxRetries = options.maxRetries ?? 3
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? 200
    this.defaultRecipient = options.defaultRecipient ?? 'wrap.near'
    this.defaultRefundTo = options.defaultRefundTo ?? 'wrap.near'
  }

  /**
   * Resolve token symbol or alias to full 1Click asset ID
   */
  resolveAssetId(token: string): string {
    const upper = token.toUpperCase()
    if (upper === 'USDC') return KNOWN_ASSETS.USDC_NEAR
    if (upper === 'USDT') return KNOWN_ASSETS.USDT_NEAR
    if (upper === 'EURE' || upper === 'EURC') return KNOWN_ASSETS.EURE_GNOSIS
    if (upper === 'WNEAR' || upper === 'NEAR') return KNOWN_ASSETS.WNEAR
    return token
  }

  /**
   * Resolve decimals for a given asset ID or symbol
   */
  resolveDecimals(token: string): number {
    const resolved = this.resolveAssetId(token)
    if (DEFAULT_DECIMALS[resolved] !== undefined) return DEFAULT_DECIMALS[resolved]
    if (DEFAULT_DECIMALS[token.toUpperCase()] !== undefined) return DEFAULT_DECIMALS[token.toUpperCase()]
    // Default to 18 for bridged/OMFT, 6 for USD stablecoins
    if (token.toLowerCase().includes('eur')) return 18
    return 6
  }

  async getQuote(request: QuoteRequest): Promise<QuoteResult> {
    // 1. HARD GUARD: Enforce dry=true
    if (request.dry === false) {
      throw new Error(
        '[OneClickQuoteSource] Live execution (dry=false) is strictly forbidden. ' +
          'GetNear is a testnet-only prototype with simulated fills.',
      )
    }

    const originAsset = this.resolveAssetId(request.fromToken)
    const destinationAsset = this.resolveAssetId(request.toToken)
    const slippageTolerance = request.slippageToleranceBps ?? 100
    const cacheKey = `${originAsset}:${destinationAsset}:${request.amountIn}:${slippageTolerance}`

    // 2. Check cache
    const now = Date.now()
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      return cached.result
    }

    // 3. Enforce rate pacing
    const timeSinceLast = now - this.lastRequestTime
    if (timeSinceLast < this.minRequestIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minRequestIntervalMs - timeSinceLast))
    }

    // 4. Construct request payload
    const recipient = request.recipient ?? this.defaultRecipient
    const refundTo = request.refundTo ?? this.defaultRefundTo
    const deadline = new Date(Date.now() + 600_000).toISOString() // 10 min

    const payload = {
      dry: true,
      swapType: 'EXACT_INPUT',
      slippageTolerance,
      originAsset,
      depositType: 'INTENTS',
      destinationAsset,
      amount: request.amountIn,
      recipient,
      recipientType: 'INTENTS',
      refundTo,
      refundType: 'INTENTS',
      deadline,
    }

    // 5. Fetch with exponential backoff on 429 / 5xx
    let response: Response | null = null
    let responseBody: OneClickRawResponse | null = null
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this.lastRequestTime = Date.now()
        response = await fetch(`${this.baseUrl}/v0/quote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'GetNear-FX-Agent/1.0',
          },
          body: JSON.stringify(payload),
        })

        if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
          const backoffMs = Math.min(500 * Math.pow(2, attempt), 4000)
          console.warn(
            `[OneClickQuoteSource] HTTP ${response.status} from 1Click (attempt ${
              attempt + 1
            }/${this.maxRetries + 1}). Backing off ${backoffMs}ms...`,
          )
          await new Promise((resolve) => setTimeout(resolve, backoffMs))
          continue
        }

        responseBody = (await response.json()) as OneClickRawResponse
        break
      } catch (err) {
        lastError = err as Error
        const backoffMs = Math.min(500 * Math.pow(2, attempt), 4000)
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
      }
    }

    if (!response || !responseBody) {
      throw (
        lastError ??
        new Error(`[OneClickQuoteSource] Failed to reach 1Click quote endpoint after retries`)
      )
    }

    if (!response.ok || !responseBody.quote) {
      const errMsg =
        responseBody?.message ||
        `1Click HTTP ${response.status}: ${JSON.stringify(responseBody)}`
      throw new Error(`[OneClickQuoteSource] Quote failed: ${errMsg}`)
    }

    // 6. Map to canonical QuoteResult / QuoteSnapshot
    const decimalsIn = request.decimalsIn ?? this.resolveDecimals(request.fromToken)
    const decimalsOut = request.decimalsOut ?? this.resolveDecimals(request.toToken)

    const amountInNum = Number(responseBody.quote.amountIn) / Math.pow(10, decimalsIn)
    const amountOutNum = Number(responseBody.quote.amountOut) / Math.pow(10, decimalsOut)
    const effectiveRate = amountInNum > 0 ? amountOutNum / amountInNum : 0

    const quotedAt = responseBody.timestamp ? Date.parse(responseBody.timestamp) : Date.now()
    const validitySec = responseBody.quote.timeEstimate ? Math.max(responseBody.quote.timeEstimate, 30) : 60
    const expiresAt = quotedAt + validitySec * 1000

    const result: QuoteResult = {
      quoteId: responseBody.correlationId ?? `1click_${quotedAt}_${Math.random().toString(36).slice(2, 7)}`,
      fromToken: request.fromToken,
      toToken: request.toToken,
      amountIn: responseBody.quote.amountIn,
      amountOut: responseBody.quote.amountOut,
      rate: effectiveRate,
      quotedAt,
      expiresAt,
      source: '1Click (dry-quote)',
      decimalsIn,
      decimalsOut,
      amountInUsd: responseBody.quote.amountInUsd,
      amountOutUsd: responseBody.quote.amountOutUsd,
      minAmountOut: responseBody.quote.minAmountOut,
      timeEstimate: responseBody.quote.timeEstimate,
      requestId: responseBody.correlationId,
      signature: responseBody.signature,
    }

    // 7. Store in short-TTL cache
    this.cache.set(cacheKey, {
      result,
      expiresAt: Date.now() + this.ttlMs,
    })

    return result
  }

  /**
   * Clear in-memory quote cache
   */
  clearCache(): void {
    this.cache.clear()
  }
}

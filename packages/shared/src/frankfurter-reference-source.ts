/**
 * Frankfurter FX Reference Rate Source (P5)
 *
 * Implements ReferenceRateSource using the free, open-source Frankfurter API (https://frankfurter.dev)
 * which tracks official daily European Central Bank (ECB) reference rates.
 *
 * PROVENANCE: European Central Bank (ECB) reference rates via Frankfurter API.
 * OUTAGE BEHAVIOR: If no reference rate is available, throws an error so the strategy engine WAITS.
 */

import type { ReferenceRate, ReferenceRateSource } from './adapters.js'

export interface FrankfurterOptions {
  baseUrl?: string
  ttlMs?: number
  allowStaleOnFailure?: boolean
}

interface CachedRate {
  rate: ReferenceRate
  cachedAt: number
}

interface FrankfurterApiResponse {
  amount: number
  base: string
  date: string
  rates: Record<string, number>
}

export class FrankfurterReferenceSource implements ReferenceRateSource {
  private readonly baseUrl: string
  private readonly ttlMs: number
  private readonly allowStaleOnFailure: boolean
  private cache = new Map<string, CachedRate>()

  constructor(options: FrankfurterOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://api.frankfurter.dev/v1'
    this.ttlMs = options.ttlMs ?? 3_600_000 // 1 hour (ECB updates daily)
    this.allowStaleOnFailure = options.allowStaleOnFailure ?? true
  }

  /**
   * Parse pair into standard base/quote ISO codes
   * e.g. "USDC/EURe" -> from=USD, to=EUR
   */
  private parseCurrencies(pair: string): { from: string; to: string } {
    const parts = pair.toUpperCase().split(/[-/_]/)
    if (parts.length === 2) {
      let from = parts[0]
      let to = parts[1]

      if (from.includes('USD')) from = 'USD'
      if (from.includes('EUR')) from = 'EUR'
      if (to.includes('USD')) to = 'USD'
      if (to.includes('EUR')) to = 'EUR'

      return { from, to }
    }

    // Default fallback
    return { from: 'USD', to: 'EUR' }
  }

  async getReferenceRate(pair: string): Promise<ReferenceRate> {
    const { from, to } = this.parseCurrencies(pair)
    const normalizedKey = `${from}/${to}`
    const now = Date.now()

    // 1. Check cache
    const cached = this.cache.get(normalizedKey)
    if (cached && now - cached.cachedAt < this.ttlMs) {
      return cached.rate
    }

    // 2. Fetch from Frankfurter API
    try {
      const url = `${this.baseUrl}/latest?from=${from}&to=${to}`
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'GetNear-FX-Agent/1.0',
        },
      })

      if (!res.ok) {
        throw new Error(`Frankfurter API returned HTTP ${res.status}: ${res.statusText}`)
      }

      const data = (await res.json()) as FrankfurterApiResponse
      const rateValue = data.rates[to]

      if (rateValue === undefined || typeof rateValue !== 'number' || rateValue <= 0) {
        throw new Error(`Invalid rate value received for ${to} from Frankfurter API`)
      }

      const result: ReferenceRate = {
        pair: `${from}/${to}`,
        rate: rateValue,
        timestamp: Date.parse(data.date) || now,
        source: 'ECB via Frankfurter API',
      }

      this.cache.set(normalizedKey, {
        rate: result,
        cachedAt: now,
      })

      return result
    } catch (err) {
      // 3. Fallback to stale cache if permitted
      if (this.allowStaleOnFailure && cached) {
        console.warn(
          `[FrankfurterReferenceSource] Outage fetching ${pair}, using stale cache from ${new Date(
            cached.cachedAt,
          ).toISOString()}:`,
          err,
        )
        return cached.rate
      }

      // Hard fail: No reference rate means the strategy must WAIT
      throw new Error(
        `[FrankfurterReferenceSource] Reference rate unavailable for ${pair}: strategy must WAIT. Underlying error: ${
          (err as Error).message
        }`,
      )
    }
  }

  /**
   * Clear in-memory cache
   */
  clearCache(): void {
    this.cache.clear()
  }
}

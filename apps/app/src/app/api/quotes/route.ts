import { NextRequest, NextResponse } from 'next/server'
import { OneClickQuoteSource } from '@getnear/shared'
import { FrankfurterReferenceSource } from '@getnear/shared'
import { computeDeviationBps, bpsToPercent } from '@getnear/shared'

const quoteSource = new OneClickQuoteSource()
const refSource = new FrankfurterReferenceSource()

const quoteCache = new Map<string, { timestamp: number; data: unknown }>()
const QUOTE_CACHE_TTL = 5000

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const amountStr = searchParams.get('amount') || '10'
    const fromToken = searchParams.get('fromToken') || 'USDC'
    const toToken = searchParams.get('toToken') || 'EURe'

    const amountNum = parseFloat(amountStr)
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }

    const cacheKey = `${fromToken}-${toToken}-${amountStr}`
    const cached = quoteCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < QUOTE_CACHE_TTL) {
      return NextResponse.json(cached.data)
    }

    // Atomic units for USDC (6 decimals)
    const atomicIn = BigInt(Math.round(amountNum * 1_000_000)).toString()

    // 1. Fetch dry quote (enforcing dry: true)
    const quote = await quoteSource.getQuote({
      fromToken,
      toToken,
      amountIn: atomicIn,
      dry: true,
    })

    // 2. Fetch ECB reference rate
    const ref = await refSource.getReferenceRate('USD/EUR')

    // 3. Compute basis point deviation
    const deviationBps = computeDeviationBps(quote.rate, ref.rate)

    const payload = {
      success: true,
      quote,
      reference: ref,
      deviationBps,
      deviationPercent: bpsToPercent(deviationBps),
      isSimulated: true,
      route: {
        pair: 'USDC/EURe',
        inputDecimals: 6,
        outputDecimals: 18,
        recommendedMinChunkUsd: 5,
      },
    }

    quoteCache.set(cacheKey, { timestamp: Date.now(), data: payload })
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[/api/quotes error]', err)
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to fetch quote' },
      { status: 500 },
    )
  }
}

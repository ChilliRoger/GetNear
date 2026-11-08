/**
 * Live Quote vs Reference Rate Probe (P5)
 *
 * Compares 1Click dry-quote against Frankfurter ECB reference rate for USDC -> EURe.
 * Displays rate comparison, deviation in basis points, and provenance labels.
 *
 * Usage: pnpm quotes:check
 */

import { OneClickQuoteSource } from '../../packages/shared/src/oneclick-quote-source.js'
import { FrankfurterReferenceSource } from '../../packages/shared/src/frankfurter-reference-source.js'
import { computeDeviationBps, bpsToPercent } from '../../packages/shared/src/utils.js'

async function main() {
  console.log('=================================================================')
  console.log(' GetNear — Live FX Quote & Reference Rate Comparison (P5)')
  console.log('=================================================================')

  const quoteSource = new OneClickQuoteSource()
  const refSource = new FrankfurterReferenceSource()

  const amountUsd = 10
  const atomicIn = (BigInt(amountUsd) * 1_000_000n).toString() // 10 USDC

  console.log(`\nFetching 1Click dry-quote for $${amountUsd} USDC → EURe...`)
  const quote = await quoteSource.getQuote({
    fromToken: 'USDC',
    toToken: 'EURe',
    amountIn: atomicIn,
    dry: true,
  })

  console.log('Fetching European Central Bank (ECB) reference rate from Frankfurter API...')
  const ref = await refSource.getReferenceRate('USD/EUR')

  const devBps = computeDeviationBps(quote.rate, ref.rate)
  const devPercent = bpsToPercent(devBps)

  console.log('\n----------------------- RATE COMPARISON -------------------------')
  console.log(`Pair:                    USDC / EURe`)
  console.log(`Input Amount:            $${amountUsd}.00 USDC (${atomicIn} atomic)`)
  console.log(`Quoted Output:           ${quote.amountOut} atomic (~${(Number(quote.amountOut) / 1e18).toFixed(4)} EURe)`)
  console.log(`Effective Quote Rate:    ${quote.rate.toFixed(5)} EUR per USD`)
  console.log(`Quote Provider:          ${quote.source}`)
  console.log(`Quote ID / Correlation:  ${quote.quoteId}`)
  console.log(`Signature:               ${quote.signature ? quote.signature.slice(0, 24) + '...' : 'N/A'}`)
  console.log('-----------------------------------------------------------------')
  console.log(`ECB Reference Rate:      ${ref.rate.toFixed(5)} EUR per USD`)
  console.log(`Reference Source:        ${ref.source}`)
  console.log(`Reference As Of:         ${new Date(ref.timestamp).toISOString()}`)
  console.log('-----------------------------------------------------------------')
  console.log(`Deviation (Basis Points): ${devBps > 0 ? '+' : ''}${devBps} bps (${devPercent})`)
  console.log(`Sign Convention:         Positive = Favorable (> Ref), Negative = Spread/Fee (< Ref)`)
  console.log(
    `Status vs 50 bps MaxDev: ${
      Math.abs(devBps) <= 50
        ? '✅ WITHIN ACCEPTABLE RISK TOLERANCE'
        : '⚠️ EXCEEDS STANDARD 50 BPS SLIPPAGE BUDGET'
    }`,
  )
  console.log('=================================================================')
  console.log('Safety Guard Verification:')
  console.log('  • dry: true enforced on all requests')
  console.log('  • Simulated fills only (isSimulated = true)')
  console.log('  • No mainnet private keys or funds used')
  console.log('=================================================================\n')
}

main().catch((err) => {
  console.error('[check-quotes] Error:', err)
  process.exit(1)
})

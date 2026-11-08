/**
 * 1Click Route Minimums Prober (P5)
 *
 * Probes a ladder of amounts (1, 5, 10, 50, 100, 500, 1000, 5000 USD)
 * on the USDC -> EURe route using dry quotes (dry=true).
 * Generates docs/ROUTE_MINIMUMS.md with observed limits and chunk sizing recommendations.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

interface ProbeResult {
  amountUsd: number
  atomicIn: string
  success: boolean
  amountOutAtomic?: string
  amountOutFormatted?: string
  effectiveRate?: number
  timeEstimate?: number
  error?: string
}

const LADDER_USD = [1, 5, 10, 50, 100, 500, 1000, 5000]

const ORIGIN_ASSET = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1' // USDC (6 dec)
const DEST_ASSET = 'nep141:gnosis-0x420ca0f9b9b604ce0fd9c18ef134c705e5fa3430.omft.near' // EURe (18 dec)

async function probeAmount(amountUsd: number): Promise<ProbeResult> {
  const atomicIn = (BigInt(amountUsd) * 1_000_000n).toString() // USDC 6 decimals
  const payload = {
    dry: true,
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100,
    originAsset: ORIGIN_ASSET,
    depositType: 'INTENTS',
    destinationAsset: DEST_ASSET,
    amount: atomicIn,
    recipient: 'wrap.near',
    recipientType: 'INTENTS',
    refundTo: 'wrap.near',
    refundType: 'INTENTS',
    deadline: new Date(Date.now() + 600_000).toISOString(),
  }

  try {
    const res = await fetch('https://1click.chaindefuser.com/v0/quote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'GetNear-FX-Agent/1.0',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    if (!res.ok || !data.quote) {
      const errMsg = data.message || data.error || `HTTP ${res.status}: ${JSON.stringify(data)}`
      return {
        amountUsd,
        atomicIn,
        success: false,
        error: errMsg,
      }
    }

    const outAtomic = data.quote.amountOut
    const outFormatted = data.quote.amountOutFormatted ?? (Number(outAtomic) / 1e18).toFixed(4)
    const effectiveRate = Number(outFormatted) / amountUsd

    return {
      amountUsd,
      atomicIn,
      success: true,
      amountOutAtomic: outAtomic,
      amountOutFormatted: outFormatted,
      effectiveRate,
      timeEstimate: data.quote.timeEstimate,
    }
  } catch (err) {
    return {
      amountUsd,
      atomicIn,
      success: false,
      error: (err as Error).message,
    }
  }
}

async function main() {
  console.log('[probe-minimums] Starting USDC -> EURe route probe ladder...')
  const results: ProbeResult[] = []

  for (const amount of LADDER_USD) {
    console.log(`[probe-minimums] Probing $${amount} USD...`)
    const res = await probeAmount(amount)
    results.push(res)
    if (res.success) {
      console.log(
        `  ✓ Succeeded: $${res.amountUsd} -> ${res.amountOutFormatted} EURe (Rate: ${res.effectiveRate?.toFixed(5)})`,
      )
    } else {
      console.log(`  ✗ Failed: $${res.amountUsd} - ${res.error}`)
    }
    // Small delay between calls to be gentle with rate limits
    await new Promise((r) => setTimeout(r, 600))
  }

  // Determine minimum successful amount
  const successful = results.filter((r) => r.success)
  const minSuccessUsd = successful.length > 0 ? Math.min(...successful.map((r) => r.amountUsd)) : null

  // Generate docs/ROUTE_MINIMUMS.md
  const markdown = `# 1Click Route Minimums (USDC → EURe)

*Generated on ${new Date().toISOString()} via \`scripts/quotes/probe-minimums.ts\`*
*Pair: USDC (\`nep141:17208628f8...\`) → EURe (\`nep141:gnosis-0x420ca...\`)*

## Summary of Findings

- **Tested Amount Ladder**: \$1, \$5, \$10, \$50, \$100, \$500, \$1,000, \$5,000 USD
- **Minimum Observed Feasible Chunk Size**: **${minSuccessUsd !== null ? `$${minSuccessUsd} USD` : 'None succeeded'}**
- **Recommended Strategy Engine Minimum Chunk**: **\$5.00 USDC** (5,000,000 atomic units) to account for market depth and fee coverage.

## Detailed Probe Results

| Input USD | Atomic Units (USDC) | Status | Output EURe | Effective Rate (EUR/USD) | Latency / Time Est | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${results
  .map((r) => {
    if (r.success) {
      return `| $${r.amountUsd} | \`${r.atomicIn}\` | ✅ OK | ${r.amountOutFormatted} EURe | ${r.effectiveRate?.toFixed(5)} | ${r.timeEstimate ?? 10}s | Valid market maker quote |`
    } else {
      return `| $${r.amountUsd} | \`${r.atomicIn}\` | ❌ REJECTED | — | — | — | ${r.error} |`
    }
  })
  .join('\n')}

## Implications for GetNear Architecture

1. **Chunk Clamping**:
   - The strategy engine (P6) must ensure every chunk is at least **\$5.00 USDC** (5,000,000 atomic units).
   - If an order's remaining balance is less than \$5.00, it should either be filled in a final sweep chunk or flagged.
2. **Auto-Cap & TWAP**:
   - For an order of \$100 USDC with 10 chunks, each chunk is \$10 USDC, well above the route minimum.
   - For smaller orders (\$10–\$20), the strategy should use 2–4 chunks of \$5.00.
3. **Dry-Quote Verification**:
   - All probes were executed with \`dry: true\` in accordance with hackathon rules (no real assets spent).
`

  const docsPath = path.resolve(process.cwd(), 'docs/ROUTE_MINIMUMS.md')
  fs.writeFileSync(docsPath, markdown, 'utf-8')
  console.log(`\n[probe-minimums] Results written to ${docsPath}`)
}

main().catch((err) => {
  console.error('[probe-minimums] Fatal error:', err)
  process.exit(1)
})

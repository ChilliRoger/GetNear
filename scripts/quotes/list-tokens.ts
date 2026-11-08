/**
 * 1Click Supported Tokens Fetcher & Snapshot Generator (P5)
 *
 * Fetches the supported token list from 1Click API (https://1click.chaindefuser.com/v0/tokens)
 * and generates docs/1CLICK_TOKENS.md documenting supported stablecoins, chains, and asset IDs.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface OneClickToken {
  assetId: string
  decimals: number
  blockchain: string
  symbol: string
  price?: number
  priceUpdatedAt?: string
  contractAddress?: string
}

const TOKENS_API_URL = 'https://1click.chaindefuser.com/v0/tokens'

async function fetchTokens(): Promise<OneClickToken[]> {
  console.log(`[list-tokens] Fetching tokens from ${TOKENS_API_URL}...`)
  const res = await fetch(TOKENS_API_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'GetNear-FX-Agent/1.0',
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch 1Click tokens: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as OneClickToken[]
  return data
}

async function main() {
  const tokens = await fetchTokens()
  console.log(`[list-tokens] Successfully fetched ${tokens.length} tokens from 1Click API.`)

  // Filter stablecoins
  const usdTokens = tokens.filter((t) =>
    ['USDC', 'USDT', 'USDE', 'DAI', 'FDUSD'].includes(t.symbol.toUpperCase()),
  )
  const euroTokens = tokens.filter(
    (t) =>
      t.symbol.toUpperCase().includes('EUR') ||
      t.assetId.toLowerCase().includes('eur') ||
      (t.contractAddress && t.contractAddress.toLowerCase().includes('eur')),
  )

  console.log('\n--- Euro Stablecoins Found ---')
  for (const t of euroTokens) {
    console.log(`- ${t.symbol} (${t.blockchain}, ${t.decimals} dec): ${t.assetId}`)
  }

  console.log('\n--- Primary USD Stablecoins on NEAR ---')
  const nearUsd = usdTokens.filter((t) => t.blockchain === 'near')
  for (const t of nearUsd) {
    console.log(`- ${t.symbol} (${t.blockchain}, ${t.decimals} dec): ${t.assetId}`)
  }

  // Generate docs/1CLICK_TOKENS.md
  const docsDir = path.resolve(process.cwd(), 'docs')
  const outputPath = path.join(docsDir, '1CLICK_TOKENS.md')

  const markdownContent = `# 1Click Supported Tokens Snapshot

*Generated on ${new Date().toISOString()} via \`scripts/quotes/list-tokens.ts\`*
*Source: \`${TOKENS_API_URL}\` (${tokens.length} total tokens registered)*

## Euro Stablecoins

${
  euroTokens.length > 0
    ? euroTokens
        .map(
          (t) =>
            `- **${t.symbol}** (${t.blockchain}): \`${t.assetId}\` (Decimals: ${t.decimals}${
              t.price ? `, Price: $${t.price}` : ''
            })`,
        )
        .join('\n')
    : '_No euro stablecoins found in current 1Click token registry._'
}

## Primary NEAR Stablecoins (USD)

${nearUsd
  .map(
    (t) =>
      `- **${t.symbol}**: \`${t.assetId}\` (Decimals: ${t.decimals}${
        t.price ? `, Price: $${t.price}` : ''
      })`,
  )
  .join('\n')}

## Recommended Demo Pair for GetNear

- **Input Token**: **USDC** (NEAR native / NEP-141)
  - Symbol: \`USDC\`
  - Blockchain: \`near\`
  - Decimals: \`6\`
  - Asset ID: \`nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1\`
- **Output Token**: **EURe** (Monerium Euro on Gnosis via NEAR Intents)
  - Symbol: \`EURe\`
  - Blockchain: \`gnosis\` (bridged/swapped via NEAR Intents)
  - Decimals: \`18\`
  - Asset ID: \`nep141:gnosis-0x420ca0f9b9b604ce0fd9c18ef134c705e5fa3430.omft.near\`

## Full Cross-Chain Stablecoin Summary

| Symbol | Blockchain | Decimals | Asset ID | Current USD Price |
| :--- | :--- | :--- | :--- | :--- |
${tokens
  .filter((t) =>
    ['USDC', 'USDT', 'EURE', 'EURC', 'DAI'].includes(t.symbol.toUpperCase()),
  )
  .map(
    (t) =>
      `| ${t.symbol} | ${t.blockchain} | ${t.decimals} | \`${t.assetId}\` | ${
        t.price !== undefined ? `$${t.price.toFixed(4)}` : 'N/A'
      } |`,
  )
  .join('\n')}
`

  fs.writeFileSync(outputPath, markdownContent, 'utf-8')
  console.log(`\n[list-tokens] Written token snapshot to ${outputPath}`)
}

main().catch((err) => {
  console.error('[list-tokens] Error:', err)
  process.exit(1)
})

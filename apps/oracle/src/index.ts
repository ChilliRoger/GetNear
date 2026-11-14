/**
 * GetNear Oracle: market recorder + read-only price API.
 *
 * Every 30 seconds it records a live 1Click dry quote (indicative, never executed) next to the ECB reference
 * rate (via Frankfurter) and serves the history. The on-chain agent (apps/agent) does its own quoting and
 * decision making; this service only feeds the dashboard's charts and market-score panel. It holds no orders
 * and signs nothing.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  OneClickQuoteSource,
  FrankfurterReferenceSource,
  computeDeviationBps,
  bpsToPercent,
  computePriceScore,
  computeDivergenceScore,
  strategyConfig,
} from '@getnear/shared'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const DB_PATH = process.env.GETNEAR_ORACLE_DB_PATH || join(DATA_DIR, 'prices.db')
const PORT = Number(process.env.PORT || 38174)
const RECORD_INTERVAL = 30_000
const PAIR = 'USDC/EURe'
const DEFAULT_MAX_DEVIATION_BPS = 120

const quoteSource = new OneClickQuoteSource()
const refRateSource = new FrankfurterReferenceSource()

// ---------- SQLite ----------

const dbDir = dirname(DB_PATH)
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')
db.exec(`
  CREATE TABLE IF NOT EXISTS prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    pair TEXT NOT NULL,
    ref_price REAL NOT NULL,
    quote_price REAL NOT NULL,
    deviation_bps INTEGER,
    quote_id TEXT,
    source TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_prices_pair_ts ON prices(pair, timestamp);
`)

interface PriceRow {
  timestamp: number
  ref_price: number
  quote_price: number
  deviation_bps: number | null
  quote_id: string | null
  source: string | null
}

const insertPrice = db.prepare(
  `INSERT INTO prices (timestamp, pair, ref_price, quote_price, deviation_bps, quote_id, source)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
)
const latestPrice = db.prepare('SELECT * FROM prices WHERE pair = ? ORDER BY timestamp DESC LIMIT 1')

// ---------- Market observation loop ----------

async function record() {
  try {
    const now = Math.floor(Date.now() / 1000)
    const quote = await quoteSource.getQuote({ fromToken: 'USDC', toToken: 'EURe', amountIn: '10000000', dry: true })
    const ref = await refRateSource.getReferenceRate('USD/EUR')
    const devBps = computeDeviationBps(quote.rate, ref.rate)
    insertPrice.run(now, PAIR, ref.rate, quote.rate, devBps, quote.quoteId, `${quote.source} / ${ref.source}`)
    console.log(
      `[${new Date().toISOString()}] Recorded ${PAIR}: quote=${quote.rate.toFixed(5)} ecb=${ref.rate.toFixed(5)} dev=${devBps} bps (${bpsToPercent(devBps)})`,
    )
  } catch (e) {
    console.error('[Oracle] market observation error:', (e as Error).message)
  }
}

// ---------- REST API (read-only) ----------

const app = new Hono()
app.use('/*', cors({ origin: (origin) => origin ?? '', allowMethods: ['GET', 'OPTIONS'] }))

app.get('/health', (c) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM prices').get() as { count: number }
  const last = latestPrice.get(PAIR) as PriceRow | undefined
  return c.json({ ok: true, recordings: count.count, lastRecordedAt: last?.timestamp ?? null })
})

app.get('/prices/current', async (c) => {
  try {
    const row = latestPrice.get(PAIR) as PriceRow | undefined
    if (!row) {
      // No recordings yet: answer from a live read instead of failing.
      const quote = await quoteSource.getQuote({ fromToken: 'USDC', toToken: 'EURe', amountIn: '10000000', dry: true })
      const ref = await refRateSource.getReferenceRate('USD/EUR')
      const devBps = computeDeviationBps(quote.rate, ref.rate)
      return c.json({
        [PAIR]: {
          quotePrice: quote.rate,
          refPrice: ref.rate,
          deviationBps: devBps,
          deviationPercent: bpsToPercent(devBps),
          timestamp: Math.floor(Date.now() / 1000),
          quoteId: quote.quoteId,
          provenance: '1Click dry-quote & ECB via Frankfurter',
        },
      })
    }
    return c.json({
      [PAIR]: {
        quotePrice: row.quote_price,
        refPrice: row.ref_price,
        deviationBps: row.deviation_bps,
        deviationPercent: bpsToPercent(row.deviation_bps ?? 0),
        timestamp: row.timestamp,
        quoteId: row.quote_id,
        provenance: row.source || '1Click dry-quote & ECB via Frankfurter',
      },
    })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})

app.get('/prices/history', (c) => {
  const hours = Math.min(Math.max(Number(c.req.query('hours') || 24) || 24, 1), 168)
  const since = Math.floor(Date.now() / 1000) - hours * 3600
  const rows = db
    .prepare('SELECT timestamp, quote_price, ref_price, deviation_bps FROM prices WHERE pair = ? AND timestamp >= ? ORDER BY timestamp ASC')
    .all(PAIR, since) as PriceRow[]
  return c.json({
    pair: PAIR,
    points: rows.map((r) => ({
      timestamp: r.timestamp,
      quotePrice: r.quote_price,
      refPrice: r.ref_price,
      deviationBps: r.deviation_bps,
    })),
  })
})

/**
 * Market-only view of the agent's timing score: the two components that do not depend on a specific order
 * (price vs its 24h average, quote vs ECB). Deadline urgency is per order and is NOT included here.
 */
app.get('/api/strategy/market', (c) => {
  const row = latestPrice.get(PAIR) as PriceRow | undefined
  if (!row) return c.json({ available: false, reason: 'No market samples recorded yet' })
  const since = Math.floor(Date.now() / 1000) - 24 * 3600
  const avgRow = db.prepare('SELECT AVG(quote_price) AS avg, COUNT(*) AS n FROM prices WHERE pair = ? AND timestamp >= ?').get(PAIR, since) as {
    avg: number | null
    n: number
  }
  const avg24h = avgRow.n >= 3 ? avgRow.avg : null
  const priceScore = computePriceScore(row.quote_price, avg24h)
  const { score: divergenceScore, deviationBps } = computeDivergenceScore(row.quote_price, row.ref_price, DEFAULT_MAX_DEVIATION_BPS)
  const wPrice = strategyConfig.weightPrice
  const wDiv = strategyConfig.weightDivergence
  return c.json({
    available: true,
    quoteRate: row.quote_price,
    referenceRate: row.ref_price,
    avg24hRate: avg24h,
    samples24h: avgRow.n,
    deviationBps,
    maxDeviationBps: DEFAULT_MAX_DEVIATION_BPS,
    priceScore: Math.round(priceScore),
    divergenceScore: Math.round(divergenceScore),
    marketScore: Math.round((priceScore * wPrice + divergenceScore * wDiv) / (wPrice + wDiv)),
    weights: { price: wPrice, divergence: wDiv, urgency: strategyConfig.weightUrgency },
    note: 'Market-only score. Deadline urgency (40%) is added per order by the agent.',
    timestamp: row.timestamp,
  })
})

// ---------- Bootstrap ----------

async function main() {
  await record()
  setInterval(record, RECORD_INTERVAL)
  console.log(`[GetNear Oracle] listening on port ${PORT} (read-only market recorder)`)
  serve({ fetch: app.fetch, port: PORT })
}

main().catch((err) => {
  console.error('[Oracle] fatal:', err)
  process.exit(1)
})

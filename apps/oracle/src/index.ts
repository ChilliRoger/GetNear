/**
 * GetNear Oracle & Strategy Service (P6)
 *
 * Exposes REST API for market prices, strategy decisions, and simulated order management.
 * Integrates live 1Click dry-quotes and Frankfurter ECB reference rates.
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
  MockExecutor,
  MockApprovalGate,
} from '@getnear/shared'
import {
  evaluateStrategy,
  computeAdaptiveChunkSize,
  strategyConfig,
  updateStrategyConfig,
  type MarketInputs,
  type OrderContext,
} from './strategy.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const DB_PATH = join(DATA_DIR, 'prices.db')
const PORT = Number(process.env.PORT || 38174)
const RECORD_INTERVAL = 30_000 // 30 seconds
const GETNEAR_MODE = process.env.GETNEAR_MODE || 'live'
const DEMO_MODE = process.env.DEMO_MODE !== 'false'

// ---------- Live & Domain Adapters ----------

const quoteSource = new OneClickQuoteSource()
const refRateSource = new FrankfurterReferenceSource()
const executor = new MockExecutor()
const approvalGate = new MockApprovalGate()

// Supported stablecoins for GetNear testnet FX
const SUPPORTED_TOKENS: Record<string, { decimals: number; symbol: string }> = {
  USDC: { decimals: 6, symbol: 'USDC' },
  EURE: { decimals: 18, symbol: 'EURe' },
  EURC: { decimals: 18, symbol: 'EURe' }, // alias to EURe
}

// ---------- SQLite Setup ----------

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

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

  CREATE TABLE IF NOT EXISTS trade_orders (
    id TEXT PRIMARY KEY,
    from_token TEXT NOT NULL,
    to_token TEXT NOT NULL,
    input_amount TEXT NOT NULL,
    filled_amount TEXT DEFAULT '0',
    output_received TEXT DEFAULT '0',
    deadline INTEGER NOT NULL,
    max_dev_bps INTEGER DEFAULT 120,
    status TEXT DEFAULT 'PENDING',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    timing_score INTEGER,
    strategy_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS cre_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    action TEXT NOT NULL,
    order_id TEXT,
    chunk_amount TEXT,
    result TEXT,
    tx_hash TEXT,
    error TEXT,
    duration_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS strategy_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    order_id TEXT,
    score INTEGER NOT NULL,
    action TEXT NOT NULL,
    reason TEXT NOT NULL,
    price_score INTEGER,
    divergence_score INTEGER,
    urgency_score INTEGER,
    chunk_amount TEXT,
    chunk_multiplier INTEGER,
    quote_id TEXT,
    deviation_bps INTEGER,
    quote_rate REAL,
    reference_rate REAL
  );
`)

// Migration check for trade_orders columns if pre-existing
try {
  db.exec('ALTER TABLE trade_orders ADD COLUMN max_dev_bps INTEGER DEFAULT 120;')
} catch {
  // column already exists
}

const insertDecision = db.prepare(
  `INSERT INTO strategy_decisions (
    timestamp, order_id, score, action, reason,
    price_score, divergence_score, urgency_score,
    chunk_amount, chunk_multiplier, quote_id,
    deviation_bps, quote_rate, reference_rate
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
)

const updateOrderStrategy = db.prepare(
  'UPDATE trade_orders SET timing_score = ?, strategy_reason = ?, updated_at = ? WHERE id = ?'
)

const insertPrice = db.prepare(
  `INSERT INTO prices (timestamp, pair, ref_price, quote_price, deviation_bps, quote_id, source)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
)

// ---------- Dynamic Market Observation Loop ----------

async function record() {
  try {
    const now = Math.floor(Date.now() / 1000)

    // 1. Fetch live dry quote from 1Click
    const quote = await quoteSource.getQuote({
      fromToken: 'USDC',
      toToken: 'EURe',
      amountIn: '10000000', // $10 USDC probe
      dry: true,
    })

    // 2. Fetch live reference rate from European Central Bank
    const ref = await refRateSource.getReferenceRate('USD/EUR')

    const devBps = computeDeviationBps(quote.rate, ref.rate)

    insertPrice.run(
      now,
      'USDC/EURe',
      ref.rate,
      quote.rate,
      devBps,
      quote.quoteId,
      `${quote.source} / ${ref.source}`
    )

    console.log(
      `[${new Date().toISOString()}] Recorded USDC/EURe: Quote=${quote.rate.toFixed(5)}, Ref=${ref.rate.toFixed(
        5
      )}, Dev=${devBps} bps (${bpsToPercent(devBps)})`
    )
  } catch (e) {
    console.error('[Oracle] Market observation loop error:', (e as Error).message)
  }
}

// ---------- Hono REST API ----------

const app = new Hono()
app.use('/*', cors())

app.get('/health', (c) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM prices').get() as { count: number }
  const ordersCount = db.prepare('SELECT COUNT(*) as count FROM trade_orders').get() as { count: number }
  return c.json({
    ok: true,
    mode: GETNEAR_MODE,
    isMock: false,
    simulated: true,
    recordings: count.count,
    ordersCount: ordersCount.count,
    banner: 'TESTNET · DYNAMIC ADAPTIVE TWAP',
  })
})

app.get('/prices/current', async (c) => {
  try {
    const latestRow = db.prepare(
      'SELECT * FROM prices WHERE pair = ? ORDER BY timestamp DESC LIMIT 1'
    ).get('USDC/EURe') as any

    if (!latestRow) {
      // Fetch live directly if DB has no recordings yet
      const quote = await quoteSource.getQuote({ fromToken: 'USDC', toToken: 'EURe', amountIn: '10000000', dry: true })
      const ref = await refRateSource.getReferenceRate('USD/EUR')
      const devBps = computeDeviationBps(quote.rate, ref.rate)
      return c.json({
        'USDC/EURe': {
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
      'USDC/EURe': {
        quotePrice: latestRow.quote_price,
        refPrice: latestRow.ref_price,
        deviationBps: latestRow.deviation_bps,
        deviationPercent: bpsToPercent(latestRow.deviation_bps ?? 0),
        timestamp: latestRow.timestamp,
        quoteId: latestRow.quote_id,
        provenance: latestRow.source || '1Click dry-quote & ECB via Frankfurter',
      },
    })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})

app.get('/prices/history', (c) => {
  let pair = c.req.query('pair') || 'USDC/EURe'
  if (pair === 'EURC/USD' || pair === 'USD/EUR') pair = 'USDC/EURe'
  const hours = Math.min(Number(c.req.query('hours') || 24), 168)
  const since = Math.floor(Date.now() / 1000) - hours * 3600
  const rows = db.prepare(
    'SELECT timestamp, quote_price, ref_price, deviation_bps FROM prices WHERE pair = ? AND timestamp >= ? ORDER BY timestamp ASC'
  ).all(pair, since) as any[]

  const points = rows.map((r: any) => ({
    timestamp: r.timestamp,
    quotePrice: r.quote_price,
    refPrice: r.ref_price,
    deviationBps: r.deviation_bps,
    chainlink: r.ref_price,
    fynd: r.quote_price,
    divergence_pct: r.deviation_bps != null ? Math.abs(r.deviation_bps) / 100 : 0,
  }))
  return c.json({ pair, points, isSimulated: true })
})

app.get('/api/prices/comparison', async (c) => {
  try {
    const latestRow = db.prepare(
      'SELECT * FROM prices WHERE pair = ? ORDER BY timestamp DESC LIMIT 1'
    ).get('USDC/EURe') as any

    const ref = latestRow ? latestRow.ref_price : (await refRateSource.getReferenceRate('USD/EUR')).rate
    const quote = latestRow ? latestRow.quote_price : (await quoteSource.getQuote({ fromToken: 'USDC', toToken: 'EURe', amountIn: '10000000', dry: true })).rate
    const devBps = latestRow ? latestRow.deviation_bps : computeDeviationBps(quote, ref)

    return c.json({
      chainlink: { price: ref, updatedAt: latestRow?.timestamp || Math.floor(Date.now() / 1000) },
      fynd: { price: quote, updatedAt: latestRow?.timestamp || Math.floor(Date.now() / 1000) },
      uniswap: { price: quote, updatedAt: latestRow?.timestamp || Math.floor(Date.now() / 1000) },
      quotePrice: quote,
      referencePrice: ref,
      divergenceBps: devBps,
      avg24h: ref,
      provenance: '1Click dry-quote & ECB via Frankfurter',
      isSimulated: true,
    })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})

// ---------- Dynamic Order Intake & Management ----------

app.post('/api/trades', async (c) => {
  const body = await c.req.json()

  const validTokens = ['USDC', 'EURE', 'EURC']
  const fromUpper = (body.fromToken || 'USDC').toUpperCase()
  const toUpper = (body.toToken || 'EURE').toUpperCase()

  if (!validTokens.includes(fromUpper)) {
    return c.json({ error: `Invalid fromToken: must be one of ${validTokens.join(', ')}` }, 400)
  }
  if (!validTokens.includes(toUpper)) {
    return c.json({ error: `Invalid toToken: must be one of ${validTokens.join(', ')}` }, 400)
  }
  if (fromUpper === toUpper) {
    return c.json({ error: 'fromToken and toToken must be different' }, 400)
  }
  if (body.deadline == null || typeof body.deadline !== 'number' || !Number.isFinite(body.deadline)) {
    return c.json({ error: 'Invalid deadline: must be a finite integer timestamp' }, 400)
  }
  if (!body.inputAmount || typeof body.inputAmount !== 'string') {
    return c.json({ error: 'Invalid inputAmount' }, 400)
  }

  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const maxDevBps = Number(body.maxDeviationBps) || strategyConfig.defaultMaxDeviationBps

  // Auto-cap: orders <= $100 USDC (100,000,000 atomic) become Active immediately.
  // Larger orders require Sputnik DAO council approval.
  const autoCap = 100_000_000n
  const inputBigInt = BigInt(body.inputAmount)
  const initialStatus = inputBigInt <= autoCap ? 'Active' : 'Pending'

  db.prepare(
    `INSERT INTO trade_orders (id, from_token, to_token, input_amount, deadline, max_dev_bps, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, fromUpper, toUpper, body.inputAmount, body.deadline, maxDevBps, initialStatus, now, now)

  if (initialStatus === 'Pending') {
    await approvalGate.requestApproval({ orderId: id, totalIn: body.inputAmount, requester: 'chilliroger-operator.testnet' })
  }

  return c.json({ id, status: initialStatus, inputAmount: body.inputAmount, maxDeviationBps: maxDevBps, isSimulated: true }, 201)
})

app.get('/api/trades', (c) => {
  const status = c.req.query('status')
  if (status) {
    const statuses = status.split(',').map((s) => s.trim()).filter(Boolean)
    if (statuses.length > 0) {
      const placeholders = statuses.map(() => '?').join(', ')
      const rows = db.prepare(`SELECT * FROM trade_orders WHERE UPPER(status) IN (${placeholders}) ORDER BY created_at DESC`).all(...statuses.map((x) => x.toUpperCase()))
      return c.json(rows)
    }
  }
  const rows = db.prepare('SELECT * FROM trade_orders ORDER BY created_at DESC').all()
  return c.json(rows)
})

app.get('/api/trades/:id', (c) => {
  const row = db.prepare('SELECT * FROM trade_orders WHERE id = ?').get(c.req.param('id'))
  return row ? c.json(row) : c.json({ error: 'Not found' }, 404)
})

app.post('/api/trades/:id/approve', async (c) => {
  const id = c.req.param('id')
  approvalGate.castVote(id, true)
  db.prepare('UPDATE trade_orders SET status = ?, updated_at = ? WHERE id = ?')
    .run('Active', Math.floor(Date.now() / 1000), id)
  return c.json({ ok: true, status: 'Active', isSimulated: true })
})

app.post('/api/trades/:id/cancel', (c) => {
  db.prepare('UPDATE trade_orders SET status = ?, updated_at = ? WHERE id = ?')
    .run('Cancelled', Math.floor(Date.now() / 1000), c.req.param('id'))
  return c.json({ ok: true })
})

// ---------- Dynamic Strategy Engine Endpoint ----------

app.get('/api/strategy/next', async (c) => {
  const now = Math.floor(Date.now() / 1000)

  // 1. Auto-expire past deadline orders
  db.prepare("UPDATE trade_orders SET status = 'Expired', updated_at = ? WHERE status IN ('Pending', 'Active', 'APPROVED', 'FILLING') AND deadline < ?")
    .run(now, now)

  // 2. Query next active order
  const orderRow = db.prepare(
    "SELECT * FROM trade_orders WHERE status IN ('Active', 'APPROVED', 'FILLING') ORDER BY created_at ASC LIMIT 1"
  ).get() as any

  if (!orderRow) {
    insertDecision.run(
      now, null, 0, 'WAIT', 'No active orders in treasury queue',
      null, null, null, null, null, null, null, null, null
    )
    return c.json({ action: 'WAIT' as const, reason: 'No active orders in treasury queue', score: 0 })
  }

  // 3. Fetch fresh market quote & reference dynamically
  let quoteRate = 0.88756
  let refRate: number | null = 0.89566
  let quoteId = `probe_${now}`
  let quoteExpiresAt = Date.now() + 60_000

  try {
    const q = await quoteSource.getQuote({ fromToken: 'USDC', toToken: 'EURe', amountIn: '10000000', dry: true })
    const r = await refRateSource.getReferenceRate('USD/EUR')
    quoteRate = q.rate
    refRate = r.rate
    quoteId = q.quoteId
    quoteExpiresAt = q.expiresAt
  } catch (err) {
    console.warn('[Oracle] Fallback to recent DB recording:', (err as Error).message)
    const latestRow = db.prepare('SELECT * FROM prices WHERE pair = ? ORDER BY timestamp DESC LIMIT 1').get('USDC/EURe') as any
    if (latestRow) {
      quoteRate = latestRow.quote_price
      refRate = latestRow.ref_price
    }
  }

  // Rolling 24h average from DB
  const avgRow = db.prepare('SELECT AVG(ref_price) as avg_price FROM prices WHERE timestamp >= ?').get(now - 86400) as any
  const avg24h = avgRow?.avg_price || refRate

  const marketInputs: MarketInputs = {
    quoteRate,
    referenceRate: refRate,
    avg24hRate: avg24h,
    quoteExpiresAt,
    quoteId,
  }

  const orderCtx: OrderContext = {
    id: orderRow.id,
    inputAmount: BigInt(orderRow.input_amount),
    filledAmount: BigInt(orderRow.filled_amount || '0'),
    createdAt: orderRow.created_at,
    deadline: orderRow.deadline,
    maxDeviationBps: orderRow.max_dev_bps || strategyConfig.defaultMaxDeviationBps,
    status: orderRow.status,
    fromToken: orderRow.from_token,
    toToken: orderRow.to_token,
  }

  // 4. Evaluate strategy rules & guards
  const decision = evaluateStrategy(marketInputs, orderCtx, now)

  // 5. Compute adaptive chunk size
  const chunkAmount = decision.action === 'EXECUTE'
    ? computeAdaptiveChunkSize({
        inputAmount: orderCtx.inputAmount,
        filledAmount: orderCtx.filledAmount,
        deadlineSec: orderCtx.deadline,
        createdAtSec: orderCtx.createdAt,
        nowSec: now,
        timingScore: decision.score,
      })
    : 0n

  // 6. Persist decision to SQLite
  insertDecision.run(
    now,
    orderRow.id,
    decision.score,
    decision.action,
    decision.reason,
    decision.breakdown.priceScore,
    decision.breakdown.divergenceScore,
    decision.breakdown.urgencyScore,
    chunkAmount.toString(),
    decision.chunkMultiplier,
    quoteId,
    decision.deviationBps,
    quoteRate,
    refRate
  )

  updateOrderStrategy.run(decision.score, decision.reason, now, orderRow.id)

  return c.json({
    action: decision.action,
    orderId: orderRow.id,
    chunkAmount: chunkAmount.toString(),
    score: decision.score,
    reason: decision.reason,
    breakdown: decision.breakdown,
    deviationBps: decision.deviationBps,
    deviationPercent: decision.deviationBps !== null ? bpsToPercent(decision.deviationBps) : null,
    quoteRate,
    referenceRate: refRate,
    quoteId,
    isSimulated: true,
  })
})

app.get('/api/strategy/decisions', (c) => {
  const limit = Math.min(Number(c.req.query('limit') || 100), 500)
  const orderId = c.req.query('order_id')
  const rows = orderId
    ? db.prepare('SELECT * FROM strategy_decisions WHERE order_id = ? ORDER BY timestamp DESC LIMIT ?').all(orderId, limit)
    : db.prepare('SELECT * FROM strategy_decisions ORDER BY timestamp DESC LIMIT ?').all(limit)
  return c.json(rows)
})

// routeMinimumAtomic is a bigint, which JSON cannot carry: expose it as a string.
const publicConfig = () => ({ ...strategyConfig, routeMinimumAtomic: strategyConfig.routeMinimumAtomic.toString() })

app.get('/api/strategy/config', (c) => c.json(publicConfig()))

// Allowed tunables and their valid ranges. Anything else (e.g. routeMinimumAtomic as a bigint) is rejected.
const CONFIG_RANGES: Record<string, [number, number]> = {
  weightPrice: [0, 1],
  weightDivergence: [0, 1],
  weightUrgency: [0, 1],
  executeThreshold: [0, 100],
  aggressiveThreshold: [0, 100],
  urgencyOverride: [0, 100],
  defaultMaxDeviationBps: [1, 5000],
  defaultMaxChunkPercent: [0.01, 1],
}

app.put('/api/strategy/config', async (c) => {
  const adminToken = (process.env.ORACLE_ADMIN_TOKEN ?? '').trim()
  if (adminToken) {
    const header = c.req.header('authorization') ?? ''
    if (header !== `Bearer ${adminToken}`) return c.json({ error: 'Unauthorized' }, 401)
  }
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'Body must be a JSON object' }, 400)
  }
  const patch: Record<string, number> = {}
  for (const [key, value] of Object.entries(body)) {
    const range = CONFIG_RANGES[key]
    if (!range) return c.json({ error: `Unknown or read-only setting: ${key}` }, 400)
    if (typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1]) {
      return c.json({ error: `${key} must be a number between ${range[0]} and ${range[1]}` }, 400)
    }
    patch[key] = value
  }
  const merged = { ...strategyConfig, ...patch }
  const weightSum = merged.weightPrice + merged.weightDivergence + merged.weightUrgency
  if (Math.abs(weightSum - 1) > 0.01) {
    return c.json({ error: `weightPrice + weightDivergence + weightUrgency must sum to 1 (got ${weightSum.toFixed(2)})` }, 400)
  }
  if (merged.aggressiveThreshold < merged.executeThreshold) {
    return c.json({ error: 'aggressiveThreshold must be >= executeThreshold' }, 400)
  }
  updateStrategyConfig(patch)
  return c.json(publicConfig(), 200)
})

// ---------- Demo speed (time-compression for the fill simulation) ----------

let demoSpeed: 1 | 10 = 1
const FILL_TICK_MS = 15_000
let fillTimer: ReturnType<typeof setInterval> | null = null

function scheduleFillTick() {
  if (fillTimer) clearInterval(fillTimer)
  fillTimer = setInterval(dynamicFillTick, FILL_TICK_MS / demoSpeed)
}

app.get('/api/demo/speed', (c) => c.json({ speed: demoSpeed, demoMode: DEMO_MODE }))

app.post('/api/demo/speed', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { speed?: unknown } | null
  if (body?.speed !== 1 && body?.speed !== 10) {
    return c.json({ error: 'speed must be 1 or 10' }, 400)
  }
  demoSpeed = body.speed
  if (DEMO_MODE) scheduleFillTick()
  return c.json({ speed: demoSpeed })
})

// ---------- Dynamic Fill Simulation Loop ----------

async function dynamicFillTick() {
  try {
    const now = Math.floor(Date.now() / 1000)
    const activeOrders = db.prepare(
      "SELECT * FROM trade_orders WHERE status IN ('Active', 'APPROVED', 'FILLING') ORDER BY created_at ASC"
    ).all() as any[]

    for (const order of activeOrders) {
      const inputAmount = BigInt(order.input_amount)
      const filledAmount = BigInt(order.filled_amount || '0')
      const remaining = inputAmount - filledAmount

      if (remaining <= 0n) {
        db.prepare("UPDATE trade_orders SET status = 'Completed', updated_at = ? WHERE id = ?").run(now, order.id)
        continue
      }

      // Fetch live quote for this chunk
      const quote = await quoteSource.getQuote({
        fromToken: order.from_token,
        toToken: order.to_token,
        amountIn: '10000000',
        dry: true,
      })
      const ref = await refRateSource.getReferenceRate('USD/EUR')

      const decision = evaluateStrategy(
        {
          quoteRate: quote.rate,
          referenceRate: ref.rate,
          avg24hRate: ref.rate,
          quoteExpiresAt: quote.expiresAt,
          quoteId: quote.quoteId,
        },
        {
          id: order.id,
          inputAmount,
          filledAmount,
          createdAt: order.created_at,
          deadline: order.deadline,
          maxDeviationBps: order.max_dev_bps || strategyConfig.defaultMaxDeviationBps,
          status: order.status,
          fromToken: order.from_token,
          toToken: order.to_token,
        },
        now
      )

      if (decision.action !== 'EXECUTE') {
        continue
      }

      const chunk = computeAdaptiveChunkSize({
        inputAmount,
        filledAmount,
        deadlineSec: order.deadline,
        createdAtSec: order.created_at,
        nowSec: now,
        timingScore: decision.score,
      })

      if (chunk <= 0n) continue

      // Execute simulated fill (labeled isSimulated: true)
      const simulatedOutput = BigInt(Math.floor(Number(chunk) * quote.rate))
      const execResult = await executor.executeChunk({
        orderId: order.id,
        amountIn: chunk.toString(),
        quoteRef: quote.quoteId,
        deviationBps: decision.deviationBps ?? 0,
        simulatedOut: simulatedOutput.toString(),
      })

      const newFilled = filledAmount + chunk
      const newOutput = BigInt(order.output_received || '0') + simulatedOutput
      const newStatus = newFilled >= inputAmount ? 'Completed' : 'FILLING'

      db.prepare(
        `UPDATE trade_orders SET filled_amount = ?, output_received = ?, status = ?, updated_at = ? WHERE id = ?`
      ).run(newFilled.toString(), newOutput.toString(), newStatus, now, order.id)

      db.prepare(
        `INSERT INTO cre_runs (started_at, action, order_id, chunk_amount, result, tx_hash, error, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(now, 'SWAP', order.id, chunk.toString(), newStatus, execResult.txHash, null, 12)

      console.log(
        `[Oracle] Filled chunk of ${chunk} for order ${order.id.slice(0, 8)}: Status=${newStatus}, TxHash=${execResult.txHash} (SIMULATED)`
      )
    }
  } catch (err) {
    console.error('[Oracle] Dynamic fill simulation error:', err)
  }
}

// ---------- Main Bootstrap ----------

async function main() {
  await record()
  setInterval(record, RECORD_INTERVAL)

  if (DEMO_MODE) {
    scheduleFillTick() // every 15s (1x) or 1.5s (10x) in demo mode
    console.log('[GetNear Oracle] Dynamic fill engine active (evaluating every 15s)')
  }

  console.log(`[GetNear Oracle] Strategy & Decision API listening on port ${PORT} (${GETNEAR_MODE.toUpperCase()})`)
  serve({ fetch: app.fetch, port: PORT })
}

main().catch(console.error)

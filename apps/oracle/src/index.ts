import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  MockQuoteSource,
  MockReferenceRateSource,
  MockExecutor,
  MockApprovalGate,
} from '@getnear/shared'
import {
  computeTimingScore,
  adaptiveChunkSize,
  strategyConfig,
  updateStrategyConfig,
  type PriceSnapshot,
  type OrderContext,
} from './strategy.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const DB_PATH = join(DATA_DIR, 'prices.db')
const PORT = Number(process.env.PORT || 38174)
const RECORD_INTERVAL = 30_000 // 30 seconds
const GETNEAR_MODE = process.env.GETNEAR_MODE || 'mock'
const DEMO_MODE = process.env.DEMO_MODE !== 'false'

// ---------- Domain Adapters (Mock for P2) ----------

const quoteSource = new MockQuoteSource()
const refRateSource = new MockReferenceRateSource()
const executor = new MockExecutor()
const approvalGate = new MockApprovalGate()

// Supported stablecoins for GetNear testnet FX
const SUPPORTED_TOKENS: Record<string, { decimals: number; symbol: string }> = {
  USDC: { decimals: 6, symbol: 'USDC' },
  EURC: { decimals: 6, symbol: 'EURC' },
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
    chainlink_price REAL NOT NULL,
    chainlink_round_id TEXT,
    chainlink_updated_at INTEGER,
    fynd_price REAL,
    fynd_solve_ms INTEGER,
    uniswap_price REAL
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
    status TEXT DEFAULT 'PENDING',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    mode TEXT DEFAULT 'INPUT',
    desired_output TEXT,
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
    min_output TEXT
  );
`)

const insertDecision = db.prepare(
  `INSERT INTO strategy_decisions (timestamp, order_id, score, action, reason, price_score, divergence_score, urgency_score, chunk_amount, chunk_multiplier, min_output)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
)

const updateOrderStrategy = db.prepare(
  'UPDATE trade_orders SET timing_score = ?, strategy_reason = ?, updated_at = ? WHERE id = ?'
)

const insertPrice = db.prepare(
  `INSERT INTO prices (timestamp, pair, chainlink_price, chainlink_round_id, chainlink_updated_at, fynd_price, fynd_solve_ms, uniswap_price)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
)

// ---------- Price Recording Loop ----------

async function record() {
  try {
    const now = Math.floor(Date.now() / 1000)

    // Fetch quote from QuoteSource (1Click / Mock)
    const quote = await quoteSource.getQuote({
      fromToken: 'USDC',
      toToken: 'EURC',
      amountIn: '1000000',
    })

    // Fetch reference rate from ReferenceRateSource (ECB / Mock)
    const ref = await refRateSource.getReferenceRate('EUR/USD')

    // Mid price (EURC/USD = 1 / rate for EURC in USD)
    const refRate = ref.rate
    const quoteRate = quote.rate > 0 ? 1 / quote.rate : refRate
    const secondaryRate = quoteRate * (1 + ((now % 5) - 2) * 0.0005)

    insertPrice.run(
      now,
      'EURC/USD',
      refRate,
      `ref-${now}`,
      now,
      secondaryRate,
      12,
      quoteRate
    )

    console.log(
      `[${new Date().toISOString()}] Recorded EURC/USD: ref=${refRate.toFixed(4)}, quote=${quoteRate.toFixed(4)} (${GETNEAR_MODE.toUpperCase()} DATA)`
    )
  } catch (e) {
    console.error('Price recording loop error:', e)
  }
}

// ---------- Hono REST API ----------

const app = new Hono()
app.use('/*', cors())

app.get('/health', (c) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM prices').get() as { count: number }
  return c.json({
    ok: true,
    mode: GETNEAR_MODE,
    isMock: GETNEAR_MODE === 'mock',
    simulated: true,
    recordings: count.count,
    banner: 'TESTNET · SIMULATED FILLS',
  })
})

app.get('/prices/current', (c) => {
  const result: Record<string, any> = {}
  const pairs = db.prepare('SELECT DISTINCT pair FROM prices').all() as { pair: string }[]
  for (const { pair } of pairs) {
    const row = db.prepare(
      'SELECT * FROM prices WHERE pair = ? ORDER BY timestamp DESC LIMIT 1'
    ).get(pair) as any
    if (row) {
      const divergence = row.fynd_price != null && row.chainlink_price !== row.fynd_price
        ? Math.abs(row.chainlink_price - row.fynd_price) / row.chainlink_price * 100
        : null
      result[pair] = {
        chainlink: row.chainlink_price,
        fynd: row.fynd_price,
        uniswap: row.uniswap_price,
        divergence_pct: divergence != null ? Math.round(divergence * 1000) / 1000 : null,
        timestamp: row.timestamp,
        provenance: GETNEAR_MODE === 'mock' ? 'MOCK DATA' : 'TESTNET',
      }
    }
  }
  return c.json(result)
})

app.get('/prices/history', (c) => {
  const pair = c.req.query('pair') || 'EURC/USD'
  const hours = Math.min(Number(c.req.query('hours') || 24), 168)
  const since = Math.floor(Date.now() / 1000) - hours * 3600
  const rows = db.prepare(
    'SELECT timestamp, chainlink_price, fynd_price, uniswap_price FROM prices WHERE pair = ? AND timestamp >= ? ORDER BY timestamp ASC'
  ).all(pair, since) as any[]
  const points = rows.map((r: any) => ({
    timestamp: r.timestamp,
    chainlink: r.chainlink_price,
    fynd: r.fynd_price,
    uniswap: r.uniswap_price,
    divergence_pct: r.fynd_price != null
      ? Math.round(Math.abs(r.chainlink_price - r.fynd_price) / r.chainlink_price * 100 * 1000) / 1000
      : null,
  }))
  return c.json({ pair, points, mock: GETNEAR_MODE === 'mock' })
})

app.get('/depth', async (c) => {
  const sellSymbol = c.req.query('sell_token') || 'USDC'
  const buySymbol = c.req.query('buy_token') || 'EURC'
  const sell = SUPPORTED_TOKENS[sellSymbol]
  const buy = SUPPORTED_TOKENS[buySymbol]
  if (!sell || !buy) return c.json({ error: 'Unknown token' }, 400)

  const amounts = [100, 1000, 10000, 100000, 500000, 1000000]
  const baseRate = 0.9259
  const points = amounts.map((humanAmount) => {
    const buyAmount = humanAmount * baseRate
    return {
      sell_amount: humanAmount,
      buy_amount: Math.round(buyAmount * 1e6) / 1e6,
      effective_price: baseRate,
      price_impact_bps: Math.round((humanAmount / 1_000_000) * 10),
      gas_estimate: 50000,
    }
  })
  return c.json({ sell_token: sellSymbol, buy_token: buySymbol, points, mock: true })
})

app.get('/depth/book', async (c) => {
  const baseSymbol = c.req.query('base') || 'EURC'
  const quoteSymbol = c.req.query('quote') || 'USDC'
  const sizes = [100, 500, 1000, 5000, 10000, 50000, 100000, 250000, 500000, 1000000]
  const midPrice = 1.08

  const bids = sizes.map((size) => ({
    size,
    base_amount: Math.round((size / midPrice) * 1e6) / 1e6,
    price: Math.round((midPrice - (size / 10_000_000) * 0.01) * 1e4) / 1e4,
    price_impact_bps: Math.round((size / 1_000_000) * 12),
  }))

  const asks = sizes.map((size) => ({
    size,
    quote_amount: Math.round(size * midPrice * 1e6) / 1e6,
    price: Math.round((midPrice + (size / 10_000_000) * 0.01) * 1e4) / 1e4,
    price_impact_bps: Math.round((size / 1_000_000) * 12),
  }))

  return c.json({
    base: baseSymbol,
    quote: quoteSymbol,
    bids,
    asks,
    mock: true,
  })
})

// ---------- Orders / Trades API ----------

app.post('/api/trades', async (c) => {
  const body = await c.req.json()

  const validTokens = ['USDC', 'EURC']
  if (!body.fromToken || !validTokens.includes(body.fromToken)) {
    return c.json({ error: `Invalid fromToken: must be one of ${validTokens.join(', ')}` }, 400)
  }
  if (!body.toToken || !validTokens.includes(body.toToken)) {
    return c.json({ error: `Invalid toToken: must be one of ${validTokens.join(', ')}` }, 400)
  }
  if (body.fromToken === body.toToken) {
    return c.json({ error: 'fromToken and toToken must be different' }, 400)
  }
  if (body.deadline == null || typeof body.deadline !== 'number' || !Number.isFinite(body.deadline)) {
    return c.json({ error: 'Invalid deadline: must be a finite integer' }, 400)
  }

  const mode = body.mode === 'OUTPUT' ? 'OUTPUT' : 'INPUT'
  let inputAmount: string
  let desiredOutput: string | null = null

  if (mode === 'OUTPUT') {
    if (!body.desiredOutput || typeof body.desiredOutput !== 'string') {
      return c.json({ error: 'Invalid desiredOutput' }, 400)
    }
    desiredOutput = body.desiredOutput
    const desiredNum = Number(desiredOutput)
    inputAmount = Math.ceil(desiredNum * 1.08 * 1.05).toString()
  } else {
    if (!body.inputAmount || typeof body.inputAmount !== 'string') {
      return c.json({ error: 'Invalid inputAmount' }, 400)
    }
    inputAmount = body.inputAmount
  }

  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)

  // Auto-approve small orders (≤ $500,000 raw = 500,000,000 units), large orders are PENDING for DAO
  const autoCap = 500_000_000n
  const initialStatus = BigInt(inputAmount) <= autoCap ? 'APPROVED' : 'PENDING'

  db.prepare(
    `INSERT INTO trade_orders (id, from_token, to_token, input_amount, deadline, status, created_at, updated_at, mode, desired_output)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, body.fromToken, body.toToken, inputAmount, body.deadline, initialStatus, now, now, mode, desiredOutput)

  if (initialStatus === 'PENDING') {
    await approvalGate.requestApproval({ orderId: id, totalIn: inputAmount, requester: 'testnet.operator' })
  }

  return c.json({ id, status: initialStatus, mode, inputAmount, desiredOutput, isSimulated: true }, 201)
})

app.get('/api/trades', (c) => {
  const status = c.req.query('status')
  if (status) {
    const statuses = status.split(',').map((s) => s.trim()).filter(Boolean)
    if (statuses.length > 0) {
      const placeholders = statuses.map(() => '?').join(', ')
      const rows = db.prepare(`SELECT * FROM trade_orders WHERE status IN (${placeholders}) ORDER BY created_at DESC`).all(...statuses)
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
    .run('APPROVED', Math.floor(Date.now() / 1000), id)
  return c.json({ ok: true, status: 'APPROVED', isSimulated: true })
})

app.post('/api/trades/:id/cancel', (c) => {
  db.prepare('UPDATE trade_orders SET status = ?, updated_at = ? WHERE id = ?')
    .run('CANCELLED', Math.floor(Date.now() / 1000), c.req.param('id'))
  return c.json({ ok: true })
})

app.patch('/api/trades/:id/fill', async (c) => {
  const body = await c.req.json()
  const txHash = body.txHash || `mock_tx_${Date.now()}`

  db.prepare(
    `UPDATE trade_orders SET filled_amount = ?, output_received = ?, status = ?, updated_at = ? WHERE id = ?`
  ).run(body.filledAmount, body.outputReceived, body.status || 'FILLING', Math.floor(Date.now() / 1000), c.req.param('id'))

  db.prepare(
    `INSERT INTO cre_runs (started_at, action, order_id, chunk_amount, result, tx_hash, error, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(Math.floor(Date.now() / 1000), 'SWAP', c.req.param('id'), body.chunkAmount || '0', body.status || 'FILLING', txHash, null, 15)

  return c.json({ ok: true, txHash, isSimulated: true })
})

// ---------- Strategy Decision Engine ----------

app.get('/api/strategy/next', (c) => {
  const now = Math.floor(Date.now() / 1000)

  // Auto-cancel expired orders
  db.prepare("UPDATE trade_orders SET status = 'CANCELLED', updated_at = ? WHERE status IN ('PENDING', 'APPROVED', 'FILLING') AND deadline < ?")
    .run(now, now)

  const order = db.prepare(
    "SELECT * FROM trade_orders WHERE status IN ('APPROVED', 'FILLING') ORDER BY created_at ASC LIMIT 1"
  ).get() as any

  if (!order) {
    insertDecision.run(now, null, 0, 'WAIT', 'No pending or active orders', null, null, null, null, null, null)
    return c.json({ action: 'WAIT' as const, reason: 'No pending or active orders', score: 0 })
  }

  const latestRow = db.prepare(
    "SELECT * FROM prices WHERE pair = 'EURC/USD' ORDER BY timestamp DESC LIMIT 1"
  ).get() as any

  const priceSnapshot: PriceSnapshot = {
    chainlinkPrice: latestRow?.chainlink_price || 1.08,
    fyndPrice: latestRow?.fynd_price || 1.08,
    uniswapPrice: latestRow?.uniswap_price || 1.08,
    avg24hPrice: latestRow?.chainlink_price || 1.08,
  }

  const orderCtx: OrderContext = {
    inputAmount: order.input_amount,
    filledAmount: order.filled_amount || '0',
    createdAt: order.created_at,
    deadline: order.deadline,
    fromToken: order.from_token,
    toToken: order.to_token,
  }

  const timing = computeTimingScore(priceSnapshot, orderCtx, now)
  const chunkAmount = adaptiveChunkSize({
    inputAmount: BigInt(order.input_amount),
    filledAmount: BigInt(order.filled_amount || '0'),
    deadline: order.deadline,
    createdAt: order.created_at,
    timingScore: timing.score,
    now,
  })

  insertDecision.run(
    now, order.id, timing.score, timing.action, timing.reason,
    timing.breakdown.priceScore, timing.breakdown.divergenceScore, timing.breakdown.urgencyScore,
    chunkAmount.toString(), timing.chunkMultiplier, null
  )

  return c.json({
    action: timing.action,
    orderId: order.id,
    chunkAmount: chunkAmount.toString(),
    score: timing.score,
    reason: timing.reason,
    breakdown: timing.breakdown,
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

app.get('/api/prices/comparison', (c) => {
  const latestRow = db.prepare(
    "SELECT * FROM prices WHERE pair = 'EURC/USD' ORDER BY timestamp DESC LIMIT 1"
  ).get() as any

  const refPrice = latestRow?.chainlink_price || 1.08
  const quotePrice = latestRow?.uniswap_price || 1.0795
  const secondaryPrice = latestRow?.fynd_price || 1.0805

  return c.json({
    chainlink: { price: refPrice, updatedAt: latestRow?.timestamp || Math.floor(Date.now() / 1000) },
    fynd: { price: secondaryPrice, updatedAt: latestRow?.timestamp || Math.floor(Date.now() / 1000) },
    uniswap: { price: quotePrice, updatedAt: latestRow?.timestamp || Math.floor(Date.now() / 1000) },
    divergenceBps: Math.round((Math.abs(refPrice - quotePrice) / refPrice) * 10000),
    avg24h: refPrice,
    currentVsAvgPct: 0.05,
    provenance: 'MOCK (Simulated 1Click / ECB)',
    simulated: true,
  })
})

app.get('/api/cre/runs', (c) => {
  const limit = Number(c.req.query('limit') || 50)
  const rows = db.prepare('SELECT * FROM cre_runs ORDER BY started_at DESC LIMIT ?').all(limit)
  return c.json(rows)
})

app.get('/api/strategy/config', (c) => c.json(strategyConfig))

app.put('/api/strategy/config', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  updateStrategyConfig(body)
  return c.json(strategyConfig)
})

// ---------- Demo Mode & Seed Data ----------

let demoSpeed: { speed: 1 | 10; sleep: number } = { speed: 1, sleep: 20 }

app.get('/api/demo/speed', (c) => c.json(demoSpeed))

app.post('/api/demo/speed', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const speed = body.speed === 10 ? 10 : 1
  demoSpeed = { speed, sleep: speed === 10 ? 5 : 20 }
  return c.json(demoSpeed)
})

app.post('/api/demo/seed', async (c) => {
  const now = Math.floor(Date.now() / 1000)
  const orders = [
    { id: `demo-small-${now}`, from: 'USDC', to: 'EURC', amount: '10000000', filled: '2000000', output: '1850000', status: 'FILLING', deadline: now + 3600 },
    { id: `demo-large-${now}`, from: 'USDC', to: 'EURC', amount: '2500000000', filled: '0', output: '0', status: 'PENDING', deadline: now + 7200 },
  ]
  for (const o of orders) {
    db.prepare(
      `INSERT OR REPLACE INTO trade_orders (id, from_token, to_token, input_amount, filled_amount, output_received, deadline, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(o.id, o.from, o.to, o.amount, o.filled, o.output, o.deadline, o.status, now, now)
  }
  return c.json({ seeded: orders.length, message: 'Seeded demo orders (small Auto-Active, large Pending DAO approval)' })
})

// ---------- Mock Execution Loop ----------

async function fillSimulationTick() {
  try {
    const now = Math.floor(Date.now() / 1000)
    const activeOrders = db.prepare(
      "SELECT * FROM trade_orders WHERE status IN ('APPROVED', 'FILLING') ORDER BY created_at ASC"
    ).all() as any[]

    for (const order of activeOrders) {
      const inputAmount = BigInt(order.input_amount)
      const filledAmount = BigInt(order.filled_amount || '0')
      const remaining = inputAmount - filledAmount

      if (remaining <= 0n) {
        db.prepare("UPDATE trade_orders SET status = 'COMPLETE', updated_at = ? WHERE id = ?").run(now, order.id)
        continue
      }

      const chunk = adaptiveChunkSize({
        inputAmount,
        filledAmount,
        deadline: order.deadline,
        createdAt: order.created_at,
        timingScore: 80,
        now,
      })

      if (chunk <= 0n) continue

      const execResult = await executor.executeChunk({
        orderId: order.id,
        amountIn: chunk.toString(),
        quoteRef: `q-${now}`,
        deviationBps: 15,
        simulatedOut: (Number(chunk) * 0.925).toString(),
      })

      const newFilled = filledAmount + chunk
      const outputChunk = BigInt(Math.floor(Number(chunk) * 0.925))
      const newOutput = BigInt(order.output_received || '0') + outputChunk
      const newStatus = newFilled >= inputAmount ? 'COMPLETE' : 'FILLING'

      db.prepare(
        `UPDATE trade_orders SET filled_amount = ?, output_received = ?, status = ?, updated_at = ? WHERE id = ?`
      ).run(newFilled.toString(), newOutput.toString(), newStatus, now, order.id)

      db.prepare(
        `INSERT INTO cre_runs (started_at, action, order_id, chunk_amount, result, tx_hash, error, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(now, 'SWAP', order.id, chunk.toString(), newStatus, execResult.txHash, null, 10)
    }
  } catch (err) {
    console.error('Fill simulation tick error:', err)
  }
}

// ---------- Main Bootstrap ----------

async function main() {
  await record()
  setInterval(record, RECORD_INTERVAL)

  if (DEMO_MODE) {
    setInterval(fillSimulationTick, demoSpeed.sleep * 1000)
    console.log(`[GetNear Oracle] Mock fill loop running (ticking every ${demoSpeed.sleep}s)`)
  }

  console.log(`[GetNear Oracle] Listening on port ${PORT} in ${GETNEAR_MODE.toUpperCase()} mode`)
  serve({ fetch: app.fetch, port: PORT })
}

main().catch(console.error)

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { createPublicClient, createWalletClient, http, defineChain, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { computeTimingScore, adaptiveChunkSize, TICK_INTERVAL, strategyConfig, updateStrategyConfig, type PriceSnapshot, type OrderContext } from './strategy.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const DB_PATH = join(DATA_DIR, 'prices.db')
const PORT = Number(process.env.PORT || 38174)
const RPC_URL = process.env.ORACLE_RPC_URL || 'https://mainnet.base.org'
const FYND_URL = process.env.FYND_URL || 'http://localhost:3000'
const RECORD_INTERVAL = 30_000 // 30 seconds
const ARC_RPC_URL = process.env.ARC_RPC || 'https://rpc-testnet.arc.money'
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined
const TREASURY_VAULT = '0x75a1ff87d9369fefeb2914bd6cc69296f7ebd997' as Address

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: [ARC_RPC_URL] } },
})

const arcWalletClient = DEPLOYER_KEY
  ? createWalletClient({
      account: privateKeyToAccount(DEPLOYER_KEY),
      chain: arcTestnet,
      transport: http(ARC_RPC_URL),
    })
  : null

const SET_POLICY_ABI = [
  {
    name: 'setPolicy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_threshold', type: 'uint256' },
      { name: '_rateMin', type: 'uint256' },
      { name: '_rateMax', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

// ---------- ABI ----------

const AGGREGATOR_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const

// ---------- Feed & token config ----------

const FEED_CONFIG = [
  { pair: 'EURC/USD', address: '0xDAe398520e2B67cd3f27aeF9Cf14D93D927f8250' as Address },
  { pair: 'ETH/USD', address: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70' as Address },
  { pair: 'BTC/USD', address: '0xCCADC697c55bbB68dc5bCdf8d3CBe83CdD4E071E' as Address },
  { pair: 'USDC/USD', address: '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B' as Address },
]

const TOKEN_MAP: Record<string, { address: string; decimals: number }> = {
  WETH:  { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  USDC:  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  DAI:   { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
  cbBTC: { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8 },
  EURC:  { address: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', decimals: 6 },
}

// ---------- Viem client ----------

const client = createPublicClient({ chain: base, transport: http(RPC_URL) })

// ---------- Types ----------

interface ActiveFeed {
  pair: string
  address: Address
  decimals: number
}

// ---------- SQLite ----------

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
    fynd_solve_ms INTEGER
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
    updated_at INTEGER NOT NULL
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
`)

// Add uniswap_price column if not exists (idempotent migration)
try { db.exec('ALTER TABLE prices ADD COLUMN uniswap_price REAL') } catch { /* already exists */ }

// Add output-mode columns (idempotent migration)
try { db.exec("ALTER TABLE trade_orders ADD COLUMN mode TEXT DEFAULT 'INPUT'") } catch { /* already exists */ }
try { db.exec('ALTER TABLE trade_orders ADD COLUMN desired_output TEXT') } catch { /* already exists */ }

// Add timing_score and strategy_reason to trade_orders (idempotent migration)
try { db.exec('ALTER TABLE trade_orders ADD COLUMN timing_score INTEGER') } catch { /* already exists */ }
try { db.exec('ALTER TABLE trade_orders ADD COLUMN strategy_reason TEXT') } catch { /* already exists */ }

// Strategy decision log table
db.exec(`
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

const UNISWAP_API_KEY = process.env.UNISWAP_API_KEY || ''
const UNISWAP_API_URL = 'https://trade-api.gateway.uniswap.org/v1/quote'

const insertPrice = db.prepare(
  `INSERT INTO prices (timestamp, pair, chainlink_price, chainlink_round_id, chainlink_updated_at, fynd_price, fynd_solve_ms, uniswap_price)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
)

// ---------- Feed verification ----------

const activeFeeds: ActiveFeed[] = []

async function verifyFeeds() {
  for (const feed of FEED_CONFIG) {
    try {
      const dec = await client.readContract({
        address: feed.address,
        abi: AGGREGATOR_ABI,
        functionName: 'decimals',
      })
      activeFeeds.push({ ...feed, decimals: Number(dec) })
      console.log(`\u2713 ${feed.pair} feed verified (${dec} decimals)`)
    } catch (e) {
      console.warn(`\u2717 ${feed.pair} feed at ${feed.address} failed verification, skipping`)
    }
  }
}

// ---------- Recording loop ----------

async function record() {
  try {
    const now = Math.floor(Date.now() / 1000)
    const parts: string[] = []

    for (const feed of activeFeeds) {
      try {
        const [roundId, answer, , updatedAt] = await client.readContract({
          address: feed.address,
          abi: AGGREGATOR_ABI,
          functionName: 'latestRoundData',
        })

        const price = Number(answer) / 10 ** feed.decimals

        let fyndPrice: number | null = null
        let fyndSolveMs: number | null = null
        let uniswapPrice: number | null = null

        // For EURC/USD, also get the Fynd DEX rate for comparison
        if (feed.pair === 'EURC/USD') {
          try {
            const fyndRes = await fetch(`${FYND_URL}/v1/quote`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orders: [{
                  token_in: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
                  token_out: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42',
                  amount: '10000000000', // 10000 USDC
                  side: 'sell',
                  sender: '0x0000000000000000000000000000000000000001',
                }],
                options: { timeout_ms: 5000, min_responses: 1 },
              }),
            })
            const data = await fyndRes.json() as any
            const order = data.orders?.[0]
            if (order && order.status === 'success') {
              // EURC per USDC → invert to get USD per EURC (= EURC/USD)
              const eurcPerUsdc = Number(order.amount_out) / Number(order.amount_in)
              fyndPrice = 1 / eurcPerUsdc
              fyndSolveMs = data.solve_time_ms ?? null
            }
          } catch { /* Fynd unavailable */ }

          // Also fetch Uniswap spot price for EURC/USD
          if (UNISWAP_API_KEY) {
            try {
              const uniRes = await fetch(UNISWAP_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': UNISWAP_API_KEY },
                body: JSON.stringify({
                  tokenInChainId: 8453,
                  tokenIn: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
                  tokenOutChainId: 8453,
                  tokenOut: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42',
                  amount: '1000000', // 1 USDC
                  type: 'EXACT_INPUT',
                  swapper: '0xB60679110E14D2291f8105EF002A49809cfB283b',
                }),
                signal: AbortSignal.timeout(8000),
              })
              const uniData = await uniRes.json() as any
              if (uniData.quote?.output?.amount && uniData.quote?.input?.amount) {
                const eurcPerUsdc = Number(uniData.quote.output.amount) / Number(uniData.quote.input.amount)
                uniswapPrice = 1 / eurcPerUsdc // Invert to USD/EURC
              }
            } catch { /* Uniswap API unavailable */ }
          }
        }

        insertPrice.run(
          now,
          feed.pair,
          price,
          roundId.toString(),
          Number(updatedAt),
          fyndPrice,
          fyndSolveMs,
          uniswapPrice,
        )

        const label = fyndPrice != null
          ? `${feed.pair}=${price.toFixed(4)} (fynd=${fyndPrice.toFixed(4)})`
          : `${feed.pair}=${price.toFixed(2)}`
        parts.push(label)
      } catch (e) {
        console.error(`Failed to read ${feed.pair}:`, e)
      }
    }

    if (parts.length > 0) {
      const ts = new Date().toISOString()
      console.log(`[${ts}] Recorded: ${parts.join(', ')}`)
    }
  } catch (e) {
    console.error('Recording loop error:', e)
  }
}

// ---------- Hono app ----------

const app = new Hono()
app.use('/*', cors())

app.get('/health', (c) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM prices').get() as { count: number }
  return c.json({ ok: true, feeds: activeFeeds.length, recordings: count.count })
})

app.get('/prices/current', (c) => {
  const result: Record<string, any> = {}
  // All unique pairs in the DB
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
        divergence_pct: divergence != null ? Math.round(divergence * 1000) / 1000 : null,
        timestamp: row.timestamp,
      }
    }
  }
  return c.json(result)
})

app.get('/prices/history', (c) => {
  const pair = c.req.query('pair') || 'EUR/USD'
  const hours = Math.min(Number(c.req.query('hours') || 24), 168)
  const since = Math.floor(Date.now() / 1000) - hours * 3600
  const rows = db.prepare(
    'SELECT timestamp, chainlink_price, fynd_price FROM prices WHERE pair = ? AND timestamp >= ? ORDER BY timestamp ASC'
  ).all(pair, since) as any[]
  const points = rows.map((r: any) => ({
    timestamp: r.timestamp,
    chainlink: r.chainlink_price,
    fynd: r.fynd_price,
    divergence_pct: r.fynd_price != null
      ? Math.round(Math.abs(r.chainlink_price - r.fynd_price) / r.chainlink_price * 100 * 1000) / 1000
      : null,
  }))
  return c.json({ pair, points })
})

app.get('/depth', async (c) => {
  const sellSymbol = c.req.query('sell_token') || 'USDC'
  const buySymbol = c.req.query('buy_token') || 'EURC'
  const sell = TOKEN_MAP[sellSymbol]
  const buy = TOKEN_MAP[buySymbol]
  if (!sell || !buy) return c.json({ error: 'Unknown token' }, 400)

  const amounts = [100, 1000, 10000, 100000, 500000, 1000000]
  const points = await Promise.all(amounts.map(async (humanAmount) => {
    try {
      const atomic = BigInt(humanAmount) * BigInt(10 ** sell.decimals)
      const res = await fetch(`${FYND_URL}/v1/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders: [{
            token_in: sell.address,
            token_out: buy.address,
            amount: atomic.toString(),
            side: 'sell',
            sender: '0x0000000000000000000000000000000000000001',
          }],
          options: { timeout_ms: 5000, min_responses: 1 },
        }),
      })
      const data = await res.json() as any
      const order = data.orders?.[0]
      if (!order || order.status !== 'success') return null
      const buyAmount = Number(order.amount_out) / 10 ** buy.decimals
      return {
        sell_amount: humanAmount,
        buy_amount: Math.round(buyAmount * 1e6) / 1e6,
        effective_price: Math.round((buyAmount / humanAmount) * 1e6) / 1e6,
        price_impact_bps: order.price_impact_bps ?? null,
        gas_estimate: Number(order.gas_estimate),
      }
    } catch {
      return null
    }
  }))
  return c.json({ sell_token: sellSymbol, buy_token: buySymbol, points: points.filter(Boolean) })
})

app.get('/depth/book', async (c) => {
  const baseSymbol = c.req.query('base') || 'EURC'
  const quoteSymbol = c.req.query('quote') || 'USDC'
  const base = TOKEN_MAP[baseSymbol]
  const quote = TOKEN_MAP[quoteSymbol]
  if (!base || !quote) return c.json({ error: 'Unknown token' }, 400)

  // More granular sizes for better resolution
  const sizes = [100, 500, 1000, 5000, 10000, 50000, 100000, 250000, 500000, 1000000]

  // Buy side: quote -> base (buying base with quote)
  // e.g., USDC -> EURC at increasing sizes
  const bidsPromise = Promise.all(sizes.map(async (humanAmount) => {
    try {
      const atomic = BigInt(humanAmount) * BigInt(10 ** quote.decimals)
      const res = await fetch(`${FYND_URL}/v1/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders: [{
            token_in: quote.address,
            token_out: base.address,
            amount: atomic.toString(),
            side: 'sell',
            sender: '0x0000000000000000000000000000000000000001',
          }],
          options: { timeout_ms: 5000, min_responses: 1 },
        }),
      })
      const data = await res.json() as any
      const order = data.orders?.[0]
      if (!order || order.status !== 'success') return null
      const baseAmount = Number(order.amount_out) / 10 ** base.decimals
      return {
        size: humanAmount,
        base_amount: Math.round(baseAmount * 1e6) / 1e6,
        price: Math.round((humanAmount / baseAmount) * 1e6) / 1e6, // quote per base
        price_impact_bps: order.price_impact_bps ?? null,
      }
    } catch { return null }
  }))

  // Sell side: base -> quote (selling base for quote)
  // e.g., EURC -> USDC at increasing sizes
  const asksPromise = Promise.all(sizes.map(async (humanAmount) => {
    try {
      const atomic = BigInt(humanAmount) * BigInt(10 ** base.decimals)
      const res = await fetch(`${FYND_URL}/v1/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders: [{
            token_in: base.address,
            token_out: quote.address,
            amount: atomic.toString(),
            side: 'sell',
            sender: '0x0000000000000000000000000000000000000001',
          }],
          options: { timeout_ms: 5000, min_responses: 1 },
        }),
      })
      const data = await res.json() as any
      const order = data.orders?.[0]
      if (!order || order.status !== 'success') return null
      const quoteAmount = Number(order.amount_out) / 10 ** quote.decimals
      return {
        size: humanAmount,
        quote_amount: Math.round(quoteAmount * 1e6) / 1e6,
        price: Math.round((quoteAmount / humanAmount) * 1e6) / 1e6, // quote per base
        price_impact_bps: order.price_impact_bps ?? null,
      }
    } catch { return null }
  }))

  const [bids, asks] = await Promise.all([bidsPromise, asksPromise])

  return c.json({
    base: baseSymbol,
    quote: quoteSymbol,
    bids: bids.filter(Boolean),
    asks: asks.filter(Boolean),
  })
})

// ---------- Phase 2: Trade Orders (stubs) ----------

const DEMO_MODE = process.env.DEMO_MODE === 'true'

app.post('/api/trades', async (c) => {
  const body = await c.req.json()

  // #30: Validate trade creation input
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
  if (body.deadline == null || typeof body.deadline !== 'number' || !Number.isFinite(body.deadline) || !Number.isInteger(body.deadline)) {
    return c.json({ error: 'Invalid deadline: must be a finite integer' }, 400)
  }
  if (body.deadline <= Math.floor(Date.now() / 1000)) {
    return c.json({ error: 'Invalid deadline: must be in the future' }, 400)
  }

  const mode = body.mode === 'OUTPUT' ? 'OUTPUT' : 'INPUT'
  let inputAmount: string
  let desiredOutput: string | null = null

  if (mode === 'OUTPUT') {
    // Output mode: require desiredOutput, estimate inputAmount from price
    if (!body.desiredOutput || typeof body.desiredOutput !== 'string' || !/^\d+$/.test(body.desiredOutput) || body.desiredOutput === '0') {
      return c.json({ error: 'Invalid desiredOutput: must be a non-zero string of digits' }, 400)
    }
    desiredOutput = body.desiredOutput

    // Get current Chainlink price for estimation
    const latestRow = db.prepare(
      "SELECT chainlink_price FROM prices WHERE pair = 'EURC/USD' ORDER BY timestamp DESC LIMIT 1"
    ).get() as any
    const eurcUsdPrice = latestRow?.chainlink_price
    if (!eurcUsdPrice || eurcUsdPrice === 0) {
      return c.json({ error: 'No recent price data available for estimation' }, 400)
    }

    // Estimate input with 5% buffer
    const desiredNum = Number(desiredOutput)
    const isBuyingEurc = body.toToken === 'EURC'
    // EURC/USD = dollars per 1 EURC
    // USDC→EURC: input = desiredOutput * eurcUsdPrice * 1.05 (spending USDC to get EURC)
    // EURC→USDC: input = desiredOutput / eurcUsdPrice * 1.05 (spending EURC to get USDC)
    const estimatedInput = isBuyingEurc
      ? Math.ceil(desiredNum * eurcUsdPrice * 1.05)
      : Math.ceil(desiredNum / eurcUsdPrice * 1.05)
    inputAmount = estimatedInput.toString()
  } else {
    // Input mode: require inputAmount (current behavior)
    if (!body.inputAmount || typeof body.inputAmount !== 'string' || !/^\d+$/.test(body.inputAmount) || body.inputAmount === '0') {
      return c.json({ error: 'Invalid inputAmount: must be a non-zero string of digits (no decimals or negatives)' }, 400)
    }
    inputAmount = body.inputAmount
  }

  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  db.prepare(
    `INSERT INTO trade_orders (id, from_token, to_token, input_amount, deadline, status, created_at, updated_at, mode, desired_output)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`
  ).run(id, body.fromToken, body.toToken, inputAmount, body.deadline, now, now, mode, desiredOutput)
  return c.json({ id, status: 'PENDING', mode, inputAmount, desiredOutput }, 201)
})

app.get('/api/trades', (c) => {
  const status = c.req.query('status')
  if (status) {
    // #35: Support comma-separated status values (e.g. ?status=FILLING,PENDING)
    const statuses = status.split(',').map(s => s.trim()).filter(Boolean)
    // #36: Guard against empty statuses (e.g. status=,,) — fall through to return all trades
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

app.post('/api/trades/:id/approve', (c) => {
  db.prepare('UPDATE trade_orders SET status = ?, updated_at = ? WHERE id = ?')
    .run('APPROVED', Math.floor(Date.now() / 1000), c.req.param('id'))
  return c.json({ ok: true })
})

app.post('/api/trades/:id/cancel', (c) => {
  db.prepare('UPDATE trade_orders SET status = ?, updated_at = ? WHERE id = ?')
    .run('CANCELLED', Math.floor(Date.now() / 1000), c.req.param('id'))
  return c.json({ ok: true })
})

app.patch('/api/trades/:id/fill', async (c) => {
  const body = await c.req.json()
  const txHash = body.txHash || ''
  // #31: Only deduplicate when a non-empty txHash is provided
  if (txHash) {
    const existing = db.prepare('SELECT id FROM cre_runs WHERE tx_hash = ?').get(txHash)
    if (existing) return c.json({ ok: true, deduplicated: true })
  }

  db.prepare(
    `UPDATE trade_orders SET filled_amount = ?, output_received = ?, status = ?, updated_at = ? WHERE id = ?`
  ).run(body.filledAmount, body.outputReceived, body.status || 'FILLING', Math.floor(Date.now() / 1000), c.req.param('id'))
  return c.json({ ok: true })
})

// ---------- Phase 2: Strategy ----------

app.get('/api/strategy/next', (c) => {
  const now = Math.floor(Date.now() / 1000)

  // Auto-cancel expired orders
  db.prepare("UPDATE trade_orders SET status = 'CANCELLED', updated_at = ? WHERE status IN ('PENDING', 'APPROVED', 'FILLING') AND deadline < ?")
    .run(now, now)

  const order = db.prepare(
    "SELECT * FROM trade_orders WHERE status IN ('APPROVED', 'FILLING') ORDER BY created_at ASC LIMIT 1"
  ).get() as any

  if (!order) {
    // Also check for PENDING orders (auto-approve small ones for demo)
    const pending = db.prepare(
      "SELECT * FROM trade_orders WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1"
    ).get() as any
    if (pending) {
      db.prepare("UPDATE trade_orders SET status = 'APPROVED', updated_at = ? WHERE id = ?").run(now, pending.id)
      insertDecision.run(now, pending.id, 0, 'WAIT', 'Auto-approved order, will execute next tick', null, null, null, null, null, null)
      return c.json({ action: 'WAIT' as const, reason: 'Auto-approved order, will execute next tick', score: 0 })
    }
    insertDecision.run(now, null, 0, 'WAIT', 'No pending orders', null, null, null, null, null, null)
    return c.json({ action: 'WAIT' as const, reason: 'No pending orders', score: 0 })
  }

  // Output-mode completion check: if desired output has been met
  if (order.mode === 'OUTPUT' && order.desired_output) {
    const outputReceived = BigInt(order.output_received || '0')
    const desiredOutput = BigInt(order.desired_output)
    if (outputReceived >= desiredOutput) {
      const excess = BigInt(order.input_amount) - BigInt(order.filled_amount || '0')
      db.prepare("UPDATE trade_orders SET status = 'COMPLETE', updated_at = ? WHERE id = ?").run(now, order.id)
      return c.json({
        action: 'WAIT' as const,
        reason: `Output target met (${outputReceived.toString()} >= ${desiredOutput.toString()}), excess input: ${excess.toString()}`,
        orderId: order.id,
        excessInput: excess.toString(),
        score: 0,
      })
    }
  }

  const remaining = BigInt(order.input_amount) - BigInt(order.filled_amount || '0')
  if (remaining <= 0n) {
    db.prepare("UPDATE trade_orders SET status = 'COMPLETE', updated_at = ? WHERE id = ?").run(now, order.id)
    insertDecision.run(now, order.id, 0, 'WAIT', 'Order fully filled', null, null, null, null, null, null)
    return c.json({ action: 'WAIT' as const, reason: 'Order fully filled', score: 0 })
  }

  // ---------- Gather price snapshot for timing score ----------
  const latestChainlink = db.prepare(
    "SELECT chainlink_price FROM prices WHERE pair = 'EURC/USD' ORDER BY timestamp DESC LIMIT 1"
  ).get() as any
  const latestFynd = db.prepare(
    "SELECT fynd_price FROM prices WHERE pair = 'EURC/USD' AND fynd_price IS NOT NULL ORDER BY timestamp DESC LIMIT 1"
  ).get() as any
  const latestUniswap = db.prepare(
    "SELECT uniswap_price FROM prices WHERE pair = 'EURC/USD' AND uniswap_price IS NOT NULL ORDER BY timestamp DESC LIMIT 1"
  ).get() as any
  const avg24hRow = db.prepare(
    "SELECT AVG(chainlink_price) as avg FROM prices WHERE pair = 'EURC/USD' AND timestamp > ?"
  ).get(now - 86400) as any

  const priceSnapshot: PriceSnapshot = {
    chainlinkPrice: latestChainlink?.chainlink_price ?? null,
    fyndPrice: latestFynd?.fynd_price ?? null,
    uniswapPrice: latestUniswap?.uniswap_price ?? null,
    avg24hPrice: avg24hRow?.avg ?? null,
  }

  const orderCtx: OrderContext = {
    inputAmount: order.input_amount,
    filledAmount: order.filled_amount || '0',
    createdAt: order.created_at,
    deadline: order.deadline,
    fromToken: order.from_token,
    toToken: order.to_token,
  }

  // ---------- Compute timing score ----------
  const hasPriceData = priceSnapshot.chainlinkPrice != null || priceSnapshot.fyndPrice != null || priceSnapshot.uniswapPrice != null
  const timing = hasPriceData
    ? computeTimingScore(priceSnapshot, orderCtx, now)
    : null // fallback: no price data, use simple logic

  // ---------- Chunk sizing ----------
  // For output mode, compute effective remaining input based on desired output
  let effectiveInputAmount = BigInt(order.input_amount)
  let effectiveFilledAmount = BigInt(order.filled_amount || '0')
  if (order.mode === 'OUTPUT' && order.desired_output) {
    const outputReceived = BigInt(order.output_received || '0')
    const desiredOutput = BigInt(order.desired_output)
    const outputRemaining = desiredOutput - outputReceived
    if (outputRemaining > 0n && priceSnapshot.chainlinkPrice) {
      const rate = priceSnapshot.chainlinkPrice
      const isBuyingEurc = order.to_token === 'EURC'
      const inputNeeded = isBuyingEurc
        ? BigInt(Math.ceil(Number(outputRemaining) * rate))
        : BigInt(Math.ceil(Number(outputRemaining) / rate))
      const effectiveRemaining = inputNeeded < remaining ? inputNeeded : remaining
      // Adjust inputAmount/filledAmount so adaptive chunk sees the effective remaining
      effectiveInputAmount = effectiveRemaining + effectiveFilledAmount
    } else if (outputRemaining > 0n && !priceSnapshot.chainlinkPrice) {
      return c.json({ action: 'WAIT' as const, orderId: order.id, reason: 'No recent price data for output-mode chunk sizing', score: 0 })
    }
  }

  // ---------- Adaptive TWAP chunk sizing ----------
  const timingScore = timing?.score ?? 75
  const scaledChunk = timing && timing.action === 'SWAP'
    ? adaptiveChunkSize({
        inputAmount: effectiveInputAmount,
        filledAmount: effectiveFilledAmount,
        deadline: order.deadline,
        createdAt: order.created_at,
        timingScore,
        now,
      })
    : 0n
  const chunkAmount = scaledChunk.toString()

  // ---------- minOutput calculation (0.5% slippage) ----------
  if (!priceSnapshot.chainlinkPrice) {
    return c.json({ action: 'WAIT' as const, orderId: order.id, reason: 'No recent price data for minOutput calculation', score: 0 })
  }
  const rate = priceSnapshot.chainlinkPrice
  const isBuyingEurc = order.to_token === 'EURC'
  // EURC/USD is "dollars per 1 EURC"
  // Buying EURC: output = input / rate  (USDC → EURC)
  // Selling EURC: output = input * rate  (EURC → USDC)
  const expectedOutput = isBuyingEurc
    ? Number(chunkAmount) / rate
    : Number(chunkAmount) * rate
  const minOutput = Math.floor(expectedOutput * 0.995).toString() // 0.5% slippage

  // ---------- Determine action ----------
  if (timing && timing.action === 'WAIT') {
    insertDecision.run(now, order.id, timing.score, 'WAIT', timing.reason, timing.breakdown.priceScore, timing.breakdown.divergenceScore, timing.breakdown.urgencyScore, null, 0, null)
    updateOrderStrategy.run(timing.score, timing.reason, now, order.id)
    return c.json({
      action: 'WAIT' as const,
      orderId: order.id,
      score: timing.score,
      reason: timing.reason,
      breakdown: timing.breakdown,
    })
  }

  // Mark as FILLING if not already
  if (order.status === 'APPROVED') {
    db.prepare("UPDATE trade_orders SET status = 'FILLING', updated_at = ? WHERE id = ?").run(now, order.id)
  }

  const swapScore = timing?.score ?? 75
  const estimatedTicksLeft = Math.max(1, Math.floor((order.deadline - now) / TICK_INTERVAL))
  const swapReason = timing?.reason ?? `Fallback: executing chunk ${chunkAmount} for order ${order.id} (${estimatedTicksLeft} ticks remaining)`
  const chunkMultiplier = timingScore > 85 ? 2 : timingScore > 70 ? 1 : 0
  insertDecision.run(
    now, order.id, swapScore, 'SWAP', swapReason,
    timing?.breakdown.priceScore ?? null,
    timing?.breakdown.divergenceScore ?? null,
    timing?.breakdown.urgencyScore ?? null,
    chunkAmount, chunkMultiplier, minOutput,
  )
  updateOrderStrategy.run(swapScore, swapReason, now, order.id)

  return c.json({
    action: 'SWAP' as const,
    orderId: order.id,
    chunkAmount,
    minOutput,
    score: swapScore,
    reason: swapReason,
    breakdown: timing?.breakdown,
  })
})

// ---------- Phase 2: Strategy Decision Log ----------

app.get('/api/strategy/decisions', (c) => {
  const limit = Math.min(Number(c.req.query('limit') || 100), 500)
  const orderId = c.req.query('order_id')
  let rows
  if (orderId) {
    rows = db.prepare(
      `SELECT sd.*, t.from_token FROM strategy_decisions sd
       LEFT JOIN trade_orders t ON sd.order_id = t.id
       WHERE sd.order_id = ? ORDER BY sd.timestamp DESC LIMIT ?`
    ).all(orderId, limit)
  } else {
    rows = db.prepare(
      `SELECT sd.*, t.from_token FROM strategy_decisions sd
       LEFT JOIN trade_orders t ON sd.order_id = t.id
       ORDER BY sd.timestamp DESC LIMIT ?`
    ).all(limit)
  }
  return c.json(rows)
})

// ---------- Phase 2: Price Comparison ----------

app.get('/api/prices/comparison', (c) => {
  // Get latest prices from recordings
  const chainlinkRow = db.prepare(
    "SELECT chainlink_price, timestamp FROM prices WHERE pair = 'EURC/USD' ORDER BY timestamp DESC LIMIT 1"
  ).get() as any
  const fyndRow = db.prepare(
    "SELECT fynd_price, timestamp FROM prices WHERE pair = 'EURC/USD' AND fynd_price IS NOT NULL ORDER BY timestamp DESC LIMIT 1"
  ).get() as any

  const chainlink = chainlinkRow ? { price: chainlinkRow.chainlink_price, updatedAt: chainlinkRow.timestamp } : { price: 0, updatedAt: 0 }
  const fynd = fyndRow ? { price: fyndRow.fynd_price, updatedAt: fyndRow.timestamp } : { price: 0, updatedAt: 0 }
  const uniswapRow = db.prepare(
    "SELECT uniswap_price, timestamp FROM prices WHERE pair = 'EURC/USD' AND uniswap_price IS NOT NULL ORDER BY timestamp DESC LIMIT 1"
  ).get() as any
  const uniswap = uniswapRow ? { price: uniswapRow.uniswap_price, updatedAt: uniswapRow.timestamp } : { price: 0, updatedAt: 0 }

  const prices = [chainlink.price, fynd.price, uniswap.price].filter(p => p > 0)
  const avg = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0
  const maxDiv = prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : 0
  const divergenceBps = avg > 0 ? Math.round((maxDiv / avg) * 10000) : 0

  // 24h average
  const avg24hRow = db.prepare(
    "SELECT AVG(chainlink_price) as avg FROM prices WHERE pair = 'EURC/USD' AND timestamp > ?"
  ).get(Math.floor(Date.now() / 1000) - 86400) as any
  const avg24h = avg24hRow?.avg || 0

  return c.json({ chainlink, fynd, uniswap, divergenceBps, avg24h, currentVsAvgPct: avg24h > 0 ? ((avg - avg24h) / avg24h) * 100 : 0 })
})

// ---------- Phase 2: CRE Run Logging ----------

app.post('/api/cre/runs', async (c) => {
  const body = await c.req.json()
  db.prepare(
    `INSERT INTO cre_runs (started_at, action, order_id, chunk_amount, result, tx_hash, error, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(body.startedAt, body.action, body.orderId, body.chunkAmount, body.result, body.txHash, body.error, body.durationMs)
  return c.json({ ok: true })
})

app.get('/api/cre/runs', (c) => {
  const limit = Number(c.req.query('limit') || 50)
  const rows = db.prepare('SELECT * FROM cre_runs ORDER BY started_at DESC LIMIT ?').all(limit)
  return c.json(rows)
})

// ---------- Phase 2: Policy Update ----------

app.post('/api/policy', async (c) => {
  if (!arcWalletClient) {
    return c.json({ error: 'DEPLOYER_PRIVATE_KEY not configured' }, 500)
  }

  const body = await c.req.json()
  const { threshold, rateMin, rateMax } = body

  if (threshold == null || rateMin == null || rateMax == null) {
    return c.json({ error: 'Missing threshold, rateMin, or rateMax' }, 400)
  }

  const thresholdBig = BigInt(Math.floor(Number(threshold) * 1e6))
  const rateMinBig = BigInt(Math.floor(Number(rateMin) * 1e18))
  const rateMaxBig = BigInt(Math.floor(Number(rateMax) * 1e18))

  if (thresholdBig <= 0n) {
    return c.json({ error: 'Threshold must be greater than 0' }, 400)
  }
  if (rateMaxBig <= rateMinBig) {
    return c.json({ error: 'rateMax must be greater than rateMin' }, 400)
  }

  try {
    const txHash = await arcWalletClient.writeContract({
      address: TREASURY_VAULT,
      abi: SET_POLICY_ABI,
      functionName: 'setPolicy',
      args: [thresholdBig, rateMinBig, rateMaxBig],
    })
    return c.json({ ok: true, txHash })
  } catch (e: any) {
    console.error('setPolicy tx failed:', e)
    return c.json({ error: e.shortMessage || e.message || 'Transaction failed' }, 500)
  }
})

// ---------- Strategy Config (runtime tuning) ----------

app.get('/api/strategy/config', (c) => c.json(strategyConfig))

app.put('/api/strategy/config', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  updateStrategyConfig(body)
  return c.json(strategyConfig)
})

// ---------- Phase 2: Demo Mode ----------

let demoSpeed: { speed: 1 | 10; sleep: number } = { speed: 1, sleep: 55 }

app.get('/api/demo/speed', (c) => c.json(demoSpeed))

app.post('/api/demo/speed', async (c) => {
  if (!DEMO_MODE) return c.json({ error: 'Demo mode not enabled' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const speed = body.speed === 10 ? 10 : 1
  demoSpeed = { speed, sleep: speed === 10 ? 5 : 55 }
  return c.json(demoSpeed)
})

app.get('/api/demo/status', (c) => {
  const lastRun = db.prepare('SELECT started_at FROM cre_runs ORDER BY started_at DESC LIMIT 1').get() as any
  const lastTickAt = lastRun?.started_at || 0
  const sleep = demoSpeed.sleep
  const nextTickAt = lastTickAt + sleep
  const serverTime = Math.floor(Date.now() / 1000)

  return c.json({
    speed: demoSpeed.speed,
    sleep,
    lastTickAt,
    nextTickAt,
    serverTime,
  })
})

app.post('/api/demo/seed', async (c) => {
  if (!DEMO_MODE) return c.json({ error: 'Demo mode not enabled' }, 404)
  const now = Math.floor(Date.now() / 1000)
  const orders = [
    { id: `demo-${now}-1`, from: 'USDC', to: 'EURC', amount: '5000000', filled: '500000', output: '432000', status: 'FILLING', deadline: now + 3600 },
    { id: `demo-${now}-2`, from: 'USDC', to: 'EURC', amount: '10000000', filled: '4500000', output: '3900000', status: 'FILLING', deadline: now + 1800 },
    { id: `demo-${now}-3`, from: 'EURC', to: 'USDC', amount: '3000000', filled: '2400000', output: '2770000', status: 'FILLING', deadline: now + 900 },
  ]
  for (const o of orders) {
    db.prepare(
      `INSERT OR REPLACE INTO trade_orders (id, from_token, to_token, input_amount, filled_amount, output_received, deadline, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(o.id, o.from, o.to, o.amount, o.filled, o.output, o.deadline, o.status, now, now)
  }
  return c.json({ seeded: orders.length })
})

// ---------- Demo Fill Simulation (internal CRE) ----------

/**
 * Simulates what the real CRE (Conditional Rate Engine) would do:
 * For each APPROVED/FILLING order, evaluate the strategy and execute fills directly in DB.
 * Runs on the same tick interval as the strategy (demoSpeed.sleep seconds).
 */
async function demoFillLoop() {
  try {
    const now = Math.floor(Date.now() / 1000)

    // Auto-cancel expired orders
    db.prepare("UPDATE trade_orders SET status = 'CANCELLED', updated_at = ? WHERE status IN ('PENDING', 'APPROVED', 'FILLING') AND deadline < ?")
      .run(now, now)

    // Auto-approve PENDING orders (demo convenience — real flow requires World ID)
    const pendingOrders = db.prepare(
      "SELECT * FROM trade_orders WHERE status = 'PENDING' ORDER BY created_at ASC"
    ).all() as any[]
    for (const pending of pendingOrders) {
      db.prepare("UPDATE trade_orders SET status = 'APPROVED', updated_at = ? WHERE id = ?").run(now, pending.id)
      console.log(`[demo-fill] Auto-approved order ${pending.id.slice(0, 8)}`)
    }

    // Process all APPROVED/FILLING orders
    const orders = db.prepare(
      "SELECT * FROM trade_orders WHERE status IN ('APPROVED', 'FILLING') ORDER BY created_at ASC"
    ).all() as any[]

    if (orders.length === 0) return

    // Gather price snapshot (same as /api/strategy/next)
    const latestChainlink = db.prepare(
      "SELECT chainlink_price FROM prices WHERE pair = 'EURC/USD' ORDER BY timestamp DESC LIMIT 1"
    ).get() as any
    const latestFynd = db.prepare(
      "SELECT fynd_price FROM prices WHERE pair = 'EURC/USD' AND fynd_price IS NOT NULL ORDER BY timestamp DESC LIMIT 1"
    ).get() as any
    const latestUniswap = db.prepare(
      "SELECT uniswap_price FROM prices WHERE pair = 'EURC/USD' AND uniswap_price IS NOT NULL ORDER BY timestamp DESC LIMIT 1"
    ).get() as any
    const avg24hRow = db.prepare(
      "SELECT AVG(chainlink_price) as avg FROM prices WHERE pair = 'EURC/USD' AND timestamp > ?"
    ).get(now - 86400) as any

    const priceSnapshot: PriceSnapshot = {
      chainlinkPrice: latestChainlink?.chainlink_price ?? null,
      fyndPrice: latestFynd?.fynd_price ?? null,
      uniswapPrice: latestUniswap?.uniswap_price ?? null,
      avg24hPrice: avg24hRow?.avg ?? null,
    }

    if (!priceSnapshot.chainlinkPrice) {
      console.log('[demo-fill] No price data yet, skipping tick')
      return
    }

    for (const order of orders) {
      const inputAmount = BigInt(order.input_amount)
      const filledAmount = BigInt(order.filled_amount || '0')
      const outputReceived = BigInt(order.output_received || '0')
      const remaining = inputAmount - filledAmount

      if (remaining <= 0n) {
        db.prepare("UPDATE trade_orders SET status = 'COMPLETE', updated_at = ? WHERE id = ?").run(now, order.id)
        console.log(`[demo-fill] Order ${order.id.slice(0, 8)} completed (fully filled)`)
        continue
      }

      // Output-mode completion check
      if (order.mode === 'OUTPUT' && order.desired_output) {
        const desiredOutput = BigInt(order.desired_output)
        if (outputReceived >= desiredOutput) {
          db.prepare("UPDATE trade_orders SET status = 'COMPLETE', updated_at = ? WHERE id = ?").run(now, order.id)
          console.log(`[demo-fill] Order ${order.id.slice(0, 8)} completed (output target met)`)
          continue
        }
      }

      // Evaluate strategy
      const orderCtx: OrderContext = {
        inputAmount: order.input_amount,
        filledAmount: order.filled_amount || '0',
        createdAt: order.created_at,
        deadline: order.deadline,
        fromToken: order.from_token,
        toToken: order.to_token,
      }

      const timing = computeTimingScore(priceSnapshot, orderCtx, now)

      // Log the strategy decision
      insertDecision.run(
        now, order.id, timing.score, timing.action, timing.reason,
        timing.breakdown.priceScore, timing.breakdown.divergenceScore, timing.breakdown.urgencyScore,
        null, timing.chunkMultiplier, null,
      )
      updateOrderStrategy.run(timing.score, timing.reason, now, order.id)

      if (timing.action === 'WAIT') {
        console.log(`[demo-fill] Order ${order.id.slice(0, 8)}: WAIT (score ${timing.score}) — ${timing.reason}`)
        continue
      }

      // Compute adaptive chunk
      const chunk = adaptiveChunkSize({
        inputAmount,
        filledAmount,
        deadline: order.deadline,
        createdAt: order.created_at,
        timingScore: timing.score,
        now,
      })

      if (chunk <= 0n) continue

      // Simulate the fill: increment filled_amount, compute output received
      const rate = priceSnapshot.chainlinkPrice!
      const isBuyingEurc = order.to_token === 'EURC'
      // EURC/USD is "dollars per 1 EURC"
      // Buying EURC (USDC→EURC): output = chunk / rate
      // Selling EURC (EURC→USDC): output = chunk * rate
      const outputForChunk = isBuyingEurc
        ? Number(chunk) / rate
        : Number(chunk) * rate
      const outputAmount = BigInt(Math.floor(outputForChunk))

      const newFilled = filledAmount + chunk
      const newOutput = outputReceived + outputAmount
      const newStatus = newFilled >= inputAmount ? 'COMPLETE' : 'FILLING'

      // Update trade in DB
      db.prepare(
        `UPDATE trade_orders SET filled_amount = ?, output_received = ?, status = ?, updated_at = ? WHERE id = ?`
      ).run(newFilled.toString(), newOutput.toString(), newStatus, now, order.id)

      // Log CRE run
      db.prepare(
        `INSERT INTO cre_runs (started_at, action, order_id, chunk_amount, result, tx_hash, error, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(now, 'SWAP', order.id, chunk.toString(), newStatus, `demo-${now}-${order.id.slice(0, 8)}`, null, 0)

      const pctFilled = inputAmount > 0n ? Number((newFilled * 100n) / inputAmount) : 0
      console.log(
        `[demo-fill] Order ${order.id.slice(0, 8)}: SWAP chunk=${chunk.toString()} filled=${pctFilled}% status=${newStatus} (score ${timing.score})`
      )
    }
  } catch (e) {
    console.error('[demo-fill] Error in fill simulation loop:', e)
  }
}

// ---------- Main ----------

async function main() {
  await verifyFeeds()

  if (activeFeeds.length === 0) {
    console.warn('No feeds verified — server will start but no recording will happen')
  }

  // First record immediately, then every RECORD_INTERVAL
  record()
  setInterval(record, RECORD_INTERVAL)

  // Demo fill simulation loop
  function scheduleFillTick() {
    setTimeout(async () => {
      await demoFillLoop()
      scheduleFillTick()
    }, demoSpeed.sleep * 1000)
  }
  setTimeout(() => {
    demoFillLoop()
    scheduleFillTick()
  }, 5000)
  console.log(`Demo fill simulation enabled — ticking every ~${demoSpeed.sleep}s`)

  console.log(
    `Oracle server listening on :${PORT}, recording ${activeFeeds.length} feeds every ${RECORD_INTERVAL / 1000}s`
  )
  serve({ fetch: app.fetch, port: PORT })
}

main().catch(console.error)

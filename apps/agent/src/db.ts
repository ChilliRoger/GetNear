/**
 * GetNear Agent Runner — Local SQLite Persistence (P9+)
 * Stores fills, strategy decisions, durable submission attempts, and callback-verified settlement states.
 * Never marks unconfirmed or failed settlements as `is_simulated = false`, and never lets a stale write
 * downgrade a CONFIRMED fill.
 */

import Database from 'better-sqlite3'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', 'data')
const ENV_DB_PATH = process.env.GETNEAR_AGENT_DB_PATH?.trim()
const DB_PATH = ENV_DB_PATH ? path.resolve(ENV_DB_PATH) : path.join(DEFAULT_DATA_DIR, 'agent.db')

const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

export const db = new Database(DB_PATH)

// High-performance WAL mode with busy timeout
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_fills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    idempotency_key TEXT,
    amount_in TEXT NOT NULL,
    settlement_out TEXT,
    simulated_out TEXT NOT NULL,
    recipient TEXT,
    quote_ref TEXT NOT NULL,
    deviation_bps INTEGER NOT NULL,
    tx_hash TEXT,
    explorer_url TEXT,
    settlement_status TEXT,
    failure_reason TEXT,
    is_simulated INTEGER NOT NULL DEFAULT 1,
    ft_transfer_tx_hash TEXT,
    ft_transfer_url TEXT,
    timestamp INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_fills_order ON agent_fills(order_id);

  CREATE TABLE IF NOT EXISTS agent_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    score INTEGER NOT NULL,
    decision TEXT NOT NULL,
    reason TEXT NOT NULL,
    chunk_size TEXT NOT NULL,
    quote_ref TEXT,
    deviation_bps INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_decisions_order ON agent_decisions(order_id, timestamp);

  -- Durable record of every execute_chunk submission, written BEFORE the transaction is broadcast.
  CREATE TABLE IF NOT EXISTS agent_attempts (
    idempotency_key TEXT PRIMARY KEY,
    order_id INTEGER NOT NULL,
    attempt_no INTEGER NOT NULL DEFAULT 1,
    baseline_attempts INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL,
    amount_in TEXT NOT NULL,
    settlement_out TEXT NOT NULL,
    simulated_out TEXT NOT NULL,
    quote_ref TEXT NOT NULL,
    deviation_bps INTEGER NOT NULL,
    recipient TEXT,
    tx_hash TEXT,
    explorer_url TEXT,
    last_error TEXT,
    created_ms INTEGER NOT NULL,
    updated_ms INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attempts_state ON agent_attempts(state);
`)

// Safe column migrations for existing SQLite databases
const fillColumnMigrations = [
  `ALTER TABLE agent_fills ADD COLUMN ft_transfer_tx_hash TEXT;`,
  `ALTER TABLE agent_fills ADD COLUMN ft_transfer_url TEXT;`,
  `ALTER TABLE agent_fills ADD COLUMN idempotency_key TEXT;`,
  `ALTER TABLE agent_fills ADD COLUMN settlement_out TEXT;`,
  `ALTER TABLE agent_fills ADD COLUMN recipient TEXT;`,
  `ALTER TABLE agent_fills ADD COLUMN settlement_status TEXT;`,
  `ALTER TABLE agent_fills ADD COLUMN failure_reason TEXT;`,
]
for (const sql of fillColumnMigrations) {
  try {
    db.exec(sql)
  } catch {}
}
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fills_idempotency_key ON agent_fills(idempotency_key);`)

// Repair legacy rows where an unconfirmed off-chain ft_transfer was recorded with is_simulated = 0
db.exec(`
  UPDATE agent_fills
  SET
    settlement_status = CASE
      WHEN ft_transfer_tx_hash IS NOT NULL THEN 'CONFIRMED'
      WHEN is_simulated = 0 THEN 'UNVERIFIED_LEGACY'
      ELSE 'SIMULATED'
    END,
    is_simulated = CASE
      WHEN ft_transfer_tx_hash IS NOT NULL THEN 0
      ELSE 1
    END
  WHERE settlement_status IS NULL;
`)

export type SettlementStatus =
  | 'CONFIRMED'
  | 'FAILED'
  | 'IN_FLIGHT'
  | 'SIMULATED'
  | 'UNVERIFIED_LEGACY'

export interface AgentFill {
  id?: number
  order_id: number
  chunk_index: number
  idempotency_key?: string
  amount_in: string
  settlement_out?: string
  simulated_out: string
  recipient?: string
  quote_ref: string
  deviation_bps: number
  tx_hash?: string
  explorer_url?: string
  ft_transfer_tx_hash?: string
  ft_transfer_url?: string
  settlement_status?: SettlementStatus
  failure_reason?: string
  is_simulated: boolean
  timestamp: number
}

export interface AgentDecisionRecord {
  id?: number
  order_id: number
  timestamp: number
  score: number
  decision: string
  reason: string
  chunk_size: string
  quote_ref?: string
  deviation_bps?: number
}

function resolveFillState(fill: AgentFill): {
  status: SettlementStatus
  isSimulatedInt: number
} {
  const requestedStatus: SettlementStatus =
    fill.settlement_status ?? (fill.is_simulated ? 'SIMULATED' : 'CONFIRMED')

  // Only CONFIRMED fills may ever be marked non-simulated (real on-chain NEP-141 settlement).
  const isConfirmed = requestedStatus === 'CONFIRMED' && !fill.is_simulated
  return {
    status: requestedStatus === 'CONFIRMED' && !isConfirmed ? 'SIMULATED' : requestedStatus,
    isSimulatedInt: isConfirmed ? 0 : 1,
  }
}

/**
 * SQL fragments for the idempotency-key upsert. A CONFIRMED row is immutable: a stale or late write
 * (e.g. a FAILED / IN_FLIGHT observation taken before the callback landed) can never downgrade the
 * status or overwrite confirmed amounts. Receipt metadata can only be filled in where it is still NULL.
 */
const CONFIRMED = `agent_fills.settlement_status = 'CONFIRMED'`
const keepConfirmed = (col: string) =>
  `CASE WHEN ${CONFIRMED} THEN agent_fills.${col} ELSE excluded.${col} END`
const fillMeta = (col: string) =>
  `CASE WHEN ${CONFIRMED} THEN COALESCE(agent_fills.${col}, excluded.${col}) ELSE COALESCE(excluded.${col}, agent_fills.${col}) END`

const INSERT_FILL_SQL = `
  INSERT INTO agent_fills (
    order_id, chunk_index, idempotency_key, amount_in, settlement_out, simulated_out,
    recipient, quote_ref, deviation_bps, tx_hash, explorer_url,
    ft_transfer_tx_hash, ft_transfer_url, settlement_status, failure_reason,
    is_simulated, timestamp
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

export function recordFill(fill: AgentFill): void {
  const { status, isSimulatedInt } = resolveFillState(fill)

  const params = [
    fill.order_id,
    fill.chunk_index,
    fill.idempotency_key ?? null,
    fill.amount_in,
    fill.settlement_out ?? null,
    fill.simulated_out,
    fill.recipient ?? null,
    fill.quote_ref,
    fill.deviation_bps,
    fill.tx_hash || null,
    fill.explorer_url || null,
    fill.ft_transfer_tx_hash || null,
    fill.ft_transfer_url || null,
    status,
    fill.failure_reason ?? null,
    isSimulatedInt,
    fill.timestamp,
  ]

  if (fill.idempotency_key) {
    db.prepare(`${INSERT_FILL_SQL}
      ON CONFLICT(idempotency_key) DO UPDATE SET
        order_id = ${keepConfirmed('order_id')},
        chunk_index = ${keepConfirmed('chunk_index')},
        amount_in = ${keepConfirmed('amount_in')},
        settlement_out = ${keepConfirmed('settlement_out')},
        simulated_out = ${keepConfirmed('simulated_out')},
        quote_ref = ${keepConfirmed('quote_ref')},
        deviation_bps = ${keepConfirmed('deviation_bps')},
        recipient = ${fillMeta('recipient')},
        tx_hash = ${fillMeta('tx_hash')},
        explorer_url = ${fillMeta('explorer_url')},
        ft_transfer_tx_hash = ${fillMeta('ft_transfer_tx_hash')},
        ft_transfer_url = ${fillMeta('ft_transfer_url')},
        settlement_status = ${keepConfirmed('settlement_status')},
        failure_reason = ${keepConfirmed('failure_reason')},
        is_simulated = ${keepConfirmed('is_simulated')},
        timestamp = ${keepConfirmed('timestamp')}
    `).run(...params)
    return
  }

  db.prepare(INSERT_FILL_SQL).run(...params)
}

export function recordDecision(rec: AgentDecisionRecord): void {
  const stmt = db.prepare(`
    INSERT INTO agent_decisions (
      order_id, timestamp, score, decision, reason, chunk_size, quote_ref, deviation_bps
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    rec.order_id,
    rec.timestamp,
    rec.score,
    rec.decision,
    rec.reason,
    rec.chunk_size,
    rec.quote_ref || null,
    rec.deviation_bps ?? null,
  )
}

export function getRecentFills(limit = 50): AgentFill[] {
  const rows = db.prepare(`SELECT * FROM agent_fills ORDER BY timestamp DESC, id DESC LIMIT ?`).all(limit) as any[]
  return rows.map((r) => ({
    ...r,
    is_simulated: Boolean(r.is_simulated),
  }))
}

export function getFillByKey(idempotencyKey: string): AgentFill | null {
  const row = db.prepare(`SELECT * FROM agent_fills WHERE idempotency_key = ?`).get(idempotencyKey) as any
  return row ? { ...row, is_simulated: Boolean(row.is_simulated) } : null
}

export function getRecentDecisions(limit = 100): AgentDecisionRecord[] {
  return db.prepare(`SELECT * FROM agent_decisions ORDER BY timestamp DESC, id DESC LIMIT ?`).all(limit) as AgentDecisionRecord[]
}

export function getOrderFillsCount(orderId: number): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM agent_fills WHERE order_id = ? AND COALESCE(settlement_status, '') != 'FAILED'`,
    )
    .get(orderId) as any
  return row?.cnt || 0
}

// ── Durable submission attempts ──────────────────────────────────────────────────────────────

export type AttemptState =
  | 'PREPARED' // written before broadcast; the transaction may or may not have been sent
  | 'SUBMITTED' // near-cli returned a transaction identity; awaiting on-chain verification
  | 'UNCERTAIN' // timeout / transport error: outcome unknown, the tx may still land
  | 'CONFIRMED' // on-chain chunk record is Settled
  | 'FAILED' // on-chain evidence the attempt failed (chunk Failed, or the tx was rejected); retry allowed
  | 'NOT_SENT' // definitely never broadcast; retry allowed
  | 'ABANDONED' // no chunk record and the landing window elapsed: can no longer land; retry allowed

export const UNRESOLVED_ATTEMPT_STATES: readonly AttemptState[] = ['PREPARED', 'SUBMITTED', 'UNCERTAIN']

export interface AgentAttempt {
  idempotency_key: string
  order_id: number
  attempt_no: number
  /** contract ChunkRecord.attempts observed before this submission (evidence baseline). */
  baseline_attempts: number
  state: AttemptState
  amount_in: string
  settlement_out: string
  simulated_out: string
  quote_ref: string
  deviation_bps: number
  recipient: string | null
  tx_hash: string | null
  explorer_url: string | null
  last_error: string | null
  created_ms: number
  updated_ms: number
}

export type NewAttempt = Pick<
  AgentAttempt,
  'idempotency_key' | 'order_id' | 'amount_in' | 'settlement_out' | 'simulated_out' | 'quote_ref' | 'deviation_bps'
> & { recipient?: string | null; baseline_attempts?: number }

export function isUnresolved(state: AttemptState): boolean {
  return UNRESOLVED_ATTEMPT_STATES.includes(state)
}

export function getAttempt(idempotencyKey: string): AgentAttempt | null {
  return (
    (db.prepare(`SELECT * FROM agent_attempts WHERE idempotency_key = ?`).get(idempotencyKey) as
      | AgentAttempt
      | undefined) ?? null
  )
}

export function getUnresolvedAttempts(): AgentAttempt[] {
  const placeholders = UNRESOLVED_ATTEMPT_STATES.map(() => '?').join(',')
  return db
    .prepare(`SELECT * FROM agent_attempts WHERE state IN (${placeholders}) ORDER BY created_ms ASC`)
    .all(...UNRESOLVED_ATTEMPT_STATES) as AgentAttempt[]
}

/**
 * Persist the attempt BEFORE broadcast. Refuses to start a new attempt for a key whose previous attempt
 * is still unresolved: the caller must verify it on-chain (or wait) first.
 */
export function recordAttemptPrepared(a: NewAttempt, nowMs = Date.now()): AgentAttempt {
  const existing = getAttempt(a.idempotency_key)
  if (existing && isUnresolved(existing.state)) {
    throw new Error(
      `Attempt ${a.idempotency_key} is ${existing.state}; it must be verified on-chain before a new attempt is prepared`,
    )
  }
  if (existing && existing.state === 'CONFIRMED') {
    throw new Error(`Attempt ${a.idempotency_key} is already CONFIRMED; nothing to prepare`)
  }
  if (existing) {
    db.prepare(
      `UPDATE agent_attempts SET attempt_no = ?, baseline_attempts = ?, state = 'PREPARED', amount_in = ?, settlement_out = ?, simulated_out = ?,
         quote_ref = ?, deviation_bps = ?, recipient = ?, tx_hash = NULL, explorer_url = NULL, last_error = NULL,
         created_ms = ?, updated_ms = ? WHERE idempotency_key = ?`,
    ).run(
      existing.attempt_no + 1,
      a.baseline_attempts ?? 0,
      a.amount_in,
      a.settlement_out,
      a.simulated_out,
      a.quote_ref,
      a.deviation_bps,
      a.recipient ?? null,
      nowMs,
      nowMs,
      a.idempotency_key,
    )
  } else {
    db.prepare(
      `INSERT INTO agent_attempts (idempotency_key, order_id, attempt_no, baseline_attempts, state, amount_in, settlement_out,
         simulated_out, quote_ref, deviation_bps, recipient, created_ms, updated_ms)
       VALUES (?, ?, 1, ?, 'PREPARED', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      a.idempotency_key,
      a.order_id,
      a.baseline_attempts ?? 0,
      a.amount_in,
      a.settlement_out,
      a.simulated_out,
      a.quote_ref,
      a.deviation_bps,
      a.recipient ?? null,
      nowMs,
      nowMs,
    )
  }
  return getAttempt(a.idempotency_key)!
}

export function updateAttempt(
  idempotencyKey: string,
  patch: { state?: AttemptState; tx_hash?: string | null; explorer_url?: string | null; last_error?: string | null },
  nowMs = Date.now(),
): void {
  const cur = getAttempt(idempotencyKey)
  if (!cur) return
  // A CONFIRMED attempt is terminal and can never be reopened or downgraded by a stale observation.
  if (cur.state === 'CONFIRMED' && patch.state && patch.state !== 'CONFIRMED') return
  db.prepare(
    `UPDATE agent_attempts SET state = ?, tx_hash = COALESCE(?, tx_hash), explorer_url = COALESCE(?, explorer_url),
       last_error = ?, updated_ms = ? WHERE idempotency_key = ?`,
  ).run(
    patch.state ?? cur.state,
    patch.tx_hash ?? null,
    patch.explorer_url ?? null,
    patch.last_error === undefined ? cur.last_error : patch.last_error,
    nowMs,
    idempotencyKey,
  )
}

// ── First-seen timestamps (the contract stores no creation time; the urgency curve needs one) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_order_seen (
    order_id INTEGER PRIMARY KEY,
    first_seen_ms INTEGER NOT NULL
  );
`)

/** When the agent first saw an order. Persisted so a restart does not reset the urgency curve. */
export function getOrderFirstSeen(orderId: number, nowMs: number = Date.now()): number {
  const row = db.prepare('SELECT first_seen_ms FROM agent_order_seen WHERE order_id = ?').get(orderId) as
    | { first_seen_ms: number }
    | undefined
  if (row) return row.first_seen_ms
  db.prepare('INSERT OR IGNORE INTO agent_order_seen (order_id, first_seen_ms) VALUES (?, ?)').run(orderId, nowMs)
  return nowMs
}

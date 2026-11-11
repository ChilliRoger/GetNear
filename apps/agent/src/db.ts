/**
 * GetNear Agent Runner — Local SQLite Persistence (P9+)
 * Stores fills, strategy decisions, and callback-verified settlement states.
 * Never marks unconfirmed or failed settlements as `is_simulated = false`.
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

export function recordFill(fill: AgentFill): void {
  const { status, isSimulatedInt } = resolveFillState(fill)

  if (fill.idempotency_key) {
    const stmt = db.prepare(`
      INSERT INTO agent_fills (
        order_id, chunk_index, idempotency_key, amount_in, settlement_out, simulated_out,
        recipient, quote_ref, deviation_bps, tx_hash, explorer_url,
        ft_transfer_tx_hash, ft_transfer_url, settlement_status, failure_reason,
        is_simulated, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(idempotency_key) DO UPDATE SET
        settlement_out = excluded.settlement_out,
        recipient = COALESCE(excluded.recipient, agent_fills.recipient),
        tx_hash = COALESCE(excluded.tx_hash, agent_fills.tx_hash),
        explorer_url = COALESCE(excluded.explorer_url, agent_fills.explorer_url),
        ft_transfer_tx_hash = COALESCE(excluded.ft_transfer_tx_hash, agent_fills.ft_transfer_tx_hash),
        ft_transfer_url = COALESCE(excluded.ft_transfer_url, agent_fills.ft_transfer_url),
        settlement_status = excluded.settlement_status,
        failure_reason = excluded.failure_reason,
        is_simulated = excluded.is_simulated,
        timestamp = excluded.timestamp
    `)
    stmt.run(
      fill.order_id,
      fill.chunk_index,
      fill.idempotency_key,
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
    )
    return
  }

  const stmt = db.prepare(`
    INSERT INTO agent_fills (
      order_id, chunk_index, idempotency_key, amount_in, settlement_out, simulated_out,
      recipient, quote_ref, deviation_bps, tx_hash, explorer_url,
      ft_transfer_tx_hash, ft_transfer_url, settlement_status, failure_reason,
      is_simulated, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    fill.order_id,
    fill.chunk_index,
    null,
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
  )
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


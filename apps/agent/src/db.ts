/**
 * GetNear Agent Runner — Local SQLite Persistence (P9)
 * Stores simulated fills, strategy decisions, and audit records with strict provenance.
 */

import Database from 'better-sqlite3'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..', 'data')
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const DB_PATH = path.join(DATA_DIR, 'agent.db')
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
    amount_in TEXT NOT NULL,
    simulated_out TEXT NOT NULL,
    quote_ref TEXT NOT NULL,
    deviation_bps INTEGER NOT NULL,
    tx_hash TEXT,
    explorer_url TEXT,
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
try {
  db.exec(`ALTER TABLE agent_fills ADD COLUMN ft_transfer_tx_hash TEXT;`)
} catch {}
try {
  db.exec(`ALTER TABLE agent_fills ADD COLUMN ft_transfer_url TEXT;`)
} catch {}

export interface AgentFill {
  id?: number
  order_id: number
  chunk_index: number
  amount_in: string
  simulated_out: string
  quote_ref: string
  deviation_bps: number
  tx_hash?: string
  explorer_url?: string
  ft_transfer_tx_hash?: string
  ft_transfer_url?: string
  is_simulated: boolean
  timestamp: number
}

export interface AgentDecisionRecord {
  id?: number
  order_id: number
  timestamp: number
  score: number
  decision: 'EXECUTE' | 'WAIT'
  reason: string
  chunk_size: string
  quote_ref?: string
  deviation_bps?: number
}

export function recordFill(fill: AgentFill): void {
  const stmt = db.prepare(`
    INSERT INTO agent_fills (
      order_id, chunk_index, amount_in, simulated_out,
      quote_ref, deviation_bps, tx_hash, explorer_url, ft_transfer_tx_hash, ft_transfer_url, is_simulated, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    fill.order_id,
    fill.chunk_index,
    fill.amount_in,
    fill.simulated_out,
    fill.quote_ref,
    fill.deviation_bps,
    fill.tx_hash || null,
    fill.explorer_url || null,
    fill.ft_transfer_tx_hash || null,
    fill.ft_transfer_url || null,
    fill.is_simulated ? 1 : 0,
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
  const rows = db.prepare(`SELECT * FROM agent_fills ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[]
  return rows.map((r) => ({
    ...r,
    is_simulated: Boolean(r.is_simulated),
  }))
}

export function getRecentDecisions(limit = 100): AgentDecisionRecord[] {
  return db.prepare(`SELECT * FROM agent_decisions ORDER BY timestamp DESC LIMIT ?`).all(limit) as AgentDecisionRecord[]
}

export function getOrderFillsCount(orderId: number): number {
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM agent_fills WHERE order_id = ?`).get(orderId) as any
  return row?.cnt || 0
}


import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "..", "data", "privacy.db");

// Ensure data directory exists
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL for better concurrent read performance
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS privacy_transactions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_id         TEXT    NOT NULL,
    type          TEXT    NOT NULL CHECK(type IN ('deposit','execute','withdraw','faucet','transfer')),
    token         TEXT    NOT NULL DEFAULT '',
    amount        TEXT    NOT NULL DEFAULT '0',
    status        TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','failed')),
    evm_tx_hash   TEXT,
    error         TEXT,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS demo_runs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    step          TEXT    NOT NULL DEFAULT 'init'
                  CHECK(step IN ('init','depositing','executing','withdrawing','complete','failed')),
    deposit_tx_id TEXT,
    execute_tx_id TEXT,
    withdraw_tx_id TEXT,
    input_token   TEXT,
    output_token  TEXT,
    input_amount  TEXT,
    output_amount TEXT,
    error         TEXT,
    completed_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS shield_transactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    direction       TEXT    NOT NULL CHECK(direction IN ('shield', 'unshield')),
    token           TEXT    NOT NULL,
    token_symbol    TEXT    NOT NULL,
    amount          TEXT    NOT NULL,
    display_amount  TEXT    NOT NULL,
    tx_hash         TEXT,
    unlink_tx_id    TEXT,
    explorer_url    TEXT,
    status          TEXT    NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending', 'confirmed', 'failed')),
    created_at      INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

export default db;

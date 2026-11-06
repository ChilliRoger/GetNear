-- Privacy Treasury v2 schema additions
-- Run after the existing privacy_transactions and demo_runs tables.

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

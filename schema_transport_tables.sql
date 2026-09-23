-- Transport module D1 persistence table (key-value store)
CREATE TABLE IF NOT EXISTS transport_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

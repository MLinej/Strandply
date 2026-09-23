-- Sales module D1 persistence table (key-value store, same pattern as purchase_state)
CREATE TABLE IF NOT EXISTS sales_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Stores module MRN/GRN shared tables (read by Purchase module for dropdowns)
CREATE TABLE IF NOT EXISTS stores_mrn (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  driver TEXT NOT NULL,
  vendor TEXT NOT NULL,
  invoice_no TEXT NOT NULL,
  security_guard TEXT NOT NULL,
  items TEXT NOT NULL,
  gate_remarks TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stores_grn (
  id TEXT PRIMARY KEY,
  mrn_id TEXT NOT NULL,
  date TEXT NOT NULL,
  received_by TEXT NOT NULL,
  invoice_no TEXT NOT NULL,
  quality TEXT NOT NULL DEFAULT 'ok',
  actual_qty TEXT NOT NULL,
  remarks TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'completed',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

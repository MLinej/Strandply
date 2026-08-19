-- Purchase module state persistence (ERP purchase module)
-- Full JSON snapshots per key so the nested purchase data (entries/POs/returns/
-- opening stock/audit) survives refresh and is shared across devices.

CREATE TABLE IF NOT EXISTS purchase_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

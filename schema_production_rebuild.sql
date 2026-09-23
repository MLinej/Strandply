/* ══════════════════════════════════════════════════════════
   PRODUCTION MODULE — Drop & Recreate All Tables
   Existing tables are empty (0 rows), safe to recreate.
   Run: npx wrangler d1 execute strand-portal-db --remote --file=schema_production_rebuild.sql
   ══════════════════════════════════════════════════════════ */

-- ══ Drop existing empty tables (they have wrong schemas) ══
DROP TABLE IF EXISTS production_weight_records;
DROP TABLE IF EXISTS production_weight_batches;
DROP TABLE IF EXISTS production_summaries;
DROP TABLE IF EXISTS production_hotpress_reports;
DROP TABLE IF EXISTS production_chipping_reports;

-- ══ 1. production_chipping_reports ══
CREATE TABLE IF NOT EXISTS production_chipping_reports (
  id TEXT PRIMARY KEY,
  report_date TEXT DEFAULT '',
  shift TEXT DEFAULT 'Day',
  machine_no TEXT DEFAULT '',
  operator_name TEXT DEFAULT '',
  total_kg REAL DEFAULT 0,
  total_amt REAL DEFAULT 0,
  avg_rate REAL DEFAULT 0,
  lots_json TEXT DEFAULT '[]',
  wip_batch_id TEXT DEFAULT '',
  wf_state TEXT DEFAULT 'draft',
  status TEXT DEFAULT 'saved',
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ══ 2. production_hotpress_reports ══
CREATE TABLE IF NOT EXISTS production_hotpress_reports (
  id TEXT PRIMARY KEY,
  report_date TEXT DEFAULT '',
  shift TEXT DEFAULT 'Day',
  operator_name TEXT DEFAULT '',
  total_boards INTEGER DEFAULT 0,
  product TEXT DEFAULT '',
  size TEXT DEFAULT '8x4',
  charges_json TEXT DEFAULT '[]',
  total_time_mins INTEGER DEFAULT 0,
  spare_time_mins INTEGER DEFAULT 0,
  avg_press_mins INTEGER DEFAULT 0,
  wf_state TEXT DEFAULT 'draft',
  status TEXT DEFAULT 'saved',
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ══ 3. production_summaries ══
CREATE TABLE IF NOT EXISTS production_summaries (
  id TEXT PRIMARY KEY,
  report_date TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ══ 4. production_weight_batches ══
CREATE TABLE IF NOT EXISTS production_weight_batches (
  id TEXT PRIMARY KEY,
  batch_name TEXT NOT NULL,
  batch_date TEXT NOT NULL,
  board_type TEXT,
  thickness REAL,
  target_weight REAL,
  tolerance_pct REAL DEFAULT 5,
  status TEXT CHECK(status IN ('open','closed')) DEFAULT 'open',
  total_records INTEGER DEFAULT 0,
  avg_weight REAL DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ══ 5. production_weight_records ══
CREATE TABLE IF NOT EXISTS production_weight_records (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES production_weight_batches(id),
  serial_no INTEGER,
  weight REAL NOT NULL,
  status TEXT CHECK(status IN ('ok','over','under')) DEFAULT 'ok',
  punched_by TEXT,
  punched_at TEXT DEFAULT (datetime('now'))
);

-- ══ 6. production_bc_reports ══
CREATE TABLE IF NOT EXISTS production_bc_reports (
  id TEXT PRIMARY KEY,
  report_date TEXT DEFAULT '',
  shift TEXT DEFAULT 'Day',
  operator_name TEXT DEFAULT '',
  product TEXT DEFAULT '',
  size TEXT DEFAULT '',
  linked_hp TEXT DEFAULT '',
  hp_pcs INTEGER DEFAULT 0,
  cut_pcs INTEGER DEFAULT 0,
  reject_pcs INTEGER DEFAULT 0,
  reject_pct REAL DEFAULT 0,
  wf_state TEXT DEFAULT 'draft',
  status TEXT DEFAULT 'saved',
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ══ 7. production_mdo_reports ══
CREATE TABLE IF NOT EXISTS production_mdo_reports (
  id TEXT PRIMARY KEY,
  report_date TEXT DEFAULT '',
  shift TEXT DEFAULT 'Day',
  operator_name TEXT DEFAULT '',
  press_start TEXT DEFAULT '',
  press_end TEXT DEFAULT '',
  working_time TEXT DEFAULT '',
  total_pcs INTEGER DEFAULT 0,
  total_paper_used REAL DEFAULT 0,
  total_paper_wastage REAL DEFAULT 0,
  items_json TEXT DEFAULT '[]',
  wf_state TEXT DEFAULT 'draft',
  status TEXT DEFAULT 'saved',
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ══ 8. production_wip_batches ══
CREATE TABLE IF NOT EXISTS production_wip_batches (
  id TEXT PRIMARY KEY,
  batch_date TEXT NOT NULL,
  chip_id TEXT DEFAULT '',
  lots_json TEXT DEFAULT '[]',
  total_kg REAL DEFAULT 0,
  total_amt REAL DEFAULT 0,
  avg_rate_kg REAL DEFAULT 0,
  consumed_kg REAL DEFAULT 0,
  shift TEXT DEFAULT 'Day',
  status TEXT DEFAULT 'available',
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ══ 9. production_matt_batches ══
CREATE TABLE IF NOT EXISTS production_matt_batches (
  id TEXT PRIMARY KEY,
  batch_date TEXT NOT NULL,
  shift TEXT DEFAULT 'Day',
  product TEXT DEFAULT '',
  size TEXT DEFAULT '',
  thickness TEXT DEFAULT '',
  operator_name TEXT DEFAULT '',
  setpoint REAL DEFAULT 0,
  warn_band REAL DEFAULT 0.5,
  target_qty INTEGER DEFAULT 0,
  total_matts INTEGER DEFAULT 0,
  avg_weight REAL DEFAULT 0,
  pass_count INTEGER DEFAULT 0,
  warn_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  pass_rate REAL DEFAULT 0,
  status TEXT CHECK(status IN ('open','closed')) DEFAULT 'open',
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ══ 10. production_matt_records ══
CREATE TABLE IF NOT EXISTS production_matt_records (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES production_matt_batches(id),
  matt_num INTEGER NOT NULL,
  weight REAL NOT NULL,
  status TEXT CHECK(status IN ('pass','warn','fail')) DEFAULT 'pass',
  deviation REAL DEFAULT 0,
  punched_at TEXT DEFAULT (datetime('now'))
);

-- ══ 11. production_pp_reports ══
CREATE TABLE IF NOT EXISTS production_pp_reports (
  id TEXT PRIMARY KEY,
  plan_date TEXT NOT NULL,
  shift TEXT DEFAULT 'Day',
  plan_operator TEXT DEFAULT '',
  products_json TEXT DEFAULT '[]',
  linked_hp TEXT DEFAULT '',
  linked_mw TEXT DEFAULT '',
  linked_bc TEXT DEFAULT '',
  linked_ps TEXT DEFAULT '',
  wf_state TEXT DEFAULT 'draft',
  remarks TEXT DEFAULT '',
  full_data TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ══ 12. production_resin_entries ══
CREATE TABLE IF NOT EXISTS production_resin_entries (
  id TEXT PRIMARY KEY,
  report_date TEXT NOT NULL,
  shift TEXT DEFAULT 'Day',
  lot_no TEXT NOT NULL,
  vendor_name TEXT DEFAULT '',
  invoice_no TEXT DEFAULT '',
  qty REAL DEFAULT 0,
  rate_kg REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  product TEXT DEFAULT '',
  operator_name TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  linked_ps TEXT DEFAULT '',
  linked_pp TEXT DEFAULT '',
  status TEXT DEFAULT 'saved',
  created_at TEXT DEFAULT (datetime('now'))
);

/* ══════════════════════════════════════════════════════════
   INCREMENTAL MIGRATION — Production Module v2 (Full API Persistence)
   Adds missing tables for BC, MATT, WIP, MDO, PP sub-modules.

   Run against live D1 database:
     npx wrangler d1 execute strand-portal-db --remote --file=schema_production_v2_update.sql
══════════════════════════════════════════════════════════ */

-- ── Board Cutting Reports ─────────────────────────────────
CREATE TABLE IF NOT EXISTS production_bc_reports (
  id TEXT PRIMARY KEY,
  report_date TEXT NOT NULL,
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
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── Matt Weight Batches ───────────────────────────────────
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

-- ── Matt Weight Records (individual punches) ──────────────
CREATE TABLE IF NOT EXISTS production_matt_records (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES production_matt_batches(id),
  matt_num INTEGER NOT NULL,
  weight REAL NOT NULL,
  status TEXT CHECK(status IN ('pass','warn','fail')) DEFAULT 'pass',
  deviation REAL DEFAULT 0,
  punched_at TEXT DEFAULT (datetime('now'))
);

-- ── WIP Nilgiri Stock Batches ─────────────────────────────
CREATE TABLE IF NOT EXISTS production_wip_batches (
  id TEXT PRIMARY KEY,
  batch_date TEXT NOT NULL,
  chip_id TEXT DEFAULT '',
  lots_json TEXT DEFAULT '[]',
  total_kg REAL DEFAULT 0,
  total_amt REAL DEFAULT 0,
  avg_rate_kg REAL DEFAULT 0,
  consumed_kg REAL DEFAULT 0,
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── MDO Press Reports ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_mdo_reports (
  id TEXT PRIMARY KEY,
  report_date TEXT NOT NULL,
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
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── Production Planning Reports ───────────────────────────
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
  full_data TEXT DEFAULT '',   -- Full JSON of entire PP entry for lossless round-trip
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── Resin Consumption Entries ──────────────────────────────
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

-- ── Update admin user sub_rights to include wip sub-module ─
UPDATE users SET
  sub_rights = '{"dispatch":["req","disp","track","party","courier","product","report","settings"],"vendor":["vend_list","vend_po","vend_inv","vend_pay"],"reports":["rpt_dash","rpt_disp","rpt_sales","rpt_exp"],"hr":["hr_emp","hr_att","hr_leave","hr_sal"],"production":["pr_chip","pr_hp","pr_weight","pr_resin","pr_bc","pr_plan","pr_sum","pr_mdo","pr_rep","pr_wip"],"transport":["tr_inq","tr_rate","tr_appr","tr_order","tr_track"],"erp":["erp_entry","erp_po","erp_truck","erp_dncn","erp_inv","erp_report"],"accounts":["ac_inv","ac_recv","ac_pay","ac_gst"],"stock":["stk_slip","stk_ledger","stk_stock","stk_reclass","stk_master"],"maintenance":["mt_wo","mt_board","mt_area","mt_timeline","mt_export"],"electricity":["el_punch","el_reports","el_monthly","el_bills","el_config"]}'
WHERE username = 'admin';

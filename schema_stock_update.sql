/* ══════════════════════════════════════════════════════════
   INCREMENTAL MIGRATION — Stock Management Module
   Run against existing D1 database:
     npx wrangler d1 execute strand-portal-db --remote --file=schema_stock_update.sql
 ══════════════════════════════════════════════════════════ */

-- Create stock_slips table
CREATE TABLE IF NOT EXISTS stock_slips (
  id TEXT PRIMARY KEY,
  slip_type TEXT CHECK(slip_type IN ('SIS','SRS')) NOT NULL,
  slip_no TEXT UNIQUE NOT NULL,
  from_id TEXT,
  from_sku TEXT NOT NULL,
  from_thick TEXT,
  to_id TEXT,
  to_sku TEXT NOT NULL,
  to_thick TEXT,
  qty REAL NOT NULL,
  batch TEXT,
  ref_no TEXT,
  shift TEXT,
  remarks TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Create stock_balances table
CREATE TABLE IF NOT EXISTS stock_balances (
  sku TEXT PRIMARY KEY,
  dept TEXT,
  qty REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Create stock_reclass table
CREATE TABLE IF NOT EXISTS stock_reclass (
  id TEXT PRIMARY KEY,
  str_no TEXT UNIQUE NOT NULL,
  from_sku TEXT NOT NULL,
  to_sku TEXT NOT NULL,
  qty REAL NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  entry_date TEXT,
  from_desc TEXT,
  to_desc TEXT,
  from_dept TEXT,
  to_dept TEXT,
  scenario TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Create stock_opening table
CREATE TABLE IF NOT EXISTS stock_opening (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  desc TEXT,
  qty REAL NOT NULL,
  entry_date TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Create production_summaries table
CREATE TABLE IF NOT EXISTS production_summaries (
  id TEXT PRIMARY KEY,
  report_date TEXT NOT NULL,
  remarks TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- UPDATE ADMIN USER MODULES & SUB-RIGHTS TO INCLUDE STOCK
UPDATE users SET
  modules = '["dispatch","vendor","reports","hr","production","transport","erp","accounts","stock"]',
  sub_rights = '{"dispatch":["req","disp","track","party","courier","product","report","settings"],"vendor":["vend_list","vend_po","vend_inv","vend_pay"],"reports":["rpt_dash","rpt_disp","rpt_sales","rpt_exp"],"hr":["hr_emp","hr_att","hr_leave","hr_sal"],"production":["pr_batch","pr_qual","pr_mat","pr_weight"],"transport":["tr_inq","tr_rate","tr_appr","tr_order","tr_track"],"erp":["erp_entry","erp_po","erp_truck","erp_dncn","erp_inv","erp_report"],"accounts":["ac_inv","ac_recv","ac_pay","ac_gst"],"stock":["stk_slip","stk_ledger","stk_stock","stk_reclass","stk_master"]}'
WHERE username = 'admin';

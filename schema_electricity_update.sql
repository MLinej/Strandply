/* ══════════════════════════════════════════════════════════
   INCREMENTAL MIGRATION — Electricity & Meter MIS Module
   Run against existing D1 database:
     npx wrangler d1 execute strand-portal-db --remote --file=schema_electricity_update.sql
 ══════════════════════════════════════════════════════════ */

-- Create electricity_readings table
CREATE TABLE IF NOT EXISTS electricity_readings (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  shift TEXT CHECK(shift IN ('AM','PM')) NOT NULL,
  time TEXT NOT NULL,
  kwh REAL NOT NULL,
  pf REAL,
  night REAL,
  energy_rate REAL,
  fuel_rate REAL,
  remarks TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Create electricity_bills table
CREATE TABLE IF NOT EXISTS electricity_bills (
  id TEXT PRIMARY KEY,
  bill_date TEXT NOT NULL,
  due_date TEXT,
  paid_date TEXT,
  adv_payment REAL,
  kwh_curr REAL NOT NULL,
  kwh_diff REAL,
  kwh_mf REAL,
  kvarh_curr REAL,
  kvarh_diff REAL,
  kvarh_mf REAL,
  pf REAL,
  night_units REAL,
  demand_chg REAL,
  energy_chg REAL,
  fuel_sur REAL,
  pf_rebate REAL,
  night_rebate REAL,
  ehv_rebate REAL,
  tou_chg REAL,
  gt_chg REAL,
  total_consp REAL,
  elec_duty REAL,
  meter_chg REAL,
  tcs REAL,
  net_payable REAL,
  total_payable REAL NOT NULL,
  remarks TEXT,
  pdf_name TEXT,
  pdf_data TEXT, -- Base64 encoded PDF
  created_at TEXT DEFAULT (datetime('now'))
);

-- Create electricity_rates_history table
CREATE TABLE IF NOT EXISTS electricity_rates_history (
  id TEXT PRIMARY KEY,
  type TEXT CHECK(type IN ('MF','FC','ER','FR')) NOT NULL,
  value REAL NOT NULL,
  effective_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Create electricity_meter_config table
CREATE TABLE IF NOT EXISTS electricity_meter_config (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

-- Seed default meter config
INSERT OR IGNORE INTO electricity_meter_config (key, value) VALUES
  ('meter_no', 'GJ-123456-HT'),
  ('consumer_no', '1234567890'),
  ('category', 'HT Industrial'),
  ('sanc_load', '500'),
  ('ct', '200/5 A'),
  ('pt', '11000/110 V'),
  ('tariff', 'HT-2(a)'),
  ('billing_cycle', 'Monthly');

-- Seed default rate histories
INSERT OR IGNORE INTO electricity_rates_history (id, type, value, effective_date) VALUES
  ('mf1', 'MF', 200, '2018-04-01'),
  ('mf2', 'MF', 30, '2022-10-01'),
  ('fc1', 'FC', 739375, '2018-04-01'),
  ('fc2', 'FC', 638675, '2022-10-01'),
  ('er1', 'ER', 4.20, '2018-04-01'),
  ('fr1', 'FR', 2.30, '2018-04-01');

-- UPDATE ADMIN USER MODULES & SUB-RIGHTS TO INCLUDE ELECTRICITY
UPDATE users SET
  modules = '["dispatch","vendor","reports","hr","production","transport","erp","accounts","stock","maintenance","electricity"]',
  sub_rights = '{"dispatch":["req","disp","track","party","courier","product","report","settings"],"vendor":["vend_list","vend_po","vend_inv","vend_pay"],"reports":["rpt_dash","rpt_disp","rpt_sales","rpt_exp"],"hr":["hr_emp","hr_att","hr_leave","hr_sal"],"production":["pr_chip","pr_hp","pr_weight","pr_resin","pr_bc","pr_plan","pr_sum","pr_mdo","pr_rep"],"transport":["tr_inq","tr_rate","tr_appr","tr_order","tr_track"],"erp":["erp_entry","erp_po","erp_truck","erp_dncn","erp_inv","erp_report"],"accounts":["ac_inv","ac_recv","ac_pay","ac_gst"],"stock":["stk_slip","stk_ledger","stk_stock","stk_reclass","stk_master"],"maintenance":["mt_wo","mt_board","mt_area","mt_timeline","mt_export"],"electricity":["el_punch","el_reports","el_monthly","el_bills","el_config"]}'
WHERE username = 'admin';

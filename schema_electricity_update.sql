/* ══════════════════════════════════════════════════════════
   INCREMENTAL MIGRATION — Electricity & Meter MIS Module
   Run against existing D1 database:
     npx wrangler d1 execute strand-portal-db --remote --file=schema_electricity_update.sql
══════════════════════════════════════════════════════════ */

-- ══ ELECTRICITY TABLES ══

CREATE TABLE IF NOT EXISTS electricity_readings (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  shift TEXT NOT NULL CHECK (shift IN ('AM','PM')),
  time TEXT NOT NULL,
  kwh REAL NOT NULL,
  pf REAL,
  night_kwh REAL,
  mf REAL DEFAULT 1,
  energy_rate REAL DEFAULT 4.20,
  fuel_rate REAL DEFAULT 2.30,
  fixed_charge REAL,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS electricity_bills (
  id TEXT PRIMARY KEY,
  bill_date TEXT NOT NULL,
  due_date TEXT,
  paid_date TEXT,
  adv_payment REAL,
  kwh_curr REAL,
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
  total_payable REAL,
  remarks TEXT DEFAULT '',
  pdf_data TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS electricity_meter_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  meter_no TEXT DEFAULT 'GJ-123456-HT',
  consumer_no TEXT DEFAULT '',
  category TEXT DEFAULT 'HT Industrial',
  sanc_load TEXT DEFAULT '500',
  ct TEXT DEFAULT '200/5 A',
  pt TEXT DEFAULT '11000/110 V',
  tariff TEXT DEFAULT 'HT-2(a)',
  cycle TEXT DEFAULT 'Monthly',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS electricity_mf_history (
  id TEXT PRIMARY KEY,
  mf REAL NOT NULL,
  effective_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS electricity_fc_history (
  id TEXT PRIMARY KEY,
  fc REAL NOT NULL,
  effective_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS electricity_er_history (
  id TEXT PRIMARY KEY,
  rate REAL NOT NULL,
  effective_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS electricity_fr_history (
  id TEXT PRIMARY KEY,
  rate REAL NOT NULL,
  effective_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ══ INDEXES ══

CREATE INDEX IF NOT EXISTS idx_el_readings_date ON electricity_readings(date);
CREATE INDEX IF NOT EXISTS idx_el_readings_shift ON electricity_readings(shift);
CREATE INDEX IF NOT EXISTS idx_el_readings_date_shift ON electricity_readings(date, shift);
CREATE INDEX IF NOT EXISTS idx_el_bills_date ON electricity_bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_el_mf_eff ON electricity_mf_history(effective_date);
CREATE INDEX IF NOT EXISTS idx_el_fc_eff ON electricity_fc_history(effective_date);
CREATE INDEX IF NOT EXISTS idx_el_er_eff ON electricity_er_history(effective_date);
CREATE INDEX IF NOT EXISTS idx_el_fr_eff ON electricity_fr_history(effective_date);

-- ══ SEED DEFAULT CONFIG ══

INSERT OR IGNORE INTO electricity_meter_config (id, meter_no, consumer_no, category, sanc_load, ct, pt, tariff, cycle)
VALUES ('default', 'GJ-123456-HT', '1234567890', 'HT Industrial', '500', '200/5 A', '11000/110 V', 'HT-2(a)', 'Monthly');

INSERT OR IGNORE INTO electricity_mf_history (id, mf, effective_date) VALUES ('mf-default', 30, '2022-10-01');
INSERT OR IGNORE INTO electricity_fc_history (id, fc, effective_date) VALUES ('fc-default', 638675, '2022-10-01');
INSERT OR IGNORE INTO electricity_er_history (id, rate, effective_date) VALUES ('er-default', 4.20, '2018-04-01');
INSERT OR IGNORE INTO electricity_fr_history (id, rate, effective_date) VALUES ('fr-default', 2.30, '2018-04-01');

-- ══ UPDATE ADMIN USER MODULES & SUB-RIGHTS ══

UPDATE users SET
  modules = '["dispatch","vendor","reports","hr","production","transport","erp","accounts","stock","maintenance","electricity"]',
  sub_rights = '{"dispatch":["req","disp","track","party","courier","product","report","settings"],"vendor":["vend_list","vend_po","vend_inv","vend_pay"],"reports":["rpt_dash","rpt_disp","rpt_sales","rpt_exp"],"hr":["hr_emp","hr_att","hr_leave","hr_sal"],"production":["pr_batch","pr_qual","pr_mat","pr_weight"],"transport":["tr_inq","tr_rate","tr_appr","tr_order","tr_track"],"erp":["erp_entry","erp_po","erp_truck","erp_dncn","erp_inv","erp_report"],"accounts":["ac_inv","ac_recv","ac_pay","ac_gst"],"stock":["stk_slip","stk_ledger","stk_stock","stk_reclass","stk_master"],"maintenance":["mt_wo","mt_board","mt_area","mt_timeline","mt_export"],"electricity":["el_dash","el_punch","el_12hr","el_24hr","el_monthly","el_bills"]}'
WHERE username = 'admin';

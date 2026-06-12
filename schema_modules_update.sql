/* ══════════════════════════════════════════════════════════
   INCREMENTAL MIGRATION — Production, Transport & ERP
   Run against existing D1 database:
     npx wrangler d1 execute strand-portal-db --remote --file=schema_modules_update.sql
══════════════════════════════════════════════════════════ */

-- ══ PRODUCTION MODULE ══

CREATE TABLE IF NOT EXISTS production_chipping_reports (
  id TEXT PRIMARY KEY,
  report_date TEXT NOT NULL,
  shift TEXT CHECK(shift IN ('Day','Night')) DEFAULT 'Day',
  lot_no TEXT,
  machine_no TEXT,
  material_type TEXT,
  input_qty REAL DEFAULT 0,
  output_qty REAL DEFAULT 0,
  wastage REAL DEFAULT 0,
  operator_name TEXT,
  remarks TEXT DEFAULT '',
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS production_hotpress_reports (
  id TEXT PRIMARY KEY,
  report_date TEXT NOT NULL,
  shift TEXT CHECK(shift IN ('Day','Night')) DEFAULT 'Day',
  charge_no TEXT,
  board_type TEXT,
  thickness REAL,
  press_time REAL,
  temperature REAL,
  output_sheets INTEGER DEFAULT 0,
  grade TEXT DEFAULT 'A',
  operator_name TEXT,
  remarks TEXT DEFAULT '',
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

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

CREATE TABLE IF NOT EXISTS production_weight_records (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES production_weight_batches(id),
  serial_no INTEGER,
  weight REAL NOT NULL,
  status TEXT CHECK(status IN ('ok','over','under')) DEFAULT 'ok',
  punched_by TEXT,
  punched_at TEXT DEFAULT (datetime('now'))
);


-- ══ TRANSPORT MODULE ══

CREATE TABLE IF NOT EXISTS transport_transporters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT DEFAULT '',
  gst_no TEXT DEFAULT '',
  pan_no TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  rating INTEGER DEFAULT 3,
  status TEXT CHECK(status IN ('active','inactive','blacklisted')) DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transport_vehicles (
  id TEXT PRIMARY KEY,
  vehicle_type TEXT NOT NULL,
  capacity_mt REAL DEFAULT 0,
  description TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS transport_inquiries (
  id TEXT PRIMARY KEY,
  inquiry_no TEXT UNIQUE NOT NULL,
  inquiry_date TEXT NOT NULL,
  from_location TEXT NOT NULL,
  to_location TEXT NOT NULL,
  material TEXT,
  quantity REAL DEFAULT 0,
  unit TEXT DEFAULT 'MT',
  vehicle_type TEXT,
  expected_date TEXT,
  status TEXT CHECK(status IN ('draft','sent','received','compared','approved','ordered','cancelled')) DEFAULT 'draft',
  remarks TEXT DEFAULT '',
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transport_rate_comparisons (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL REFERENCES transport_inquiries(id),
  transporter_id TEXT NOT NULL REFERENCES transport_transporters(id),
  rate_per_mt REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  validity_days INTEGER DEFAULT 7,
  remarks TEXT DEFAULT '',
  is_selected INTEGER DEFAULT 0,
  quoted_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transport_approvals (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL REFERENCES transport_inquiries(id),
  selected_comparison_id TEXT REFERENCES transport_rate_comparisons(id),
  approved_rate REAL,
  approved_by TEXT,
  approval_status TEXT CHECK(approval_status IN ('pending','approved','rejected')) DEFAULT 'pending',
  approval_date TEXT,
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transport_orders (
  id TEXT PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  inquiry_id TEXT NOT NULL REFERENCES transport_inquiries(id),
  approval_id TEXT REFERENCES transport_approvals(id),
  transporter_id TEXT NOT NULL REFERENCES transport_transporters(id),
  vehicle_no TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  loading_date TEXT,
  delivery_date TEXT,
  freight_amount REAL DEFAULT 0,
  advance_paid REAL DEFAULT 0,
  status TEXT CHECK(status IN ('created','loading','in_transit','delivered','completed','cancelled')) DEFAULT 'created',
  remarks TEXT DEFAULT '',
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);


-- ══ PURCHASE ERP MODULE ══

CREATE TABLE IF NOT EXISTS erp_purchases (
  id TEXT PRIMARY KEY,
  sr_no TEXT,
  entry_date TEXT NOT NULL,
  entry_month TEXT,
  material_type TEXT NOT NULL,
  lot_no TEXT,
  so_no TEXT,
  vendor_name TEXT NOT NULL,
  vendor_code TEXT,
  vendor_gstin TEXT,
  vendor_pan TEXT,
  vendor_mobile TEXT,
  vendor_address TEXT,
  city TEXT,
  state TEXT,
  invoice_no TEXT NOT NULL,
  invoice_date TEXT,
  invoice_month TEXT,
  truck_no TEXT DEFAULT '',
  driver_name TEXT,
  transport_name TEXT,
  rst_no TEXT,
  po_no TEXT,
  mrn_no TEXT,
  grn_no TEXT,
  tax_type TEXT DEFAULT 'SG+CG',
  cgst_pct REAL DEFAULT 0.09,
  sgst_pct REAL DEFAULT 0.09,
  inv_qty REAL DEFAULT 0,
  spl_qty REAL DEFAULT 0,
  diff_qty REAL DEFAULT 0,
  rate REAL DEFAULT 0,
  other_charges REAL DEFAULT 0,
  dn_rate_diff REAL DEFAULT 0,
  basic_inv REAL DEFAULT 0,
  basic_spl REAL DEFAULT 0,
  total_inv REAL DEFAULT 0,
  total_spl REAL DEFAULT 0,
  species TEXT,
  moisture REAL,
  remarks TEXT DEFAULT '',
  payment_status TEXT CHECK(payment_status IN ('pending','partial','paid')) DEFAULT 'pending',
  approved INTEGER DEFAULT 0,
  approval_info TEXT,
  dn_status TEXT CHECK(dn_status IN ('Pending','Issued','Settled')) DEFAULT 'Pending',
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS erp_purchase_orders (
  id TEXT PRIMARY KEY,
  po_no TEXT UNIQUE NOT NULL,
  po_date TEXT NOT NULL,
  vendor_id TEXT,
  vendor_name TEXT,
  material_type TEXT,
  items TEXT DEFAULT '[]',
  total_qty REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  delivery_date TEXT,
  status TEXT CHECK(status IN ('draft','sent','acknowledged','partial','fulfilled','cancelled')) DEFAULT 'draft',
  terms TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS erp_debit_notes (
  id TEXT PRIMARY KEY,
  dn_no TEXT UNIQUE NOT NULL,
  dn_date TEXT NOT NULL,
  vendor_id TEXT,
  vendor_name TEXT,
  purchase_id TEXT REFERENCES erp_purchases(id),
  reason TEXT NOT NULL,
  amount REAL DEFAULT 0,
  gst_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  status TEXT CHECK(status IN ('draft','issued','acknowledged','settled')) DEFAULT 'draft',
  remarks TEXT DEFAULT '',
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS erp_credit_notes (
  id TEXT PRIMARY KEY,
  cn_no TEXT UNIQUE NOT NULL,
  cn_date TEXT NOT NULL,
  vendor_id TEXT,
  vendor_name TEXT,
  purchase_id TEXT REFERENCES erp_purchases(id),
  reason TEXT NOT NULL,
  amount REAL DEFAULT 0,
  gst_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  status TEXT CHECK(status IN ('draft','issued','acknowledged','settled')) DEFAULT 'draft',
  remarks TEXT DEFAULT '',
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);


-- ══ UPDATE ADMIN USER MODULES & SUB-RIGHTS ══

UPDATE users SET
  modules = '["dispatch","vendor","reports","hr","production","transport","erp","accounts"]',
  sub_rights = '{"dispatch":["req","disp","track","party","courier","product","report","settings"],"vendor":["vend_list","vend_po","vend_inv","vend_pay"],"reports":["rpt_dash","rpt_disp","rpt_sales","rpt_exp"],"hr":["hr_emp","hr_att","hr_leave","hr_sal"],"production":["pr_batch","pr_qual","pr_mat","pr_weight"],"transport":["tr_inq","tr_rate","tr_appr","tr_order","tr_track"],"erp":["erp_entry","erp_po","erp_truck","erp_dncn","erp_inv","erp_report"],"accounts":["ac_inv","ac_recv","ac_pay","ac_gst"]}'
WHERE username = 'admin';

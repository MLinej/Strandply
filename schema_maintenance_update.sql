/* ══════════════════════════════════════════════════════════
   INCREMENTAL MIGRATION — Maintenance Tracker Module
   Run against existing D1 database:
     npx wrangler d1 execute strand-portal-db --remote --file=schema_maintenance_update.sql
══════════════════════════════════════════════════════════ */

-- ══ MAINTENANCE TRACKER TABLES ══

CREATE TABLE IF NOT EXISTS maintenance_work_orders (
  id TEXT PRIMARY KEY,                  -- e.g. WO-A1B2C3
  title TEXT NOT NULL,
  category TEXT DEFAULT 'Mechanical',   -- Mechanical | Electrical | Hydraulic | Pneumatic | Civil | Instrumentation | HVAC | Safety
  area TEXT DEFAULT '',                 -- Plant area name
  priority TEXT DEFAULT 'Medium',       -- Critical | High | Medium | Low
  status TEXT DEFAULT 'Open',           -- Open | In Progress | On Hold | Completed
  assignee TEXT DEFAULT '',
  description TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  due_date TEXT,                        -- YYYY-MM-DD
  completed_at TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maintenance_areas (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maintenance_timeline (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES maintenance_work_orders(id),
  entry_type TEXT DEFAULT 'note',       -- created | status | edited | note | assigned
  entry_text TEXT NOT NULL,
  entry_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ══ INDEXES ══

CREATE INDEX IF NOT EXISTS idx_maint_wo_status ON maintenance_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_maint_wo_priority ON maintenance_work_orders(priority);
CREATE INDEX IF NOT EXISTS idx_maint_wo_area ON maintenance_work_orders(area);
CREATE INDEX IF NOT EXISTS idx_maint_wo_assignee ON maintenance_work_orders(assignee);
CREATE INDEX IF NOT EXISTS idx_maint_wo_due ON maintenance_work_orders(due_date);
CREATE INDEX IF NOT EXISTS idx_maint_tl_wo ON maintenance_timeline(work_order_id);

-- ══ SEED DEFAULT PLANT AREAS ══

INSERT OR IGNORE INTO maintenance_areas (id, name) VALUES
('ma1', 'Assembly Line A'),
('ma2', 'Assembly Line B'),
('ma3', 'Packaging Unit'),
('ma4', 'Boiler Room'),
('ma5', 'Warehouse'),
('ma6', 'Quality Lab'),
('ma7', 'Utility Block'),
('ma8', 'Press Shop');

-- ══ UPDATE ADMIN USER MODULES & SUB-RIGHTS ══

UPDATE users SET
  modules = '["dispatch","vendor","reports","hr","production","transport","erp","accounts","stock","maintenance"]',
  sub_rights = '{"dispatch":["req","disp","track","party","courier","product","report","settings"],"vendor":["vend_list","vend_po","vend_inv","vend_pay"],"reports":["rpt_dash","rpt_disp","rpt_sales","rpt_exp"],"hr":["hr_emp","hr_att","hr_leave","hr_sal"],"production":["pr_batch","pr_qual","pr_mat","pr_weight"],"transport":["tr_inq","tr_rate","tr_appr","tr_order","tr_track"],"erp":["erp_entry","erp_po","erp_truck","erp_dncn","erp_inv","erp_report"],"accounts":["ac_inv","ac_recv","ac_pay","ac_gst"],"stock":["stk_slip","stk_ledger","stk_stock","stk_reclass","stk_master"],"maintenance":["mt_wo","mt_board","mt_area","mt_timeline","mt_export"]}'
WHERE username = 'admin';

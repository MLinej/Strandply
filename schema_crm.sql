-- ═══════════════════════════════════════════════════════════════════
--  STRANDPLY CRM — Database Schema
--  Apply: npx wrangler d1 execute strand-portal-db --remote --file=schema_crm.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── LEADS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_leads (
  id TEXT PRIMARY KEY,
  company_name TEXT DEFAULT '',
  contact_person TEXT DEFAULT '',
  mobile TEXT DEFAULT '',
  alt_mobile TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  email TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  address TEXT DEFAULT '',
  pincode TEXT DEFAULT '',
  customer_type TEXT DEFAULT '',
  source TEXT DEFAULT '',
  salesperson TEXT DEFAULT '',
  priority TEXT DEFAULT 'Cold',
  status TEXT DEFAULT 'New Lead',
  product TEXT DEFAULT '',
  quantity TEXT DEFAULT '',
  est_value REAL DEFAULT 0,
  remarks TEXT DEFAULT '',
  campaign TEXT DEFAULT '',
  next_follow_up_date TEXT DEFAULT '',
  last_contact_date TEXT DEFAULT '',
  date_added TEXT DEFAULT '',
  customer_id TEXT DEFAULT '',
  data_quality TEXT DEFAULT 'Good',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ── CUSTOMERS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_customers (
  id TEXT PRIMARY KEY,
  company_name TEXT DEFAULT '',
  contact_person TEXT DEFAULT '',
  mobile TEXT DEFAULT '',
  alt_mobile TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  email TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  address TEXT DEFAULT '',
  pincode TEXT DEFAULT '',
  customer_type TEXT DEFAULT '',
  source TEXT DEFAULT '',
  salesperson TEXT DEFAULT '',
  priority TEXT DEFAULT 'Cold',
  gst TEXT DEFAULT '',
  credit_days INTEGER DEFAULT 0,
  credit_limit REAL DEFAULT 0,
  annual_target REAL DEFAULT 0,
  next_follow_up TEXT DEFAULT '',
  last_contact_date TEXT DEFAULT '',
  first_contact_date TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ── FOLLOW-UPS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_followups (
  id TEXT PRIMARY KEY,
  customer_id TEXT DEFAULT '',
  contact_person TEXT DEFAULT '',
  salesperson TEXT DEFAULT '',
  date TEXT DEFAULT '',
  type TEXT DEFAULT 'Call',
  status TEXT DEFAULT 'Pending',
  discussion TEXT DEFAULT '',
  outcome TEXT DEFAULT '',
  next_follow_up_date TEXT DEFAULT '',
  products_discussed TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ── OPPORTUNITIES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_opportunities (
  id TEXT PRIMARY KEY,
  customer_id TEXT DEFAULT '',
  product TEXT DEFAULT '',
  quantity TEXT DEFAULT '',
  est_value REAL DEFAULT 0,
  stage TEXT DEFAULT 'Qualification',
  salesperson TEXT DEFAULT '',
  expected_close TEXT DEFAULT '',
  priority TEXT DEFAULT 'Warm',
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ── QUOTATIONS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_quotations (
  id TEXT PRIMARY KEY,
  customer_id TEXT DEFAULT '',
  date TEXT DEFAULT '',
  valid_till TEXT DEFAULT '',
  salesperson TEXT DEFAULT '',
  status TEXT DEFAULT 'Draft',
  items_json TEXT DEFAULT '[]',
  total REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  final_total REAL DEFAULT 0,
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ── ORDERS WON ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_orders_won (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT DEFAULT '',
  customer_id TEXT DEFAULT '',
  order_date TEXT DEFAULT '',
  product TEXT DEFAULT '',
  quantity TEXT DEFAULT '',
  order_value REAL DEFAULT 0,
  payment_terms TEXT DEFAULT '',
  delivery_date TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  salesperson TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── ORDERS LOST ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_orders_lost (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT DEFAULT '',
  customer_id TEXT DEFAULT '',
  product TEXT DEFAULT '',
  quantity TEXT DEFAULT '',
  est_value REAL DEFAULT 0,
  lost_reason TEXT DEFAULT '',
  competitor TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  reactivation_date TEXT DEFAULT '',
  salesperson TEXT DEFAULT '',
  lost_date TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── TASKS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_tasks (
  id TEXT PRIMARY KEY,
  customer_id TEXT DEFAULT '',
  type TEXT DEFAULT '',
  due_date TEXT DEFAULT '',
  priority TEXT DEFAULT 'Warm',
  status TEXT DEFAULT 'Pending',
  assigned_to TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ── CAMPAIGNS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  type TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  target_segment TEXT DEFAULT '',
  budget REAL DEFAULT 0,
  status TEXT DEFAULT 'Draft',
  leads_generated INTEGER DEFAULT 0,
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ── MASTER: PRODUCTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_products (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  thickness TEXT DEFAULT '',
  size TEXT DEFAULT '',
  grade TEXT DEFAULT '',
  application TEXT DEFAULT '',
  rate TEXT DEFAULT '',
  moq TEXT DEFAULT '',
  status TEXT DEFAULT 'Active',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── MASTER: SALESPERSONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_salespersons (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  mobile TEXT DEFAULT '',
  email TEXT DEFAULT '',
  territory TEXT DEFAULT '',
  designation TEXT DEFAULT '',
  active TEXT DEFAULT 'Active',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── MASTER: SOURCES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_sources (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── MASTER: LOST REASONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_lost_reasons (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── AUDIT LOG ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_audit (
  id TEXT PRIMARY KEY,
  user_name TEXT DEFAULT '',
  date TEXT DEFAULT '',
  time TEXT DEFAULT '',
  action TEXT DEFAULT '',
  entity TEXT DEFAULT '',
  entity_id TEXT DEFAULT '',
  old_value TEXT DEFAULT '',
  new_value TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── SEQUENCE COUNTERS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_state (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);

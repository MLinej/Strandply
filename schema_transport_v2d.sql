-- Transport v2d: Remove NOT NULL + FK constraints from legacy columns
-- that are no longer used in the new design (quotes stored in quotes_json).
-- Uses the SQLite recommended pattern: rename → recreate → copy → drop.

-- ── transport_rate_comparisons: drop NOT NULL on transporter_id ─────────────
ALTER TABLE transport_rate_comparisons RENAME TO transport_rate_comparisons_old;

CREATE TABLE transport_rate_comparisons (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL REFERENCES transport_inquiries(id),
  transporter_id TEXT DEFAULT '',
  rate_per_mt REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  validity_days INTEGER DEFAULT 7,
  remarks TEXT DEFAULT '',
  is_selected INTEGER DEFAULT 0,
  quoted_at TEXT DEFAULT (datetime('now')),
  rc_no TEXT DEFAULT '',
  from_location TEXT DEFAULT '',
  from_pin TEXT DEFAULT '',
  to_location TEXT DEFAULT '',
  to_pin TEXT DEFAULT '',
  vehicle TEXT DEFAULT '',
  material TEXT DEFAULT '',
  weight TEXT DEFAULT '',
  budget REAL DEFAULT 0,
  quotes_json TEXT DEFAULT '[]',
  selected_tid TEXT DEFAULT '',
  selected_transporter TEXT DEFAULT '',
  selected_rate REAL DEFAULT 0,
  selected_transit TEXT DEFAULT '',
  selected_mg_weight REAL DEFAULT 0,
  is_lowest INTEGER DEFAULT 0,
  exceeds_budget INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending_approval',
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO transport_rate_comparisons SELECT * FROM transport_rate_comparisons_old;
DROP TABLE transport_rate_comparisons_old;

-- ── transport_orders: drop NOT NULL on transporter_id ──────────────────────
ALTER TABLE transport_orders RENAME TO transport_orders_old;

CREATE TABLE transport_orders (
  id TEXT PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  inquiry_id TEXT NOT NULL REFERENCES transport_inquiries(id),
  approval_id TEXT DEFAULT '',
  transporter_id TEXT DEFAULT '',
  vehicle_no TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  loading_date TEXT,
  delivery_date TEXT,
  freight_amount REAL DEFAULT 0,
  advance_paid REAL DEFAULT 0,
  status TEXT DEFAULT 'created',
  remarks TEXT DEFAULT '',
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  ap_id TEXT DEFAULT '',
  rc_id TEXT DEFAULT '',
  inq_id TEXT DEFAULT '',
  transporter_name TEXT DEFAULT '',
  tp_phone TEXT DEFAULT '',
  tp_contact TEXT DEFAULT '',
  tp_gst TEXT DEFAULT '',
  tp_address TEXT DEFAULT '',
  tp_city TEXT DEFAULT '',
  tp_state TEXT DEFAULT '',
  tp_credit TEXT DEFAULT '',
  from_location TEXT DEFAULT '',
  from_pin TEXT DEFAULT '',
  to_location TEXT DEFAULT '',
  to_pin TEXT DEFAULT '',
  vehicle TEXT DEFAULT '',
  material TEXT DEFAULT '',
  weight TEXT DEFAULT '',
  dtype TEXT DEFAULT '',
  rate REAL DEFAULT 0,
  transit TEXT DEFAULT '',
  pickup_date TEXT DEFAULT ''
);

INSERT OR IGNORE INTO transport_orders SELECT * FROM transport_orders_old;
DROP TABLE transport_orders_old;

-- ── transport_approvals: drop NOT NULL on inquiry_id, remove selected_comparison_id FK ──
ALTER TABLE transport_approvals RENAME TO transport_approvals_old;

CREATE TABLE transport_approvals (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT DEFAULT '',
  selected_comparison_id TEXT DEFAULT '',
  approved_rate REAL,
  approved_by TEXT,
  approval_status TEXT CHECK(approval_status IN ('pending','approved','rejected')) DEFAULT 'pending',
  approval_date TEXT,
  remarks TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  rc_id TEXT DEFAULT '',
  transporter TEXT DEFAULT '',
  selected_transit TEXT DEFAULT '',
  from_location TEXT DEFAULT '',
  from_pin TEXT DEFAULT '',
  to_location TEXT DEFAULT '',
  to_pin TEXT DEFAULT '',
  vehicle TEXT DEFAULT '',
  material TEXT DEFAULT '',
  weight TEXT DEFAULT '',
  pickup_date TEXT DEFAULT '',
  dtype TEXT DEFAULT '',
  budget REAL DEFAULT 0,
  is_lowest INTEGER DEFAULT 0,
  exceeds_budget INTEGER DEFAULT 0,
  justification TEXT DEFAULT '',
  next_approver TEXT DEFAULT '',
  history_json TEXT DEFAULT '[]'
);

INSERT OR IGNORE INTO transport_approvals SELECT * FROM transport_approvals_old;
DROP TABLE transport_approvals_old;

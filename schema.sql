-- ═══════════════════════════════════════════════════════════════
-- STRANDPLY LLP — COMPLETE Cloudflare D1 (SQLite) Schema
-- Covers: Portal (index.html) + SampleTrack Pro (dispatch/)
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════
-- 1. PORTAL TABLES (index.html)
-- ═══════════════════════════════════════════════════════════════

-- Portal users (login to main portal)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'dispatch',
  dept TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  color TEXT DEFAULT '#B91C1C',
  modules TEXT DEFAULT '[]',           -- JSON array of module IDs
  sub_rights TEXT DEFAULT '{}',        -- JSON object { moduleId: [subModuleId, ...] }
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Custom roles created via Roles panel (built-in roles stay in frontend code)
CREATE TABLE IF NOT EXISTS custom_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#374151',
  modules TEXT DEFAULT '[]',           -- JSON array of default module IDs
  sub_rights TEXT DEFAULT '{}',        -- JSON object of default sub-rights
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);


-- ═══════════════════════════════════════════════════════════════
-- 2. SAMPLETRACK PRO TABLES (dispatch/index.html)
-- ═══════════════════════════════════════════════════════════════

-- Dispatch module users (separate login system)
CREATE TABLE IF NOT EXISTS dispatch_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'dispatch',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  status TEXT DEFAULT 'Active',        -- Active | Inactive
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Party / Customer database
CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT DEFAULT '',             -- Contact person name
  mobile TEXT DEFAULT '',
  email TEXT DEFAULT '',
  gst TEXT DEFAULT '',                 -- GST number
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  pin TEXT DEFAULT '',
  industry TEXT DEFAULT '',            -- Furniture | Interior Design | Construction | etc.
  type TEXT DEFAULT 'New Lead',        -- Existing Customer | New Lead
  mkt TEXT DEFAULT '',                 -- Marketing person assigned
  remarks TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Courier & Transport partners
CREATE TABLE IF NOT EXISTS couriers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'Courier',         -- Courier | Transport | Bus
  contact TEXT DEFAULT '',             -- Contact person
  mobile TEXT DEFAULT '',
  email TEXT DEFAULT '',
  coverage TEXT DEFAULT '',            -- Coverage area description
  track_url TEXT DEFAULT '',           -- Tracking URL template
  rating INTEGER DEFAULT 3,           -- 1-5 stars
  status TEXT DEFAULT 'Active',        -- Active | Inactive
  remarks TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Product catalogue / master
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  code TEXT DEFAULT '',                -- Product code e.g. OSB-12-8X4
  name TEXT NOT NULL,
  board TEXT DEFAULT '',               -- Board type: OSB | S-OSB | Hybrid | MDO | Core Veneer | Face Veneer
  thickness TEXT DEFAULT '',           -- e.g. 12, 18
  size TEXT DEFAULT '',                -- e.g. 8x4 ft
  category TEXT DEFAULT 'Standard',    -- Standard | Premium
  price REAL DEFAULT 0,               -- Unit price in ₹
  stock TEXT DEFAULT 'Available',      -- Available | Limited | Out of Stock
  description TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Sample requests
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,                 -- e.g. REQ-0001
  date TEXT NOT NULL,                  -- Request date YYYY-MM-DD
  party TEXT NOT NULL,                 -- Party name (denormalized)
  products TEXT DEFAULT '[]',          -- JSON array of { name, qty, board, thickness, size }
  purpose TEXT DEFAULT '',             -- Client Exhibition | Product Testing | etc.
  priority TEXT DEFAULT 'Normal',      -- Normal | Medium | High | Urgent
  req_date TEXT DEFAULT '',            -- Requested delivery date
  requested_by TEXT DEFAULT '',        -- Person who raised the request
  remarks TEXT DEFAULT '',
  status TEXT DEFAULT 'Pending',       -- Pending | Approved | Dispatched | Delivered
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Dispatch records
CREATE TABLE IF NOT EXISTS dispatches (
  id TEXT PRIMARY KEY,                 -- e.g. DSP-0001
  date TEXT NOT NULL,                  -- Dispatch date YYYY-MM-DD
  party TEXT NOT NULL,                 -- Party name (denormalized)
  city TEXT DEFAULT '',
  mode TEXT DEFAULT 'Courier',         -- Courier | Transport | Bus | Hand Delivery
  courier TEXT DEFAULT '',             -- Courier/transport name
  tracking TEXT DEFAULT '',            -- Tracking number / LR number
  vehicle TEXT DEFAULT '',             -- Vehicle number (for transport)
  driver TEXT DEFAULT '',              -- Driver name + phone (for transport)
  exp_date TEXT DEFAULT '',            -- Expected delivery date
  freight REAL DEFAULT 0,             -- Freight cost in ₹
  weight REAL DEFAULT 0,              -- Weight in KG
  dims TEXT DEFAULT '',               -- Dimensions string
  product TEXT DEFAULT '',             -- Product description summary
  status TEXT DEFAULT 'Pending',       -- Pending | Packed | Dispatched | In Transit | Delivered | Delayed | Returned
  remarks TEXT DEFAULT '',
  req_link TEXT DEFAULT '',            -- Linked request ID (e.g. REQ-0001)
  history TEXT DEFAULT '[]',           -- JSON array of { s: status, t: timestamp }
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT 'info',            -- info | success | warning | danger
  title TEXT NOT NULL,
  msg TEXT DEFAULT '',
  time TEXT DEFAULT '',
  is_read INTEGER DEFAULT 0,          -- 0 = unread, 1 = read
  user_id TEXT DEFAULT '',             -- Which user this notification is for (empty = all)
  created_at TEXT DEFAULT (datetime('now'))
);

-- Activity log (audit trail)
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT (datetime('now')),
  user_name TEXT DEFAULT '',
  user_role TEXT DEFAULT '',
  action TEXT DEFAULT '',              -- create | edit | delete | login | logout
  entity_type TEXT DEFAULT '',         -- request | dispatch | party | courier | product | user
  entity_id TEXT DEFAULT '',
  details TEXT DEFAULT ''              -- Human-readable description
);

-- App settings / config (key-value store)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

-- Role-based page permissions for dispatch module
CREATE TABLE IF NOT EXISTS dispatch_role_perms (
  role TEXT PRIMARY KEY,
  pages TEXT DEFAULT '[]',             -- JSON array of allowed page IDs
  can_edit INTEGER DEFAULT 0,
  can_delete INTEGER DEFAULT 0,
  can_print INTEGER DEFAULT 0,
  can_export INTEGER DEFAULT 0,
  dashboard_full INTEGER DEFAULT 0,
  dashboard_widgets TEXT DEFAULT '[]', -- JSON array of widget IDs
  updated_at TEXT DEFAULT (datetime('now'))
);


-- ═══════════════════════════════════════════════════════════════
-- 3. INDEXES
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_dispatch_users_username ON dispatch_users(username);
CREATE INDEX IF NOT EXISTS idx_parties_name ON parties(name);
CREATE INDEX IF NOT EXISTS idx_parties_city ON parties(city);
CREATE INDEX IF NOT EXISTS idx_parties_type ON parties(type);
CREATE INDEX IF NOT EXISTS idx_couriers_type ON couriers(type);
CREATE INDEX IF NOT EXISTS idx_products_board ON products(board);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_date ON requests(date);
CREATE INDEX IF NOT EXISTS idx_requests_party ON requests(party);
CREATE INDEX IF NOT EXISTS idx_dispatches_status ON dispatches(status);
CREATE INDEX IF NOT EXISTS idx_dispatches_date ON dispatches(date);
CREATE INDEX IF NOT EXISTS idx_dispatches_party ON dispatches(party);
CREATE INDEX IF NOT EXISTS idx_dispatches_mode ON dispatches(mode);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);


-- ═══════════════════════════════════════════════════════════════
-- 4. SEED DATA — Portal Users
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO users (id, name, username, password, role, dept, avatar, color, modules, sub_rights)
VALUES
  ('u001', 'Admin', 'admin', 'admin@strandply', 'admin', 'Administration', 'AD', '#B91C1C',
   '["dispatch","vendor","reports","hr","production","transport","erp","accounts","stock","maintenance"]',
   '{"dispatch":["req","disp","track","party","courier","product","report","settings"],"vendor":["vend_list","vend_po","vend_inv","vend_pay"],"reports":["rpt_dash","rpt_disp","rpt_sales","rpt_exp"],"hr":["hr_emp","hr_att","hr_leave","hr_sal"],"production":["pr_batch","pr_qual","pr_mat","pr_weight"],"transport":["tr_inq","tr_rate","tr_appr","tr_order","tr_track"],"erp":["erp_entry","erp_po","erp_truck","erp_dncn","erp_inv","erp_report"],"accounts":["ac_inv","ac_recv","ac_pay","ac_gst"],"stock":["stk_slip","stk_ledger","stk_stock","stk_reclass","stk_master"],"maintenance":["mt_wo","mt_board","mt_area","mt_timeline","mt_export"]}'),

  ('u002', 'Ankit Parmar', 'ankit', 'ankit@123', 'dispatch', 'Dispatch Department', 'AP', '#0F766E',
   '["dispatch"]',
   '{"dispatch":["disp","track","courier"]}'),

  ('u003', 'Suresh Kumar', 'suresh', 'suresh@123', 'marketing', 'Marketing Team', 'SK', '#B45309',
   '["dispatch","vendor"]',
   '{"dispatch":["req","track","party","product"],"vendor":["vend_list"]}'),

  ('u004', 'Raj Verma', 'raj', 'raj@123', 'management', 'Management', 'RV', '#1D4ED8',
   '["dispatch","reports"]',
   '{"dispatch":["track","report"],"reports":["rpt_dash","rpt_disp","rpt_sales","rpt_exp"]}'),

  ('u005', 'Vendor Manager', 'vendor', 'vendor@123', 'vendor', 'Vendor Relations', 'VM', '#7C3AED',
   '["vendor"]',
   '{"vendor":["vend_list","vend_po","vend_inv","vend_pay"]}');


-- ═══════════════════════════════════════════════════════════════
-- 5. SEED DATA — SampleTrack Pro Users
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO dispatch_users (id, name, username, password, role, email, status)
VALUES
  ('u1', 'Super Admin',      'superadmin', 'super123',    'superadmin', 'super@strandply.com', 'Active'),
  ('u2', 'Rahul Admin',      'admin',      'admin123',    'admin',      'admin@strandply.com', 'Active'),
  ('u3', 'Dispatch Mgr',     'dispatch',   'dispatch123', 'dispatch',   'disp@strandply.com',  'Active'),
  ('u4', 'Ankit Marketing',  'marketing',  'mkt123',      'marketing',  'mkt@strandply.com',   'Active'),
  ('u5', 'Management View',  'mgmt',       'mgmt123',     'management', 'mgmt@strandply.com',  'Active');


-- ═══════════════════════════════════════════════════════════════
-- 6. SEED DATA — Parties (Customers)
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO parties (id, name, contact, mobile, email, gst, address, city, state, pin, industry, type, mkt, remarks)
VALUES
  ('P001', 'Gujarat Furniture Works', 'Rajan Shah',  '9876543210', 'rajan@gfw.com',  '24AAACG1234F1Z5', 'Plot 45, Gondal Rd, GIDC',            'Rajkot',    'Gujarat',       '360001', 'Furniture',        'Existing Customer', 'Ankit Patel',  'VIP client'),
  ('P002', 'Mumbai Interior Co.',     'Priya Mehta', '9867543210', 'priya@mic.com',  '27AAACM5678G1Z2', 'Shop 12, Infinity Mall, Andheri West', 'Mumbai',    'Maharashtra',   '400058', 'Interior Design',  'Existing Customer', 'Suresh Kumar', 'High volume'),
  ('P003', 'Delhi Construction Ltd',  'Anil Kumar',  '9898765432', 'anil@dcl.com',   '07AAACD9012H1Z8', 'Office 5, Connaught Place',            'New Delhi', 'Delhi',         '110001', 'Construction',     'New Lead',          'Ankit Patel',  'First contact done'),
  ('P004', 'Pune Traders & Co.',      'Sneha Joshi', '9765432109', 'sneha@ptc.com',  '27AAACP3456I1Z6', 'Gala 7, Hadapsar MIDC',               'Pune',      'Maharashtra',   '411013', 'Trader / Dealer',  'Existing Customer', 'Raj Verma',    'Regular buyer'),
  ('P005', 'Bengaluru Arch Studio',   'Vikram Rao',  '9654321098', 'vikram@bas.com', '29AAACB7890J1Z4', 'No 24, 1st Cross, Koramangala',        'Bengaluru', 'Karnataka',     '560034', 'Architect',        'New Lead',          'Suresh Kumar', 'Interested in S-OSB');


-- ═══════════════════════════════════════════════════════════════
-- 7. SEED DATA — Couriers
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO couriers (id, name, type, contact, mobile, email, coverage, track_url, rating, status, remarks)
VALUES
  ('C001', 'Blue Dart',          'Courier',   'Sales Team',    '1860-233-1234', 'sales@bluedart.com',   'Pan India',             'https://www.bluedart.com/tracking',  5, 'Active', 'Premium courier'),
  ('C002', 'DTDC',               'Courier',   'Regional Mgr',  '1800-103-3832', 'cs@dtdc.com',          'Pan India',             'https://www.dtdc.in/tracking.asp',   4, 'Active', 'Cost-effective'),
  ('C003', 'Delhivery',          'Courier',   'Key Accounts',  '9999-1234-56',  'support@delhivery.com','Pan India',             'https://www.delhivery.com/track',    4, 'Active', 'Good for heavy'),
  ('C004', 'Gujarat Transport',  'Transport', 'Kamlesh Bhai',  '9876500001',    'gt@gmail.com',         'Gujarat, Maharashtra',  '',                                   4, 'Active', 'Reliable for bulk'),
  ('C005', 'Rajasthan Roadways', 'Transport', 'Shyam',         '9845600002',    '',                     'Rajasthan, Gujarat',    '',                                   3, 'Active', '');


-- ═══════════════════════════════════════════════════════════════
-- 8. SEED DATA — Products
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO products (id, code, name, board, thickness, size, category, price, stock, description)
VALUES
  ('PR001', 'OSB-12-8X4',  'OSB 12mm Standard',  'OSB',          '12', '8x4 ft', 'Standard', 850,  'Available', 'Standard OSB board 12mm'),
  ('PR002', 'OSB-18-8X4',  'OSB 18mm Premium',   'OSB',          '18', '8x4 ft', 'Premium',  1200, 'Available', 'Premium OSB 18mm thick'),
  ('PR003', 'SOSB-15-8X4', 'S-OSB 15mm',         'S-OSB',        '15', '8x4 ft', 'Standard', 1050, 'Available', 'Structural OSB 15mm'),
  ('PR004', 'MDO-12-8X4',  'MDO 12mm Board',     'MDO',          '12', '8x4 ft', 'Standard', 950,  'Limited',   'Medium Density Overlay'),
  ('PR005', 'HYB-18-8X4',  'Hybrid 18mm',        'Hybrid',       '18', '8x4 ft', 'Premium',  1350, 'Available', 'Hybrid engineered board'),
  ('PR006', 'CV-06-8X4',   'Core Veneer 6mm',    'Core Veneer',  '6',  '8x4 ft', 'Standard', 650,  'Available', 'Core veneer sheet');


-- ═══════════════════════════════════════════════════════════════
-- 9. SEED DATA — Sample Requests
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO requests (id, date, party, products, purpose, priority, req_date, requested_by, remarks, status, created_at)
VALUES
  ('REQ-0001', '2025-04-05', 'Gujarat Furniture Works',
   '[{"name":"OSB 18mm Premium","qty":"5 sheets","board":"OSB","thickness":"18mm","size":"8x4 ft"},{"name":"S-OSB 15mm","qty":"2 sheets","board":"S-OSB","thickness":"15mm","size":"8x4 ft"}]',
   'Client Exhibition', 'High', '2025-04-10', 'Ankit Patel', 'Urgent trade fair', 'Delivered', '2025-04-05 09:30:00'),

  ('REQ-0002', '2025-04-12', 'Mumbai Interior Co.',
   '[{"name":"S-OSB 15mm","qty":"10 sheets","board":"S-OSB","thickness":"15mm","size":"8x4 ft"}]',
   'Product Testing', 'Normal', '2025-04-20', 'Suresh Kumar', 'Test required', 'Approved', '2025-04-12 11:15:00'),

  ('REQ-0003', '2025-04-15', 'Delhi Construction Ltd',
   '[{"name":"MDO 12mm Board","qty":"3 sheets","board":"MDO","thickness":"12mm","size":"8x4 ft"},{"name":"OSB 12mm Standard","qty":"5 sheets","board":"OSB","thickness":"12mm","size":"8x4 ft"}]',
   'New Customer Demo', 'Medium', '2025-04-22', 'Ankit Patel', 'First-time customer', 'Pending', '2025-04-15 14:45:00'),

  ('REQ-0004', '2025-04-18', 'Pune Traders & Co.',
   '[{"name":"OSB 12mm Standard","qty":"8 sheets","board":"OSB","thickness":"12mm","size":"8x4 ft"}]',
   'Regular Supply', 'Normal', '2025-04-25', 'Raj Verma', '', 'Dispatched', '2025-04-18 10:00:00'),

  ('REQ-0005', '2025-04-20', 'Bengaluru Arch Studio',
   '[{"name":"Hybrid 18mm","qty":"2 sheets","board":"Hybrid","thickness":"18mm","size":"8x4 ft"},{"name":"MDO 12mm Board","qty":"3 sheets","board":"MDO","thickness":"12mm","size":"8x4 ft"}]',
   'Architect Presentation', 'High', '2025-04-26', 'Suresh Kumar', 'High-value lead', 'Pending', '2025-04-20 09:15:00');


-- ═══════════════════════════════════════════════════════════════
-- 10. SEED DATA — Dispatches
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO dispatches (id, date, party, city, mode, courier, tracking, vehicle, driver, exp_date, freight, weight, dims, product, status, remarks, req_link, history)
VALUES
  ('DSP-0001', '2025-04-06', 'Gujarat Furniture Works', 'Rajkot', 'Courier', 'Blue Dart', 'BD123456789', '', '', '2025-04-08',
   450, 25, '120x90x20cm', 'OSB 18mm+S-OSB 15mm — 7 sheets', 'Delivered', 'On time', 'REQ-0001',
   '[{"s":"Packed","t":"2025-04-06 10:00"},{"s":"Dispatched","t":"2025-04-06 14:00"},{"s":"In Transit","t":"2025-04-07 09:00"},{"s":"Delivered","t":"2025-04-08 11:30"}]'),

  ('DSP-0002', '2025-04-13', 'Mumbai Interior Co.', 'Mumbai', 'Transport', 'Gujarat Transport', 'GT987654321', 'GJ-33-T-5678', 'Kamlesh 9876543210', '2025-04-16',
   1200, 80, '240x120x30cm', 'S-OSB 15mm — 10 sheets', 'In Transit', '', 'REQ-0002',
   '[{"s":"Approved","t":"2025-04-13 09:00"},{"s":"Packed","t":"2025-04-13 13:00"},{"s":"Dispatched","t":"2025-04-14 08:00"},{"s":"In Transit","t":"2025-04-14 16:00"}]'),

  ('DSP-0003', '2025-04-19', 'Pune Traders & Co.', 'Pune', 'Courier', 'DTDC', 'DTDC556677889', '', '', '2025-04-22',
   680, 40, '90x60x25cm', 'OSB 12mm — 8 sheets', 'Delayed', 'Stuck at hub', 'REQ-0004',
   '[{"s":"Dispatched","t":"2025-04-19 15:00"},{"s":"In Transit","t":"2025-04-20 10:00"},{"s":"Delayed","t":"2025-04-22 18:00"}]');


-- ═══════════════════════════════════════════════════════════════
-- 11. SEED DATA — Notifications
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO notifications (id, type, title, msg, time, is_read)
VALUES
  ('N1', 'warning', 'Delayed Shipment',  'DSP-003 to Pune Traders is delayed.',            '2025-04-22 18:00', 0),
  ('N2', 'success', 'Delivered',          'DSP-001 delivered to Gujarat Furniture Works.',   '2025-04-08 11:30', 1),
  ('N3', 'info',    'New Request',        'REQ-005 raised by Suresh Kumar.',                '2025-04-20 09:15', 0);


-- ═══════════════════════════════════════════════════════════════
-- 12. SEED DATA — Dispatch Role Permissions
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO dispatch_role_perms (role, pages, can_edit, can_delete, can_print, can_export, dashboard_full, dashboard_widgets)
VALUES
  ('superadmin',
   '["dashboard","requests","dispatch","tracking","parties","couriers","products","reports","notifications","users","settings"]',
   1, 1, 1, 1, 1, '[]'),
  ('admin',
   '["dashboard","requests","dispatch","tracking","parties","couriers","products","reports","notifications","users","settings"]',
   1, 1, 1, 1, 1, '[]'),
  ('dispatch',
   '["dashboard","dispatch","tracking","couriers","notifications"]',
   1, 0, 1, 0, 0, '["total","delivered","delayed"]'),
  ('marketing',
   '["dashboard","requests","tracking","parties","products","notifications"]',
   1, 0, 1, 0, 0, '["pending","parties"]'),
  ('management',
   '["dashboard","reports","notifications"]',
   0, 0, 1, 1, 0, '["total","pending","delivered","delayed","parties","couriers"]');


-- ═══════════════════════════════════════════════════════════════
-- 13. SEED DATA — Default Settings
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO settings (key, value)
VALUES
  ('company',     'Strandply LLP'),
  ('llpin',       'AAP-7300'),
  ('city',        'Wankaner, Morbi, Gujarat'),
  ('phone',       ''),
  ('gs_id',       ''),
  ('gs_url',      ''),
  ('gs_interval', '0'),
  ('gs_last_sync','');


-- ═══════════════════════════════════════════════════════════════
-- 14. VENDOR PORTAL TABLES
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vendor_records (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT DEFAULT '',
  type TEXT DEFAULT '',
  categories TEXT DEFAULT '[]',         -- JSON array of category names
  products TEXT DEFAULT '[]',           -- JSON array of {_id, name, unit}
  contact TEXT DEFAULT '',
  designation TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  pincode TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  website TEXT DEFAULT '',
  gst TEXT DEFAULT '',
  pan TEXT DEFAULT '',
  msme TEXT DEFAULT '',
  payment_terms TEXT DEFAULT '',
  bank TEXT DEFAULT '',
  account_no TEXT DEFAULT '',
  ifsc TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  rating REAL DEFAULT 0,
  status TEXT DEFAULT 'pending',         -- pending | approved | active | inactive | blacklisted
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  approved_at TEXT DEFAULT '',
  approved_by TEXT DEFAULT '',
  activated_at TEXT DEFAULT '',
  blacklisted_at TEXT DEFAULT '',
  blacklist_reason TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendor_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT DEFAULT '',
  category TEXT DEFAULT '',
  unit TEXT DEFAULT '',
  alt_unit TEXT DEFAULT '',
  conv_factor REAL DEFAULT 1,
  hsn TEXT DEFAULT '',
  gst_rate TEXT DEFAULT '',
  moq INTEGER DEFAULT 0,
  lead_time INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendor_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🏷️',
  color_class TEXT DEFAULT 'c1',
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 99,
  status TEXT DEFAULT 'active',
  notes TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendor_cities (
  id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincodes TEXT DEFAULT '[]',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendor_tnc (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT DEFAULT '',
  version TEXT DEFAULT '1.0',
  body TEXT NOT NULL,
  summary TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  applies TEXT DEFAULT 'all',
  notes TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);


-- ═══════════════════════════════════════════════════════════════
-- 15. SEED DATA — Vendor Portal Defaults
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO vendor_categories (id, name, icon, color_class, description, sort_order) VALUES
('c1', 'Raw Material', '🪵', 'c1', 'Strands, timber, veneer', 1),
('c2', 'Resin & Chemicals', '🧪', 'c2', 'MDI, PMDI, UF resin', 2),
('c3', 'Packaging', '📦', 'c3', 'Film, edge protectors', 3),
('c4', 'Transport', '🚛', 'c4', 'Trucks and logistics', 4),
('c5', 'Maintenance', '🔧', 'c5', 'Press and machinery', 5),
('c6', 'Job Work', '🛠️', 'c6', 'Disposal and processing', 6);

INSERT OR IGNORE INTO vendor_products (id, name, code, category, unit, hsn) VALUES
('p1', 'Wax-Coated Strands', 'SPL-P-26-001', 'Raw Material', 'MT', '4401'),
('p2', 'Dry Strands', 'SPL-P-26-002', 'Raw Material', 'MT', '4401'),
('p3', 'Birch Face Veneer', 'SPL-P-26-003', 'Raw Material', 'Sheets', '4408'),
('p4', 'Core Veneer', 'SPL-P-26-004', 'Raw Material', 'Sheets', '4408'),
('p5', 'MDI Resin', 'SPL-P-26-005', 'Resin & Chemicals', 'Drum', '3909'),
('p6', 'PMDI Binder', 'SPL-P-26-006', 'Resin & Chemicals', 'Drum', '3909'),
('p7', 'Urea Formaldehyde Resin', 'SPL-P-26-007', 'Resin & Chemicals', 'Drum', '3909'),
('p8', 'Wax Emulsion', 'SPL-P-26-008', 'Resin & Chemicals', 'Can', '3404'),
('p9', 'Stretch Film Roll', 'SPL-P-26-009', 'Packaging', 'Roll', '3920'),
('p10', 'Edge Protectors', 'SPL-P-26-010', 'Packaging', 'Nos', '4819'),
('p11', 'FTL Truck (10T)', 'SPL-P-26-011', 'Transport', 'Trip', '9965'),
('p12', 'Container (22T)', 'SPL-P-26-012', 'Transport', 'Trip', '9965'),
('p13', 'Press Servicing', 'SPL-P-26-013', 'Maintenance', 'Visit', '9987'),
('p14', 'Resin Waste Disposal', 'SPL-P-26-014', 'Job Work', 'Trip', '9994');

INSERT OR IGNORE INTO vendor_cities (id, city, state, pincodes) VALUES
('ct1', 'Wankaner', 'Gujarat', '["363621","363622"]'),
('ct2', 'Morbi', 'Gujarat', '["363641","363650"]'),
('ct3', 'Rajkot', 'Gujarat', '["360001","360002","360003"]'),
('ct4', 'Ahmedabad', 'Gujarat', '["380001","380006","380015","382415"]'),
('ct5', 'Surat', 'Gujarat', '["395001","395002","395003"]'),
('ct6', 'Vadodara', 'Gujarat', '["390001","390002","390005"]'),
('ct7', 'Ankleshwar', 'Gujarat', '["393001","393002"]'),
('ct8', 'Valsad', 'Gujarat', '["396001","396002"]'),
('ct9', 'Mumbai', 'Maharashtra', '["400001","400093","400013"]'),
('ct10', 'Pune', 'Maharashtra', '["411001","411057"]'),
('ct11', 'Nagpur', 'Maharashtra', '["440001","440002"]'),
('ct12', 'New Delhi', 'Delhi', '["110001","110002"]'),
('ct13', 'Bengaluru', 'Karnataka', '["560001","560010"]'),
('ct14', 'Chennai', 'Tamil Nadu', '["600001","600002"]'),
('ct15', 'Hyderabad', 'Telangana', '["500001","500008"]'),
('ct16', 'Jaipur', 'Rajasthan', '["302001","302003"]'),
('ct17', 'Indore', 'Madhya Pradesh', '["452001","452002"]'),
('ct18', 'Ludhiana', 'Punjab', '["141001","141002"]'),
('ct19', 'Coimbatore', 'Tamil Nadu', '["641001","641006"]'),
('ct20', 'Kolkata', 'West Bengal', '["700001","700006"]');

INSERT OR IGNORE INTO vendor_tnc (id, title, category, version, status, applies, body, summary) VALUES
('tnc1', 'Payment Terms', 'Payment', '1.0', 'active', 'all',
 'All invoices are payable within the agreed credit period from the date of invoice. Payments must be made by NEFT/RTGS/Cheque in favour of Strandply LLP. Late payments will attract interest at 18% per annum.',
 'Payment within credit period; 18% interest on delays.'),
('tnc2', 'Delivery & Transportation', 'Delivery', '1.0', 'active', 'all',
 'Delivery shall be made at the Strandply plant, Wankaner, Morbi, Gujarat unless otherwise specified. Risk of loss or damage passes to Strandply upon delivery at the plant gate. Vendor must provide valid e-way bill for all dispatches above Rs. 50,000.',
 'Delivery at Wankaner plant; e-way bill mandatory above Rs.50,000.'),
('tnc3', 'Quality & Inspection', 'Quality', '1.0', 'active', 'po',
 'All materials are subject to inspection upon receipt. Strandply reserves the right to reject materials that do not conform to agreed specifications. Rejected materials must be replaced within 7 working days at the vendor cost.',
 'Inspection on receipt; rejection within 7 days at vendor cost.'),
('tnc4', 'Warranty', 'Warranty', '1.0', 'active', 'all',
 'Vendor warrants that all goods supplied are free from defects in material and workmanship and conform to the specifications agreed upon. Warranty period is 12 months from date of delivery.',
 '12-month warranty from delivery date.'),
('tnc5', 'Confidentiality', 'Legal', '1.0', 'active', 'vendor',
 'The vendor agrees to keep all technical specifications, pricing, and business information of Strandply LLP strictly confidential and not to disclose the same to any third party without prior written consent.',
 'All Strandply information to be kept strictly confidential.');

INSERT OR IGNORE INTO vendor_records (id, name, code, type, categories, products, contact, phone, email, city, state, pincode, gst, payment_terms, rating, status, created_by, created_at, approved_at) VALUES
('v1', 'Nilgiri Timber Pvt Ltd', 'SPL-VEN-25-001', 'Manufacturer', '["Raw Material"]',
 '[{"_id":"p1","name":"Wax-Coated Strands","unit":"MT"},{"_id":"p2","name":"Dry Strands","unit":"MT"}]',
 'Rajesh Nair', '9876543210', 'rajesh@nilgiri.com', 'Nagpur', 'Maharashtra', '440002', '27AABCN1234F1Z5', '45 Days', 4, 'active', 'Jimit Mehta', '2024-11-10T09:00:00Z', '2024-11-12T10:00:00Z'),

('v2', 'Hexion Resins India', 'SPL-VEN-25-002', 'Distributor', '["Resin & Chemicals"]',
 '[{"_id":"p5","name":"MDI Resin","unit":"Drum"},{"_id":"p6","name":"PMDI Binder","unit":"Drum"},{"_id":"p8","name":"Wax Emulsion","unit":"Can"}]',
 'Priya Sharma', '9988001122', '', 'Mumbai', 'Maharashtra', '400093', '27AABHX5678G1Z3', '30 Days', 5, 'active', 'Jimit Mehta', '2024-10-05T09:00:00Z', '2024-10-07T10:00:00Z'),

('v3', 'Packaging World Morbi', 'SPL-VEN-25-003', 'Manufacturer', '["Packaging"]',
 '[{"_id":"p9","name":"Stretch Film Roll","unit":"Roll"},{"_id":"p10","name":"Edge Protectors","unit":"Nos"}]',
 'Kiran Shah', '9654321000', '', 'Morbi', 'Gujarat', '363641', '', '30 Days', 4, 'active', 'Operations', '2025-02-01T09:00:00Z', '2025-02-03T09:00:00Z'),

('v4', 'Gujarat Cargo Services', 'SPL-VEN-25-004', 'Transporter', '["Transport"]',
 '[{"_id":"p11","name":"FTL Truck (10T)","unit":"Trip"}]',
 'Mahesh Patel', '9123456780', '', 'Ahmedabad', 'Gujarat', '', '', 'Against Delivery', 4, 'active', 'Jimit Mehta', '2024-09-01T09:00:00Z', '2024-09-03T10:00:00Z'),

('v5', 'Sunrise Timber Traders', 'SPL-VEN-25-005', 'Trader', '["Raw Material"]',
 '[{"_id":"p1","name":"Wax-Coated Strands","unit":"MT"}]',
 'Anil Verma', '9765432100', '', 'Valsad', 'Gujarat', '396001', '', '30 Days', 3, 'pending', 'Vikram', '2025-05-10T09:00:00Z', ''),

('v6', 'Basant Chemicals', 'SPL-VEN-25-006', 'Trader', '["Resin & Chemicals"]',
 '[{"_id":"p5","name":"MDI Resin","unit":"Drum"},{"_id":"p7","name":"Urea Formaldehyde Resin","unit":"Drum"}]',
 'Basant Agarwal', '9000111222', '', 'Ankleshwar', 'Gujarat', '', '', '30 Days', 3, 'active', 'Operations', '2025-01-12T09:00:00Z', '2025-01-14T10:00:00Z'),

('v7', 'Cheap & Fast Packaging', 'SPL-VEN-25-007', 'Trader', '["Packaging"]',
 '[{"_id":"p9","name":"Stretch Film Roll","unit":"Roll"}]',
 'Unknown', '', '', 'Morbi', 'Gujarat', '', '', 'Advance', 1, 'blacklisted', 'Operations', '2025-01-05T09:00:00Z', '');


/* ══════════════════════════════════════════
   PRODUCTION MODULE TABLES
══════════════════════════════════════════ */

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


/* ══════════════════════════════════════════
   TRANSPORT MODULE TABLES
══════════════════════════════════════════ */

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


/* ══════════════════════════════════════════
   PURCHASE ERP MODULE TABLES
══════════════════════════════════════════ */

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


-- ═══════════════════════════════════════════════════════════════
-- 16. STOCK MANAGEMENT MODULE TABLES
-- ═══════════════════════════════════════════════════════════════

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

CREATE TABLE IF NOT EXISTS stock_balances (
  sku TEXT PRIMARY KEY,
  dept TEXT,
  qty REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

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

CREATE TABLE IF NOT EXISTS stock_opening (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  desc TEXT,
  qty REAL NOT NULL,
  entry_date TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS production_summaries (
  id TEXT PRIMARY KEY,
  report_date TEXT NOT NULL,
  remarks TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);


/* ══════════════════════════════════════════
   MAINTENANCE TRACKER MODULE TABLES
══════════════════════════════════════════ */

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

-- Maintenance indexes
CREATE INDEX IF NOT EXISTS idx_maint_wo_status ON maintenance_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_maint_wo_priority ON maintenance_work_orders(priority);
CREATE INDEX IF NOT EXISTS idx_maint_wo_area ON maintenance_work_orders(area);
CREATE INDEX IF NOT EXISTS idx_maint_wo_assignee ON maintenance_work_orders(assignee);
CREATE INDEX IF NOT EXISTS idx_maint_wo_due ON maintenance_work_orders(due_date);
CREATE INDEX IF NOT EXISTS idx_maint_tl_wo ON maintenance_timeline(work_order_id);

-- Seed default plant areas
INSERT OR IGNORE INTO maintenance_areas (id, name) VALUES
('ma1', 'Assembly Line A'),
('ma2', 'Assembly Line B'),
('ma3', 'Packaging Unit'),
('ma4', 'Boiler Room'),
('ma5', 'Warehouse'),
('ma6', 'Quality Lab'),
('ma7', 'Utility Block'),
('ma8', 'Press Shop');

-- ══════════════════════════════════════════════════════════
-- ELECTRICITY & METER MIS MODULE
-- ══════════════════════════════════════════════════════════

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

CREATE INDEX IF NOT EXISTS idx_el_readings_date ON electricity_readings(date);
CREATE INDEX IF NOT EXISTS idx_el_readings_shift ON electricity_readings(shift);
CREATE INDEX IF NOT EXISTS idx_el_readings_date_shift ON electricity_readings(date, shift);
CREATE INDEX IF NOT EXISTS idx_el_bills_date ON electricity_bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_el_mf_eff ON electricity_mf_history(effective_date);
CREATE INDEX IF NOT EXISTS idx_el_fc_eff ON electricity_fc_history(effective_date);
CREATE INDEX IF NOT EXISTS idx_el_er_eff ON electricity_er_history(effective_date);
CREATE INDEX IF NOT EXISTS idx_el_fr_eff ON electricity_fr_history(effective_date);

INSERT OR IGNORE INTO electricity_meter_config (id, meter_no, consumer_no, category, sanc_load, ct, pt, tariff, cycle)
VALUES ('default', 'GJ-123456-HT', '1234567890', 'HT Industrial', '500', '200/5 A', '11000/110 V', 'HT-2(a)', 'Monthly');

INSERT OR IGNORE INTO electricity_mf_history (id, mf, effective_date) VALUES ('mf-default', 30, '2022-10-01');
INSERT OR IGNORE INTO electricity_fc_history (id, fc, effective_date) VALUES ('fc-default', 638675, '2022-10-01');
INSERT OR IGNORE INTO electricity_er_history (id, rate, effective_date) VALUES ('er-default', 4.20, '2018-04-01');
INSERT OR IGNORE INTO electricity_fr_history (id, rate, effective_date) VALUES ('fr-default', 2.30, '2018-04-01');

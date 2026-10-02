-- 0005_vendors.sql
--
-- Vendors module (legacy Vendor Portal): categories, products, vendors with their category and
-- product links, the T&C master; pincodes on the shared city master; and the Vendors keys in the
-- role permission matrix. Behaviour lives in api/src/modules/vendors (docs/vendors-spec.md).
-- Conventions are listed at the top of 0001_users.sql. Nothing here has been run.

-- ─────────────────────────────────────────────────────────────
-- Categories
-- ─────────────────────────────────────────────────────────────

CREATE TABLE vn_categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL COLLATE NOCASE,
  icon        TEXT,                                  -- one emoji
  color       TEXT NOT NULL DEFAULT 'grey' CHECK (color IN ('yellow', 'indigo', 'pink', 'blue', 'green', 'purple', 'grey', 'orange', 'red', 'teal', 'amber', 'lime')),
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 99 CHECK (sort_order >= 1),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes       TEXT,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX vn_categories_name_uq ON vn_categories (name) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- Products (materials bought from vendors; not the SampleTrack board catalogue)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE vn_products (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL COLLATE NOCASE,       -- SPL-P-YY-NNN from st_counters 'VP-YY'
  name           TEXT NOT NULL COLLATE NOCASE,
  category_id    TEXT NOT NULL REFERENCES vn_categories(id),
  unit           TEXT NOT NULL CHECK (unit IN ('MT', 'KG', 'Gram', 'Litre', 'ML', 'Drum', 'Can', 'Bag', 'Nos', 'Pcs', 'Sheets', 'Roll', 'Bundle', 'Box', 'Trip', 'Visit', 'Job', 'Metres', 'Sq.Ft')),
  alt_unit       TEXT,
  conv_factor    REAL CHECK (conv_factor IS NULL OR conv_factor > 0),   -- 1 unit = conv_factor alt_unit
  hsn            TEXT,
  gst_rate       INTEGER CHECK (gst_rate IS NULL OR gst_rate IN (0, 5, 12, 18, 28)),
  moq            REAL CHECK (moq IS NULL OR moq >= 0),
  lead_time_days INTEGER CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  description    TEXT,
  notes          TEXT,
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at     TEXT
);
CREATE UNIQUE INDEX vn_products_code_uq ON vn_products (code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX vn_products_name_uq ON vn_products (name) WHERE deleted_at IS NULL;
CREATE INDEX vn_products_category_idx ON vn_products (category_id);

-- ─────────────────────────────────────────────────────────────
-- Vendors
-- Status flow: pending → approved → active; pending/approved/active/inactive → blacklisted;
-- blacklisted → approved (reinstate); inactive → pending (submit). See docs/vendors-spec.md §3.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE vn_vendors (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL COLLATE NOCASE,     -- SPL-VEN-YY-NNN from st_counters 'VEN-YY', or typed in
  name             TEXT NOT NULL COLLATE NOCASE,
  type             TEXT CHECK (type IS NULL OR type IN ('Manufacturer', 'Trader', 'Distributor', 'Transporter', 'Service Provider', 'Sub-contractor')),
  year_established INTEGER,
  contact          TEXT,
  designation      TEXT,
  phone            TEXT,
  email            TEXT,
  address          TEXT,
  pincode          TEXT,
  city             TEXT,
  state            TEXT,                             -- state name as text, like st_parties.state
  website          TEXT,
  gst              TEXT,
  pan              TEXT,
  msme             TEXT,
  payment_terms    TEXT CHECK (payment_terms IS NULL OR payment_terms IN ('Advance', 'Against Delivery', '15 Days', '30 Days', '45 Days', '60 Days')),
  bank             TEXT,
  account_no       TEXT,
  ifsc             TEXT,
  rating           INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'active', 'inactive', 'blacklisted')),
  submitted_at     TEXT,
  approved_at      TEXT,
  approved_by      TEXT REFERENCES users(id),
  activated_at     TEXT,
  activated_by     TEXT REFERENCES users(id),
  blacklist_reason TEXT,
  blacklisted_at   TEXT,
  blacklisted_by   TEXT REFERENCES users(id),
  created_by       TEXT REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at       TEXT,
  CHECK (status <> 'blacklisted' OR blacklist_reason IS NOT NULL)
);
CREATE UNIQUE INDEX vn_vendors_code_uq ON vn_vendors (code) WHERE deleted_at IS NULL;
CREATE INDEX vn_vendors_status_idx ON vn_vendors (status);
CREATE INDEX vn_vendors_name_idx ON vn_vendors (name);

-- A vendor's categories and products (the memory backend keeps these as id arrays on the vendor).
-- Replaced as a whole on edit: DELETE then INSERT, in the same batch as the vendor UPDATE.
CREATE TABLE vn_vendor_categories (
  vendor_id   TEXT NOT NULL REFERENCES vn_vendors(id),
  category_id TEXT NOT NULL REFERENCES vn_categories(id),
  position    INTEGER NOT NULL,                      -- keeps the order they were picked in
  PRIMARY KEY (vendor_id, category_id)
);
CREATE INDEX vn_vendor_categories_category_idx ON vn_vendor_categories (category_id);

CREATE TABLE vn_vendor_products (
  vendor_id  TEXT NOT NULL REFERENCES vn_vendors(id),
  product_id TEXT NOT NULL REFERENCES vn_products(id),
  position   INTEGER NOT NULL,
  PRIMARY KEY (vendor_id, product_id)
);
CREATE INDEX vn_vendor_products_product_idx ON vn_vendor_products (product_id);

-- ─────────────────────────────────────────────────────────────
-- T&C master (clauses attached to POs, vendor agreements and quotations)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE vn_tnc (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  category   TEXT CHECK (category IS NULL OR category IN ('Payment', 'Delivery', 'Quality', 'Legal', 'Warranty', 'General')),
  version    TEXT NOT NULL DEFAULT '1.0',
  body       TEXT NOT NULL,
  summary    TEXT,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  applies_to TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'po', 'vendor', 'quote')),
  notes      TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

-- ─────────────────────────────────────────────────────────────
-- Pincodes on the shared city master. JSON array of 6-digit strings; a pincode belongs to one
-- live city (checked by the API: D1 can't index into a JSON array).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE st_city_master ADD COLUMN pincodes TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(pincodes));

INSERT INTO st_city_master (id, city, state_id, is_custom, pincodes) VALUES
  ('city-valsad', 'Valsad', 'state-24', 0, '["396001","396002"]');

-- ─────────────────────────────────────────────────────────────
-- Seed: legacy Vendor Portal defaults. Generated from api/src/seed/vendors.ts and reference.ts.
-- ─────────────────────────────────────────────────────────────

INSERT INTO vn_categories (id, name, icon, color, description, sort_order, status) VALUES
  ('vcat-raw-material', 'Raw Material', '🪵', 'yellow', 'Strands, timber, veneer', 1, 'active'),
  ('vcat-resin', 'Resin & Chemicals', '🧪', 'indigo', 'MDI, PMDI, UF resin', 2, 'active'),
  ('vcat-packaging', 'Packaging', '📦', 'pink', 'Film, edge protectors', 3, 'active'),
  ('vcat-transport', 'Transport', '🚛', 'blue', 'Trucks and logistics', 4, 'active'),
  ('vcat-maintenance', 'Maintenance', '🔧', 'green', 'Press and machinery', 5, 'active'),
  ('vcat-job-work', 'Job Work', '🛠️', 'purple', 'Disposal and processing', 6, 'active');

INSERT INTO vn_products (id, code, name, category_id, unit, hsn) VALUES
  ('vprod-001', 'SPL-P-26-001', 'Wax-Coated Strands', 'vcat-raw-material', 'MT', '4401'),
  ('vprod-002', 'SPL-P-26-002', 'Dry Strands', 'vcat-raw-material', 'MT', '4401'),
  ('vprod-003', 'SPL-P-26-003', 'Birch Face Veneer', 'vcat-raw-material', 'Sheets', '4408'),
  ('vprod-004', 'SPL-P-26-004', 'Core Veneer', 'vcat-raw-material', 'Sheets', '4408'),
  ('vprod-005', 'SPL-P-26-005', 'MDI Resin', 'vcat-resin', 'Drum', '3909'),
  ('vprod-006', 'SPL-P-26-006', 'PMDI Binder', 'vcat-resin', 'Drum', '3909'),
  ('vprod-007', 'SPL-P-26-007', 'Urea Formaldehyde Resin', 'vcat-resin', 'Drum', '3909'),
  ('vprod-008', 'SPL-P-26-008', 'Wax Emulsion', 'vcat-resin', 'Can', '3404'),
  ('vprod-009', 'SPL-P-26-009', 'Stretch Film Roll', 'vcat-packaging', 'Roll', '3920'),
  ('vprod-010', 'SPL-P-26-010', 'Edge Protectors', 'vcat-packaging', 'Nos', '4819'),
  ('vprod-011', 'SPL-P-26-011', 'FTL Truck (10T)', 'vcat-transport', 'Trip', '9965'),
  ('vprod-012', 'SPL-P-26-012', 'Container (22T)', 'vcat-transport', 'Trip', '9965'),
  ('vprod-013', 'SPL-P-26-013', 'Press Servicing', 'vcat-maintenance', 'Visit', '9987'),
  ('vprod-014', 'SPL-P-26-014', 'Resin Waste Disposal', 'vcat-job-work', 'Trip', '9994');

INSERT INTO st_counters (name, last_value) VALUES ('VP-26', 14);

INSERT INTO vn_tnc (id, title, category, version, body, summary, status, applies_to) VALUES
  ('tnc-payment', 'Payment Terms', 'Payment', '1.0', 'All invoices are payable within the agreed credit period from the date of invoice. Payments must be made by NEFT/RTGS/Cheque in favour of Strandply LLP. Late payments will attract interest at 18% per annum.', 'Payment within credit period; 18% interest on delays.', 'active', 'all'),
  ('tnc-delivery', 'Delivery & Transportation', 'Delivery', '1.0', 'Delivery shall be made at the Strandply plant, Wankaner, Morbi, Gujarat unless otherwise specified. Risk of loss or damage passes to Strandply upon delivery at the plant gate. Vendor must provide valid e-way bill for all dispatches above Rs. 50,000.', 'Delivery at Wankaner plant; e-way bill mandatory above Rs.50,000.', 'active', 'all'),
  ('tnc-quality', 'Quality & Inspection', 'Quality', '1.0', 'All materials are subject to inspection upon receipt. Strandply reserves the right to reject materials that do not conform to agreed specifications. Rejected materials must be replaced within 7 working days at the vendor cost.', 'Inspection on receipt; rejection within 7 days at vendor cost.', 'active', 'po'),
  ('tnc-warranty', 'Warranty', 'Warranty', '1.0', 'Vendor warrants that all goods supplied are free from defects in material and workmanship and conform to the specifications agreed upon. Warranty period is 12 months from date of delivery.', '12-month warranty from delivery date.', 'active', 'all'),
  ('tnc-confidentiality', 'Confidentiality', 'Legal', '1.0', 'The vendor agrees to keep all technical specifications, pricing, and business information of Strandply LLP strictly confidential and not to disclose the same to any third party without prior written consent.', 'All Strandply information to be kept strictly confidential.', 'active', 'vendor');

INSERT INTO st_settings (key, value) VALUES
  ('vendors.email.from_name', '"Strandply LLP"'),
  ('vendors.email.reply_to', '""');

UPDATE st_city_master SET pincodes = '["363621","363622"]' WHERE id = 'city-wankaner';
UPDATE st_city_master SET pincodes = '["363641","363650"]' WHERE id = 'city-morbi';
UPDATE st_city_master SET pincodes = '["360001","360002","360003"]' WHERE id = 'city-rajkot';
UPDATE st_city_master SET pincodes = '["380001","380006","380015","382415"]' WHERE id = 'city-ahmedabad';
UPDATE st_city_master SET pincodes = '["395001","395002","395003"]' WHERE id = 'city-surat';
UPDATE st_city_master SET pincodes = '["390001","390002","390005"]' WHERE id = 'city-vadodara';
UPDATE st_city_master SET pincodes = '["393001","393002"]' WHERE id = 'city-ankleshwar';
UPDATE st_city_master SET pincodes = '["400001","400093","400013"]' WHERE id = 'city-mumbai';
UPDATE st_city_master SET pincodes = '["411001","411057"]' WHERE id = 'city-pune';
UPDATE st_city_master SET pincodes = '["440001","440002"]' WHERE id = 'city-nagpur';
UPDATE st_city_master SET pincodes = '["110001","110002"]' WHERE id = 'city-new-delhi';
UPDATE st_city_master SET pincodes = '["560001","560010"]' WHERE id = 'city-bengaluru';
UPDATE st_city_master SET pincodes = '["600001","600002"]' WHERE id = 'city-chennai';
UPDATE st_city_master SET pincodes = '["500001","500008"]' WHERE id = 'city-hyderabad';
UPDATE st_city_master SET pincodes = '["302001","302003"]' WHERE id = 'city-jaipur';
UPDATE st_city_master SET pincodes = '["452001","452002"]' WHERE id = 'city-indore';
UPDATE st_city_master SET pincodes = '["141001","141002"]' WHERE id = 'city-ludhiana';
UPDATE st_city_master SET pincodes = '["641001","641006"]' WHERE id = 'city-coimbatore';
UPDATE st_city_master SET pincodes = '["700001","700006"]' WHERE id = 'city-kolkata';

-- ─────────────────────────────────────────────────────────────
-- Role permissions: append the Vendors keys to the existing rows, so custom changes are kept.
-- Same result as DEFAULT_ROLE_PERMISSIONS in api/src/domain/access.ts (a test checks 0004 + this).
-- ─────────────────────────────────────────────────────────────

UPDATE st_role_permissions
SET permissions = json_insert(permissions,
      '$.pages[#]', 'vendors', '$.pages[#]', 'vendor_reports', '$.pages[#]', 'vendor_masters', '$.pages[#]', 'vendor_settings',
      '$.actions[#]', 'vendor_approve'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('superadmin', 'admin');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'vendors', '$.pages[#]', 'vendor_reports'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('management');

-- ═══════════════════════════════════════════════════════════════
-- STRANDPLY LLP — D1 DATABASE SCHEMA UPDATE
-- Add Creator Tracking columns + Vendor Portal Tables & Seed Data
-- ═══════════════════════════════════════════════════════════════

-- 1. ADD CREATOR TRACKING TO EXISTING DISPATCH TABLES
-- Catch errors gracefully if columns already exist by running as separate statements
ALTER TABLE couriers ADD COLUMN created_by TEXT;
ALTER TABLE dispatches ADD COLUMN created_by TEXT;
ALTER TABLE parties ADD COLUMN created_by TEXT;
ALTER TABLE products ADD COLUMN created_by TEXT;
ALTER TABLE requests ADD COLUMN created_by TEXT;

-- 2. CREATE VENDOR PORTAL TABLES

-- Vendor Records
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

-- Vendor Custom Products / Materials
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

-- Vendor Material Categories
CREATE TABLE IF NOT EXISTS vendor_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🏷️',
  color_class TEXT DEFAULT 'c1',        -- css class name (e.g. c1, c2)
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 99,
  status TEXT DEFAULT 'active',          -- active | inactive
  notes TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Cities & Pincodes for Vendor Portal
CREATE TABLE IF NOT EXISTS vendor_cities (
  id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincodes TEXT DEFAULT '[]',           -- JSON array of strings
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Terms & Conditions Clauses
CREATE TABLE IF NOT EXISTS vendor_tnc (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT DEFAULT '',
  version TEXT DEFAULT '1.0',
  body TEXT NOT NULL,
  summary TEXT DEFAULT '',
  status TEXT DEFAULT 'active',          -- active | inactive
  applies TEXT DEFAULT 'all',           -- all | po | vendor
  notes TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);


-- 3. INSERT SEED DATA FOR VENDOR PORTAL

-- Default Categories
INSERT OR IGNORE INTO vendor_categories (id, name, icon, color_class, description, sort_order) VALUES
('c1', 'Raw Material', '🪵', 'c1', 'Strands, timber, veneer', 1),
('c2', 'Resin & Chemicals', '🧪', 'c2', 'MDI, PMDI, UF resin', 2),
('c3', 'Packaging', '📦', 'c3', 'Film, edge protectors', 3),
('c4', 'Transport', '🚛', 'c4', 'Trucks and logistics', 4),
('c5', 'Maintenance', '🔧', 'c5', 'Press and machinery', 5),
('c6', 'Job Work', '🛠️', 'c6', 'Disposal and processing', 6);

-- Default Products
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

-- Default Cities
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

-- Default Terms & Conditions
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

-- Default Vendors
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

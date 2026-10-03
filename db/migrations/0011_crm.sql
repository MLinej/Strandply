-- 0011_crm.sql
--
-- CRM module (legacy "Marketing & Sales CRM"): leads, customer profiles, follow-ups, opportunities,
-- quotations, orders won and lost, tasks, campaigns, product and salesperson masters; plus the crm_* keys
-- in the role permission matrix and the CRM settings. Behaviour lives in api/src/modules/crm (docs/crm-spec.md).
-- Conventions are listed at the top of 0001_users.sql. Nothing here has been run.
--
-- Numbers: quotations QT/26-27/0001 and orders won ORD/26-27/0001 from st_counters 'CRM-QT-<fy>' / 'CRM-ORD-<fy>'.
-- Money: INTEGER paise. Salesperson, product, source and campaign are stored by name, as legacy did
-- (renaming a master entry doesn't rewrite old records). CRM customers can link to a Sales party (sl_customers).

CREATE TABLE crm_leads (
  id                 TEXT PRIMARY KEY,
  date_added         TEXT NOT NULL,
  company_name       TEXT NOT NULL,
  contact_person     TEXT,
  contact_person2    TEXT,
  mobile             TEXT NOT NULL,
  mobile2            TEXT,
  alt_mobile         TEXT,
  whatsapp           TEXT,
  email              TEXT,
  city               TEXT,
  state              TEXT,
  pincode            TEXT,
  address            TEXT,
  customer_type      TEXT,
  product            TEXT,
  source             TEXT,
  campaign           TEXT,
  salesperson        TEXT,
  stage              TEXT NOT NULL DEFAULT 'New Lead' CHECK (stage IN ('New Lead', 'Contacted', 'Qualified', 'Product Discussion', 'Sample Required', 'Sample Sent', 'Follow-Up', 'Quotation', 'Negotiation', 'Order Won', 'Order Lost')),
  next_action        TEXT,
  next_follow_up     TEXT,
  remarks            TEXT,
  data_quality       TEXT NOT NULL DEFAULT 'Good' CHECK (data_quality IN ('Good', 'Imported')),
  customer_id        TEXT,                                -- crm_customers.id once converted
  created_by         TEXT REFERENCES users(id),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at         TEXT
);
CREATE INDEX crm_leads_mobile_idx ON crm_leads (mobile);
CREATE INDEX crm_leads_stage_idx ON crm_leads (stage);

CREATE TABLE crm_customers (
  id                    TEXT PRIMARY KEY,
  company_name          TEXT NOT NULL,
  contact_person        TEXT,
  contact_person2       TEXT,
  designation           TEXT,
  mobile                TEXT NOT NULL,
  mobile2               TEXT,
  whatsapp              TEXT,
  email                 TEXT,
  website               TEXT,
  city                  TEXT,
  state                 TEXT,
  pincode               TEXT,
  address               TEXT,
  gstin                 TEXT,
  pan                   TEXT,
  customer_type         TEXT,
  est_monthly_req       TEXT,
  products_used         TEXT,
  current_supplier      TEXT,
  approx_purchase_value TEXT,
  preferred_thickness   TEXT,
  preferred_size        TEXT,
  application           TEXT,
  existing_brand        TEXT,
  competitor_brand      TEXT,
  payment_preference    TEXT,
  credit_requirement    TEXT,
  territory             TEXT,
  lead_source           TEXT,
  salesperson           TEXT,
  status                TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Archived')),
  priority              TEXT NOT NULL DEFAULT 'Warm' CHECK (priority IN ('Hot', 'Warm', 'Cold')),
  first_contact_date    TEXT,
  last_contact_date     TEXT,
  next_follow_up        TEXT,
  remarks               TEXT,
  lead_id               TEXT,
  sales_customer_id     TEXT REFERENCES sl_customers(id),
  created_by            TEXT REFERENCES users(id),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at            TEXT
);
CREATE INDEX crm_customers_mobile_idx ON crm_customers (mobile);

CREATE TABLE crm_followups (
  id                TEXT PRIMARY KEY,
  customer_id       TEXT NOT NULL REFERENCES crm_customers(id),
  date              TEXT NOT NULL,
  time              TEXT,
  type              TEXT NOT NULL,
  contact_person    TEXT,
  salesperson       TEXT,
  discussion        TEXT,
  customer_response TEXT,
  next_action       TEXT,
  next_follow_up    TEXT,
  status            TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed', 'Rescheduled', 'Customer Not Reachable', 'Customer Requested Later', 'Converted', 'Lost')),
  priority          TEXT NOT NULL DEFAULT 'Warm' CHECK (priority IN ('Hot', 'Warm', 'Cold')),
  created_by        TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at        TEXT
);
CREATE INDEX crm_followups_customer_idx ON crm_followups (customer_id);
CREATE INDEX crm_followups_due_idx ON crm_followups (status, next_follow_up);

CREATE TABLE crm_opportunities (
  id                    TEXT PRIMARY KEY,
  customer_id           TEXT NOT NULL REFERENCES crm_customers(id),
  product               TEXT NOT NULL,
  thickness             TEXT,
  size                  TEXT,
  quantity              TEXT,
  est_value_paise       INTEGER NOT NULL DEFAULT 0,
  expected_closing_date TEXT,
  salesperson           TEXT,
  stage                 TEXT NOT NULL DEFAULT 'Qualification' CHECK (stage IN ('Qualification', 'Product Discussion', 'Sample', 'Quotation', 'Negotiation', 'Order Won', 'Order Lost')),
  probability           INTEGER NOT NULL DEFAULT 25 CHECK (probability BETWEEN 0 AND 100),
  competitor            TEXT,
  current_supplier      TEXT,
  notes                 TEXT,
  reactivated_from      TEXT,                            -- crm_orders_lost.id
  created_by            TEXT REFERENCES users(id),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at            TEXT
);
CREATE INDEX crm_opportunities_customer_idx ON crm_opportunities (customer_id);

CREATE TABLE crm_quotations (
  id             TEXT PRIMARY KEY,
  quote_no       TEXT NOT NULL,
  customer_id    TEXT NOT NULL REFERENCES crm_customers(id),
  opportunity_id TEXT REFERENCES crm_opportunities(id),
  product        TEXT NOT NULL,
  quantity       REAL NOT NULL CHECK (quantity > 0),
  rate_paise     INTEGER NOT NULL,                      -- per unit
  gst_pct        REAL NOT NULL DEFAULT 18,
  date           TEXT NOT NULL,
  valid_until    TEXT,
  salesperson    TEXT,
  status         TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Sent', 'Under Discussion', 'Negotiation', 'Accepted', 'Rejected', 'Expired')),
  remarks        TEXT,
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at     TEXT
);
CREATE UNIQUE INDEX crm_quotations_no_uq ON crm_quotations (lower(quote_no)) WHERE deleted_at IS NULL;

CREATE TABLE crm_orders_won (
  id                 TEXT PRIMARY KEY,
  order_no           TEXT NOT NULL,
  opportunity_id     TEXT REFERENCES crm_opportunities(id),
  customer_id        TEXT NOT NULL REFERENCES crm_customers(id),
  order_date         TEXT NOT NULL,
  product            TEXT NOT NULL,
  quantity           TEXT,
  rate_paise         INTEGER NOT NULL DEFAULT 0,
  order_value_paise  INTEGER NOT NULL,
  dispatch_date      TEXT,
  reason             TEXT,
  remarks            TEXT,
  salesperson        TEXT,
  source             TEXT,
  lead_to_order_days INTEGER,
  created_by         TEXT REFERENCES users(id),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at         TEXT
);
CREATE UNIQUE INDEX crm_orders_won_no_uq ON crm_orders_won (lower(order_no)) WHERE deleted_at IS NULL;

CREATE TABLE crm_orders_lost (
  id                     TEXT PRIMARY KEY,
  opportunity_id         TEXT REFERENCES crm_opportunities(id),
  customer_id            TEXT NOT NULL REFERENCES crm_customers(id),
  lost_date              TEXT NOT NULL,
  product                TEXT NOT NULL,
  quantity               TEXT,
  est_value_paise        INTEGER NOT NULL DEFAULT 0,
  competitor             TEXT,
  competitor_price_paise INTEGER,
  our_price_paise        INTEGER,
  expected_price_paise   INTEGER,
  lost_reason            TEXT NOT NULL,
  remarks                TEXT,
  reactivation_date      TEXT,
  salesperson            TEXT,
  reactivated_opp_id     TEXT,
  created_by             TEXT REFERENCES users(id),
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at             TEXT
);

CREATE TABLE crm_tasks (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  customer_id TEXT REFERENCES crm_customers(id),
  assigned_to TEXT,
  due_date    TEXT NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'Warm' CHECK (priority IN ('Hot', 'Warm', 'Cold')),
  status      TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed')),
  remarks     TEXT,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);

CREATE TABLE crm_campaigns (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  platform        TEXT,
  start_date      TEXT,
  end_date        TEXT,
  budget_paise    INTEGER NOT NULL DEFAULT 0,
  target_audience TEXT,
  product         TEXT,
  created_by      TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at      TEXT
);
CREATE UNIQUE INDEX crm_campaigns_name_uq ON crm_campaigns (lower(trim(name))) WHERE deleted_at IS NULL;

CREATE TABLE crm_products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  thickness   TEXT,
  size        TEXT,
  grade       TEXT,
  application TEXT,
  rate_paise  INTEGER NOT NULL DEFAULT 0,
  moq         TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX crm_products_name_uq ON crm_products (lower(trim(name))) WHERE deleted_at IS NULL;

CREATE TABLE crm_salespersons (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  mobile      TEXT,
  email       TEXT,
  territory   TEXT,
  designation TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX crm_salespersons_name_uq ON crm_salespersons (lower(trim(name))) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- Reference data: legacy DEFAULT_PRODUCTS / DEFAULT_SALESPERSONS (api/src/seed/crm.ts).
-- ─────────────────────────────────────────────────────────────

INSERT INTO crm_products (id, name, thickness, size, grade, application) VALUES
  ('crp-osb', 'OSB', '9/12/15/18mm', '8x4 ft', 'Standard', 'Roofing/Flooring/Packing'),
  ('crp-sosb', 'S-OSB', '9/12/15/18mm', '8x4 ft', 'Structural', 'Structural panels'),
  ('crp-mdo', 'MDO Board', '12/15/18mm', '8x4 ft', 'Overlay', 'Shuttering/Signage'),
  ('crp-hybrid', 'Hybrid Board', '12/15/18mm', '8x4 ft', 'Hybrid', 'Furniture/Interior'),
  ('crp-firnopan', 'Firnopan', '12/15/18mm', '8x4 ft', 'Premium', 'Furniture'),
  ('crp-other', 'Other', NULL, NULL, NULL, NULL);

INSERT INTO crm_salespersons (id, name, territory, designation) VALUES
  ('crs-suresh', 'Suresh Kumar', 'Gujarat', 'Marketing Head'),
  ('crs-kaushik', 'Kaushik Kothari', 'Rajkot', 'Accounts/Sales');

INSERT INTO st_settings (key, value) VALUES
  ('crm.sources', '["Website","Google","Facebook","Instagram","WhatsApp","IndiaMART","TradeIndia","Exhibition","Dealer Reference","Customer Reference","Architect Reference","Contractor Reference","Existing Customer","Outbound Calling","Salesperson Visit","Email Campaign","Digital Advertisement","Other"]'),
  ('crm.lost_reasons', '["Price Too High","Competitor Lower Price","Customer Selected Competitor","Product Specification Issue","Quality Concern","Delivery Time","Stock Not Available","Credit Terms","Payment Terms","Customer Project Cancelled","Customer Requirement Changed","Sample Rejected","No Response","Competitor Relationship","Customer Not Genuine","Internal Delay","Wrong Lead","Product Not Suitable","Quantity Too Small","Other"]');

-- ─────────────────────────────────────────────────────────────
-- Role permissions: append the CRM keys (keeps custom changes).
-- Same result as DEFAULT_ROLE_PERMISSIONS in api/src/domain/access.ts (a test checks 0004 + 0005 … 0011).
-- ─────────────────────────────────────────────────────────────

UPDATE st_role_permissions
SET permissions = json_insert(permissions,
      '$.pages[#]', 'crm_dashboard', '$.pages[#]', 'crm_leads', '$.pages[#]', 'crm_followups', '$.pages[#]', 'crm_customers',
      '$.pages[#]', 'crm_pipeline', '$.pages[#]', 'crm_masters', '$.pages[#]', 'crm_reports'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('superadmin', 'admin');

UPDATE st_role_permissions
SET permissions = json_insert(permissions,
      '$.pages[#]', 'crm_dashboard', '$.pages[#]', 'crm_leads', '$.pages[#]', 'crm_followups', '$.pages[#]', 'crm_customers', '$.pages[#]', 'crm_pipeline'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('marketing');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'crm_dashboard', '$.pages[#]', 'crm_reports'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('management');

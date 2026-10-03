-- 0012_transport.sql
--
-- Transport module (legacy "Transport Module"): vehicle types, transporter directory, and the freight flow
-- inquiry (INQ) → rate comparison (RC) with its freight approval (FRA) → order form (SFO); plus the
-- transport_* keys in the role permission matrix. Behaviour lives in api/src/modules/transport (docs/transport-spec.md).
-- Conventions are listed at the top of 0001_users.sql. Nothing here has been run.
--
-- Numbers: INQ-26-001, RC-26-001, FRA-26-001, SFO-26-001 from st_counters 'TR-<prefix>-<fy>'; transporter codes
-- TRP-26-001 from 'TR-TRP'. Money: INTEGER paise. Places (from / to / operating cities) are city, state, pincode text,
-- picked from the shared city master. Vehicle types are stored by name on transporters and inquiries.

CREATE TABLE tr_vehicle_types (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  capacity    TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX tr_vehicle_types_name_uq ON tr_vehicle_types (lower(trim(name))) WHERE deleted_at IS NULL;

CREATE TABLE tr_transporters (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL,
  name           TEXT NOT NULL,
  contact_person TEXT,
  phone          TEXT NOT NULL,
  phone2         TEXT,
  email          TEXT,
  address        TEXT,
  city           TEXT NOT NULL,
  state          TEXT,
  pincode        TEXT,
  gstin          TEXT,
  pan            TEXT,
  tds            INTEGER NOT NULL DEFAULT 0 CHECK (tds IN (0, 1)),   -- TDS declaration given
  credit_terms   TEXT NOT NULL DEFAULT 'Against Delivery',
  ifsc           TEXT,
  bank_name      TEXT,
  bank_branch    TEXT,
  account_name   TEXT,
  account_no     TEXT,
  vehicles       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(vehicles)),          -- vehicle type names
  rating         INTEGER NOT NULL DEFAULT 3 CHECK (rating BETWEEN 1 AND 5),
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at     TEXT
);
CREATE UNIQUE INDEX tr_transporters_code_uq ON tr_transporters (lower(code)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX tr_transporters_name_uq ON tr_transporters (lower(trim(name))) WHERE deleted_at IS NULL;

CREATE TABLE tr_transporter_cities (
  transporter_id TEXT NOT NULL REFERENCES tr_transporters(id),
  city           TEXT NOT NULL,
  state          TEXT,
  pincode        TEXT,
  PRIMARY KEY (transporter_id, city)
);
CREATE INDEX tr_transporter_cities_city_idx ON tr_transporter_cities (lower(city));

CREATE TABLE tr_inquiries (
  id              TEXT PRIMARY KEY,
  inq_no          TEXT NOT NULL,
  date            TEXT NOT NULL,
  from_city       TEXT NOT NULL,
  from_state      TEXT,
  from_pincode    TEXT,
  to_city         TEXT NOT NULL,
  to_state        TEXT,
  to_pincode      TEXT,
  material        TEXT NOT NULL,
  weight_mt       REAL,
  vehicle         TEXT NOT NULL,
  pickup_date     TEXT,
  delivery_type   TEXT NOT NULL DEFAULT 'Door Delivery' CHECK (delivery_type IN ('Door Delivery', 'Godown Delivery')),
  freight_paid_by TEXT NOT NULL DEFAULT 'Strandply' CHECK (freight_paid_by IN ('Strandply', 'Party')),
  budget_paise    INTEGER NOT NULL DEFAULT 0,
  remarks         TEXT,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'rate_compared', 'approved', 'rejected', 'ordered', 'cancelled')),
  created_by      TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at      TEXT
);
CREATE UNIQUE INDEX tr_inquiries_no_uq ON tr_inquiries (lower(inq_no)) WHERE deleted_at IS NULL;
CREATE INDEX tr_inquiries_route_idx ON tr_inquiries (lower(from_city), lower(to_city), vehicle);

-- Rate comparison and its freight approval; one live per inquiry.
CREATE TABLE tr_rate_comparisons (
  id            TEXT PRIMARY KEY,
  rc_no         TEXT NOT NULL,
  inquiry_id    TEXT NOT NULL REFERENCES tr_inquiries(id),
  selected      INTEGER,                                 -- line_no of the chosen quote
  justification TEXT,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  approval_no   TEXT,                                    -- FRA-26-001 once submitted
  trail         TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(trail)),   -- [{action, by, byName, note, at}]
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at    TEXT
);
CREATE UNIQUE INDEX tr_rate_comparisons_no_uq ON tr_rate_comparisons (lower(rc_no)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX tr_rate_comparisons_inquiry_uq ON tr_rate_comparisons (inquiry_id) WHERE deleted_at IS NULL;

CREATE TABLE tr_quotes (
  rc_id            TEXT NOT NULL REFERENCES tr_rate_comparisons(id),
  line_no          INTEGER NOT NULL,
  transporter_id   TEXT NOT NULL REFERENCES tr_transporters(id),
  transporter_name TEXT NOT NULL,
  rate_paise       INTEGER NOT NULL DEFAULT 0,
  transit          TEXT NOT NULL,
  mg_weight_mt     REAL,                                -- minimum guarantee weight
  rating           INTEGER NOT NULL,
  phone            TEXT,
  PRIMARY KEY (rc_id, line_no)
);
CREATE INDEX tr_quotes_transporter_idx ON tr_quotes (transporter_id);

-- The order form: a snapshot of the approved freight and the transporter; one live (not cancelled) per comparison.
CREATE TABLE tr_orders (
  id                     TEXT PRIMARY KEY,
  order_no               TEXT NOT NULL,
  rc_id                  TEXT NOT NULL REFERENCES tr_rate_comparisons(id),
  inquiry_id             TEXT NOT NULL REFERENCES tr_inquiries(id),
  date                   TEXT NOT NULL,
  transporter_id         TEXT NOT NULL REFERENCES tr_transporters(id),
  transporter_name       TEXT NOT NULL,
  transporter_contact    TEXT,
  transporter_phone      TEXT,
  transporter_gstin      TEXT,
  transporter_address    TEXT,
  transporter_city       TEXT,
  transporter_state      TEXT,
  transporter_credit     TEXT,
  from_city              TEXT NOT NULL,
  from_state             TEXT,
  from_pincode           TEXT,
  to_city                TEXT NOT NULL,
  to_state               TEXT,
  to_pincode             TEXT,
  vehicle                TEXT NOT NULL,
  material               TEXT NOT NULL,
  weight_mt              REAL,
  pickup_date            TEXT,
  delivery_type          TEXT NOT NULL,
  freight_paid_by        TEXT NOT NULL,
  rate_paise             INTEGER NOT NULL,
  transit                TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'delivered', 'cancelled')),
  delivered_on           TEXT,
  remarks                TEXT,
  created_by             TEXT REFERENCES users(id),
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at             TEXT
);
CREATE UNIQUE INDEX tr_orders_no_uq ON tr_orders (lower(order_no)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX tr_orders_live_uq ON tr_orders (rc_id) WHERE deleted_at IS NULL AND status <> 'cancelled';

-- ─────────────────────────────────────────────────────────────
-- Reference data: legacy VEHICLES (api/src/seed/transport.ts).
-- ─────────────────────────────────────────────────────────────

INSERT INTO tr_vehicle_types (id, name, description, capacity) VALUES
  ('trv-lcv', 'LCV (1-2T)', 'Light Commercial Vehicle', '2 Ton'),
  ('trv-20ft', '20FT (5T)', '20 Foot Container Truck', '5 Ton'),
  ('trv-32ft', '32FT (10T)', '32 Foot Truck', '10 Ton'),
  ('trv-container', 'Container (22T)', 'ISO Container', '22 Ton'),
  ('trv-trailer', 'Trailer (25T)', 'Full Trailer', '25 Ton'),
  ('trv-open', 'Open Body', 'Open Flatbed Truck', 'Variable');

-- ─────────────────────────────────────────────────────────────
-- Role permissions: append the Transport keys (keeps custom changes).
-- Same result as DEFAULT_ROLE_PERMISSIONS in api/src/domain/access.ts (a test checks 0004 + 0005 … 0012).
-- ─────────────────────────────────────────────────────────────

UPDATE st_role_permissions
SET permissions = json_insert(permissions,
      '$.pages[#]', 'transport_dashboard', '$.pages[#]', 'transport_freight', '$.pages[#]', 'transport_masters', '$.pages[#]', 'transport_reports',
      '$.actions[#]', 'transport_approve'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('superadmin', 'admin');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'transport_dashboard', '$.pages[#]', 'transport_freight'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('dispatch');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'transport_dashboard', '$.pages[#]', 'transport_reports'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('management');

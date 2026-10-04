-- 0014_electricity.sql
--
-- Electricity module (legacy "Electricity & Meter MIS"): the HT meter's twice-daily kWh readings, the dated
-- histories of MF, fixed charge, energy rate and fuel surcharge used to cost them, and the PGVCL bill register;
-- plus the electricity_* keys in the role permission matrix. Behaviour lives in api/src/modules/electricity
-- (docs/electricity-spec.md). Conventions are listed at the top of 0001_users.sql. Nothing here has been run.
--
-- Money: INTEGER paise. Energy and fuel rates are paise per kWh; the fixed charge is paise per 30-day month.
-- Meter details (number, consumer no., category, load, CT / PT, tariff, cycle) are the st_settings key 'electricity.meter'.

CREATE TABLE el_rates (
  id             TEXT PRIMARY KEY,
  kind           TEXT NOT NULL CHECK (kind IN ('mf', 'fixed', 'energy', 'fuel')),
  value          REAL NOT NULL CHECK (value >= 0),        -- mf: factor; fixed: paise / month; energy, fuel: paise / kWh
  effective_from TEXT NOT NULL,
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at     TEXT
);
CREATE UNIQUE INDEX el_rates_kind_date_uq ON el_rates (kind, effective_from) WHERE deleted_at IS NULL;

CREATE TABLE el_readings (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  shift      TEXT NOT NULL CHECK (shift IN ('AM', 'PM')),
  time       TEXT NOT NULL,                              -- HH:MM; AM 00:00–11:59, PM 12:00–23:59
  at         TEXT NOT NULL,                              -- date || 'T' || time, the sort key
  kwh        REAL NOT NULL CHECK (kwh > 0),              -- cumulative meter reading
  pf         REAL CHECK (pf BETWEEN 0 AND 1),
  night_kwh  REAL,
  remarks    TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX el_readings_at_uq ON el_readings (at) WHERE deleted_at IS NULL;

CREATE TABLE el_bills (
  id                     TEXT PRIMARY KEY,
  bill_date              TEXT NOT NULL,
  due_date               TEXT,
  paid_date              TEXT,
  advance_payment_paise  INTEGER,
  kwh_reading            REAL NOT NULL,
  kvarh_reading          REAL,
  pf                     REAL CHECK (pf BETWEEN 0 AND 1),
  night_units            REAL,
  demand_paise           INTEGER,
  energy_paise           INTEGER,
  fuel_surcharge_paise   INTEGER,
  pf_rebate_paise        INTEGER,
  night_rebate_paise     INTEGER,
  ehv_rebate_paise       INTEGER,
  time_of_use_paise      INTEGER,
  gt_paise               INTEGER,
  total_consumption_paise INTEGER,
  electricity_duty_paise INTEGER,
  meter_charges_paise    INTEGER,
  tcs_paise              INTEGER,
  net_payable_paise      INTEGER,
  total_payable_paise    INTEGER NOT NULL,
  remarks                TEXT,
  invoice_name           TEXT,                           -- the PGVCL invoice PDF; bytes in the blob store
  invoice_mime           TEXT,
  invoice_size_bytes     INTEGER,
  invoice_blob_key       TEXT,
  created_by             TEXT REFERENCES users(id),
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at             TEXT
);
CREATE UNIQUE INDEX el_bills_date_uq ON el_bills (bill_date) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- Reference data: the legacy defaults start each history (api/src/seed/electricity.ts), and the meter setting.
-- ─────────────────────────────────────────────────────────────

INSERT INTO el_rates (id, kind, value, effective_from) VALUES
  ('elr-mf', 'mf', 30, '2025-04-01'),
  ('elr-fixed', 'fixed', 63867500, '2025-04-01'),
  ('elr-energy', 'energy', 420, '2025-04-01'),
  ('elr-fuel', 'fuel', 230, '2025-04-01');

INSERT INTO st_settings (key, value) VALUES
  ('electricity.meter', '{"meterNo":null,"consumerNo":null,"category":null,"sanctionedLoadKva":null,"ctRatio":null,"ptRatio":null,"tariff":null,"billingCycle":"Monthly"}');

-- ─────────────────────────────────────────────────────────────
-- Role permissions: append the Electricity keys (keeps custom changes).
-- Same result as DEFAULT_ROLE_PERMISSIONS in api/src/domain/access.ts (a test checks 0004 + 0005 … 0014).
-- ─────────────────────────────────────────────────────────────

UPDATE st_role_permissions
SET permissions = json_insert(permissions,
      '$.pages[#]', 'electricity_dashboard', '$.pages[#]', 'electricity_readings', '$.pages[#]', 'electricity_reports', '$.pages[#]', 'electricity_bills', '$.pages[#]', 'electricity_settings'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('superadmin', 'admin');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'electricity_dashboard', '$.pages[#]', 'electricity_reports', '$.pages[#]', 'electricity_bills'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('management');

-- 0015_complaints.sql
--
-- Complaints module (legacy "Complaint Registration"): customer complaints numbered per FY, photo evidence, the case
-- timeline (registered, edited, status changes, comments with photos and videos) and the notification recipients;
-- plus the complaints_* keys in the role permission matrix. Behaviour lives in api/src/modules/complaints
-- (docs/complaints-spec.md). Conventions are listed at the top of 0001_users.sql. Nothing here has been run.
--
-- Numbers: CMP/26-27/0001 from st_counters 'CP-<fy>' (the FY of the complaint date). File bytes live in the blob
-- store under complaints/<complaint id>/<file id>; only their metadata is here.

CREATE TABLE cp_recipients (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT,
  email      TEXT,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX cp_recipients_name_uq ON cp_recipients (lower(trim(name))) WHERE deleted_at IS NULL;

CREATE TABLE complaints (
  id                TEXT PRIMARY KEY,
  complaint_no      TEXT NOT NULL,
  date              TEXT NOT NULL,
  salesman          TEXT NOT NULL,
  customer_id       TEXT REFERENCES sl_customers(id),  -- when picked from the Sales party master
  customer_name     TEXT NOT NULL,
  customer_phone    TEXT,
  customer_location TEXT,
  invoice_id        TEXT REFERENCES sl_invoices(id),
  invoice_no        TEXT,
  material          TEXT NOT NULL,
  category          TEXT NOT NULL,
  priority          TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
  description       TEXT NOT NULL,
  recipient_name    TEXT NOT NULL,                     -- snapshot of who was notified
  recipient_email   TEXT,
  status            TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed')),
  resolved_on       TEXT,                              -- business date last marked Resolved / Closed
  created_by        TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at        TEXT
);
CREATE UNIQUE INDEX complaints_no_uq ON complaints (lower(complaint_no)) WHERE deleted_at IS NULL;
CREATE INDEX complaints_date_idx ON complaints (date);
CREATE INDEX complaints_status_idx ON complaints (status) WHERE deleted_at IS NULL;
CREATE INDEX complaints_customer_idx ON complaints (lower(customer_name));

-- The case timeline. Append-only.
CREATE TABLE cp_events (
  id           TEXT PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES complaints(id),
  type         TEXT NOT NULL CHECK (type IN ('created', 'edited', 'status', 'comment')),
  text         TEXT NOT NULL,
  by_user      TEXT REFERENCES users(id),
  by_name      TEXT NOT NULL,
  at           TEXT NOT NULL
);
CREATE INDEX cp_events_complaint_idx ON cp_events (complaint_id, at);

-- Photos on the complaint (event_id NULL, at most 6) and files on comments (event_id set).
CREATE TABLE cp_files (
  id           TEXT PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES complaints(id),
  event_id     TEXT REFERENCES cp_events(id),
  kind         TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  name         TEXT NOT NULL,
  mime         TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  blob_key     TEXT NOT NULL,
  line_no      INTEGER NOT NULL,
  removed_at   TEXT                                   -- a complaint photo taken off (the bytes stay until a retention job)
);
CREATE INDEX cp_files_complaint_idx ON cp_files (complaint_id, event_id, line_no);

-- ─────────────────────────────────────────────────────────────
-- Reference data: the legacy default recipients (api/src/seed/complaints.ts).
-- ─────────────────────────────────────────────────────────────

INSERT INTO cp_recipients (id, name, role, email) VALUES
  ('cpr-jimit', 'Jimit Mehta', 'Plant Manager / Approver', NULL),
  ('cpr-sinha', 'P K Sinha', 'Reviewer', NULL);

-- ─────────────────────────────────────────────────────────────
-- Role permissions: append the Complaints keys (keeps custom changes).
-- Same result as DEFAULT_ROLE_PERMISSIONS in api/src/domain/access.ts (a test checks 0004 + 0005 … 0015).
-- ─────────────────────────────────────────────────────────────

UPDATE st_role_permissions
SET permissions = json_insert(permissions,
      '$.pages[#]', 'complaints_dashboard', '$.pages[#]', 'complaints_register', '$.pages[#]', 'complaints_reports', '$.pages[#]', 'complaints_masters'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('superadmin', 'admin');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'complaints_dashboard', '$.pages[#]', 'complaints_register'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('marketing');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'complaints_dashboard', '$.pages[#]', 'complaints_register', '$.pages[#]', 'complaints_reports'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('management');

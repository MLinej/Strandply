-- 0004_access_control.sql
--
-- ERP-wide server-side sessions, and the SampleTrack role × permission matrix.
-- Behaviour lives in api/src/auth and api/src/modules/sampletrack.
-- Conventions are listed at the top of 0001_users.sql.

-- Sessions: an opaque token sits in an httpOnly cookie, and only its sha256 is stored here.
-- Short-lived rows, hard-deleted on logout, expiry, password change or deactivation.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  token_hash   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at   TEXT NOT NULL,              -- absolute limit; the idle limit is last_seen_at + SESSION_IDLE_HOURS
  ip           TEXT,
  user_agent   TEXT
);
CREATE UNIQUE INDEX sessions_token_hash_uq ON sessions (token_hash);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- One row per role. permissions is JSON: {"pages":[...],"actions":[...],"widgets":[...]}
--   pages:   dashboard requests dispatch tracking parties couriers products reports notifications users settings
--   actions: edit delete approve print export dashboard_full
--   widgets: total pending delivered delayed parties couriers
-- Only a superadmin can edit it. The superadmin row is locked (the API refuses edits and
-- always treats superadmin as having everything). "Reset to defaults" writes the seed below back.
CREATE TABLE st_role_permissions (
  role        TEXT PRIMARY KEY CHECK (role IN ('superadmin', 'admin', 'dispatch', 'marketing', 'management')),
  permissions TEXT NOT NULL CHECK (json_valid(permissions)),
  locked      INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  updated_by  TEXT REFERENCES users(id),
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);

-- Defaults from the legacy ROLE_PERMS. Generated from api/src/domain/access.ts, so keep the two in sync.
INSERT INTO st_role_permissions (role, permissions, locked) VALUES
  ('superadmin', '{"pages":["dashboard","requests","dispatch","tracking","parties","couriers","products","reports","notifications","users","settings"],"actions":["edit","delete","approve","print","export","dashboard_full"],"widgets":["total","pending","delivered","delayed","parties","couriers"]}', 1),
  ('admin', '{"pages":["dashboard","requests","dispatch","tracking","parties","couriers","products","reports","notifications","users","settings"],"actions":["edit","delete","approve","print","export","dashboard_full"],"widgets":["total","pending","delivered","delayed","parties","couriers"]}', 0),
  ('dispatch', '{"pages":["dashboard","dispatch","tracking","couriers","notifications"],"actions":["edit","print"],"widgets":["total","delivered","delayed"]}', 0),
  ('marketing', '{"pages":["dashboard","requests","tracking","parties","products","notifications"],"actions":["edit","print"],"widgets":["pending","parties"]}', 0),
  ('management', '{"pages":["dashboard","reports","notifications"],"actions":["print","export"],"widgets":["total","pending","delivered","delayed","parties","couriers"]}', 0);

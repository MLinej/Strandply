-- 0017_hub.sql
--
-- Reports Hub (legacy "Reports Hub"): read-only views across modules, computed from the other modules' tables, so
-- there are no tables here; only the hub_* keys in the role permission matrix. Behaviour lives in
-- api/src/modules/hub (docs/hub-spec.md). Nothing here has been run.

-- Role permissions: append the Reports Hub keys (keeps custom changes).
-- Same result as DEFAULT_ROLE_PERMISSIONS in api/src/domain/access.ts (a test checks 0004 + 0005 … 0017).

UPDATE st_role_permissions
SET permissions = json_insert(permissions,
      '$.pages[#]', 'hub_dashboard', '$.pages[#]', 'hub_modules', '$.pages[#]', 'hub_periodic', '$.pages[#]', 'hub_sources'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('superadmin', 'admin');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'hub_dashboard', '$.pages[#]', 'hub_modules', '$.pages[#]', 'hub_periodic'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('management');

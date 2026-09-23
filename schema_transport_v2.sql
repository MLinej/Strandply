-- ══════════════════════════════════════════════════════════
--  TRANSPORT MODULE v2 — Add missing columns to existing tables
--  Safe: uses ALTER TABLE ADD COLUMN (no data loss)
--  Run: npx wrangler d1 execute strand-portal-db --remote --file=schema_transport_v2.sql
-- ══════════════════════════════════════════════════════════

-- ── transport_transporters ─────────────────────────────────
ALTER TABLE transport_transporters ADD COLUMN code TEXT DEFAULT '';
ALTER TABLE transport_transporters ADD COLUMN phone2 TEXT DEFAULT '';
ALTER TABLE transport_transporters ADD COLUMN pincode TEXT DEFAULT '';
ALTER TABLE transport_transporters ADD COLUMN tds TEXT DEFAULT 'No';
ALTER TABLE transport_transporters ADD COLUMN credit TEXT DEFAULT 'Against Delivery';
ALTER TABLE transport_transporters ADD COLUMN ifsc TEXT DEFAULT '';
ALTER TABLE transport_transporters ADD COLUMN bank_name TEXT DEFAULT '';
ALTER TABLE transport_transporters ADD COLUMN bank_branch TEXT DEFAULT '';
ALTER TABLE transport_transporters ADD COLUMN acc_name TEXT DEFAULT '';
ALTER TABLE transport_transporters ADD COLUMN acc_no TEXT DEFAULT '';
ALTER TABLE transport_transporters ADD COLUMN visiting_card TEXT DEFAULT '';
ALTER TABLE transport_transporters ADD COLUMN vehicles_json TEXT DEFAULT '[]';
ALTER TABLE transport_transporters ADD COLUMN op_cities_json TEXT DEFAULT '[]';

-- ── transport_vehicles ─────────────────────────────────────
ALTER TABLE transport_vehicles ADD COLUMN name TEXT DEFAULT '';
ALTER TABLE transport_vehicles ADD COLUMN active INTEGER DEFAULT 1;

-- ── transport_inquiries ────────────────────────────────────
ALTER TABLE transport_inquiries ADD COLUMN from_state TEXT DEFAULT '';
ALTER TABLE transport_inquiries ADD COLUMN from_pin TEXT DEFAULT '';
ALTER TABLE transport_inquiries ADD COLUMN to_state TEXT DEFAULT '';
ALTER TABLE transport_inquiries ADD COLUMN to_pin TEXT DEFAULT '';
ALTER TABLE transport_inquiries ADD COLUMN weight TEXT DEFAULT '';
ALTER TABLE transport_inquiries ADD COLUMN dtype TEXT DEFAULT 'Door Delivery';
ALTER TABLE transport_inquiries ADD COLUMN freight_paid_by TEXT DEFAULT 'Strandply';
ALTER TABLE transport_inquiries ADD COLUMN budget REAL DEFAULT 0;
ALTER TABLE transport_inquiries ADD COLUMN rc_id TEXT DEFAULT '';
ALTER TABLE transport_inquiries ADD COLUMN created_by TEXT DEFAULT '';

-- ── transport_rate_comparisons ─────────────────────────────
ALTER TABLE transport_rate_comparisons ADD COLUMN rc_no TEXT DEFAULT '';
ALTER TABLE transport_rate_comparisons ADD COLUMN from_location TEXT DEFAULT '';
ALTER TABLE transport_rate_comparisons ADD COLUMN from_pin TEXT DEFAULT '';
ALTER TABLE transport_rate_comparisons ADD COLUMN to_location TEXT DEFAULT '';
ALTER TABLE transport_rate_comparisons ADD COLUMN to_pin TEXT DEFAULT '';
ALTER TABLE transport_rate_comparisons ADD COLUMN vehicle TEXT DEFAULT '';
ALTER TABLE transport_rate_comparisons ADD COLUMN material TEXT DEFAULT '';
ALTER TABLE transport_rate_comparisons ADD COLUMN weight TEXT DEFAULT '';
ALTER TABLE transport_rate_comparisons ADD COLUMN budget REAL DEFAULT 0;
ALTER TABLE transport_rate_comparisons ADD COLUMN quotes_json TEXT DEFAULT '[]';
ALTER TABLE transport_rate_comparisons ADD COLUMN selected_tid TEXT DEFAULT '';
ALTER TABLE transport_rate_comparisons ADD COLUMN selected_transporter TEXT DEFAULT '';
ALTER TABLE transport_rate_comparisons ADD COLUMN selected_rate REAL DEFAULT 0;
ALTER TABLE transport_rate_comparisons ADD COLUMN selected_transit TEXT DEFAULT '';
ALTER TABLE transport_rate_comparisons ADD COLUMN selected_mg_weight REAL DEFAULT 0;
ALTER TABLE transport_rate_comparisons ADD COLUMN is_lowest INTEGER DEFAULT 0;
ALTER TABLE transport_rate_comparisons ADD COLUMN exceeds_budget INTEGER DEFAULT 0;
ALTER TABLE transport_rate_comparisons ADD COLUMN status TEXT DEFAULT 'pending_approval';
ALTER TABLE transport_rate_comparisons ADD COLUMN created_at TEXT DEFAULT (datetime('now'));

-- ── transport_approvals ────────────────────────────────────
ALTER TABLE transport_approvals ADD COLUMN rc_id TEXT DEFAULT '';
ALTER TABLE transport_approvals ADD COLUMN transporter TEXT DEFAULT '';
ALTER TABLE transport_approvals ADD COLUMN selected_transit TEXT DEFAULT '';
ALTER TABLE transport_approvals ADD COLUMN from_location TEXT DEFAULT '';
ALTER TABLE transport_approvals ADD COLUMN from_pin TEXT DEFAULT '';
ALTER TABLE transport_approvals ADD COLUMN to_location TEXT DEFAULT '';
ALTER TABLE transport_approvals ADD COLUMN to_pin TEXT DEFAULT '';
ALTER TABLE transport_approvals ADD COLUMN vehicle TEXT DEFAULT '';
ALTER TABLE transport_approvals ADD COLUMN material TEXT DEFAULT '';
ALTER TABLE transport_approvals ADD COLUMN weight TEXT DEFAULT '';
ALTER TABLE transport_approvals ADD COLUMN pickup_date TEXT DEFAULT '';
ALTER TABLE transport_approvals ADD COLUMN dtype TEXT DEFAULT '';
ALTER TABLE transport_approvals ADD COLUMN budget REAL DEFAULT 0;
ALTER TABLE transport_approvals ADD COLUMN is_lowest INTEGER DEFAULT 0;
ALTER TABLE transport_approvals ADD COLUMN exceeds_budget INTEGER DEFAULT 0;
ALTER TABLE transport_approvals ADD COLUMN justification TEXT DEFAULT '';
ALTER TABLE transport_approvals ADD COLUMN next_approver TEXT DEFAULT '';
ALTER TABLE transport_approvals ADD COLUMN history_json TEXT DEFAULT '[]';

-- ── transport_orders ───────────────────────────────────────
ALTER TABLE transport_orders ADD COLUMN ap_id TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN rc_id TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN inq_id TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN transporter_name TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN tp_phone TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN tp_contact TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN tp_gst TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN tp_address TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN tp_city TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN tp_state TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN tp_credit TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN from_location TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN from_pin TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN to_location TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN to_pin TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN vehicle TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN material TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN weight TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN dtype TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN rate REAL DEFAULT 0;
ALTER TABLE transport_orders ADD COLUMN transit TEXT DEFAULT '';
ALTER TABLE transport_orders ADD COLUMN pickup_date TEXT DEFAULT '';

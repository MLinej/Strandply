-- Transport v2 FULL — all missing columns across all 6 tables
-- Verified against live PRAGMA table_info on 2026-09-20

-- ── transport_transporters (has: id,name,contact_person,phone,email,gst_no,pan_no,address,city,state,rating,status,created_at,updated_at,code)
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

-- ── transport_vehicles (has: id,vehicle_type,capacity_mt,description,is_active)
ALTER TABLE transport_vehicles ADD COLUMN name TEXT DEFAULT '';
ALTER TABLE transport_vehicles ADD COLUMN active INTEGER DEFAULT 1;

-- ── transport_inquiries (has: id,inquiry_no,inquiry_date,from_location,to_location,material,quantity,unit,vehicle_type,expected_date,status,remarks,created_by,created_at,updated_at)
ALTER TABLE transport_inquiries ADD COLUMN from_state TEXT DEFAULT '';
ALTER TABLE transport_inquiries ADD COLUMN from_pin TEXT DEFAULT '';
ALTER TABLE transport_inquiries ADD COLUMN to_state TEXT DEFAULT '';
ALTER TABLE transport_inquiries ADD COLUMN to_pin TEXT DEFAULT '';
ALTER TABLE transport_inquiries ADD COLUMN weight TEXT DEFAULT '';
ALTER TABLE transport_inquiries ADD COLUMN dtype TEXT DEFAULT 'Door Delivery';
ALTER TABLE transport_inquiries ADD COLUMN freight_paid_by TEXT DEFAULT 'Strandply';
ALTER TABLE transport_inquiries ADD COLUMN budget REAL DEFAULT 0;
ALTER TABLE transport_inquiries ADD COLUMN rc_id TEXT DEFAULT '';

-- ── transport_rate_comparisons (has: id,inquiry_id,transporter_id,rate_per_mt,total_amount,validity_days,remarks,is_selected,quoted_at + new from v2b)
-- v2b already added: rc_no,from_location,from_pin,to_location,to_pin,vehicle,material,weight,budget,quotes_json,selected_tid,selected_transporter,selected_rate,selected_transit,selected_mg_weight,is_lowest,exceeds_budget,status,created_at

-- ── transport_approvals (has: id,inquiry_id,selected_comparison_id,approved_rate,approved_by,approval_status,approval_date,remarks,created_at + new from v2b)
-- v2b already added: rc_id,transporter,selected_transit,from_location,from_pin,to_location,to_pin,vehicle,material,weight,pickup_date,dtype,budget,is_lowest,exceeds_budget,justification,next_approver,history_json

-- ── transport_orders (has original + all from v2b)
-- v2b already added: ap_id,rc_id,inq_id,transporter_name,tp_phone,tp_contact,tp_gst,tp_address,tp_city,tp_state,tp_credit,from_location,from_pin,to_location,to_pin,vehicle,material,weight,dtype,rate,transit,pickup_date

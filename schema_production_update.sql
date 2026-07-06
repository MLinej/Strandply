/* ══════════════════════════════════════════════════════════
   INCREMENTAL MIGRATION — Production Module Schema Update
   Aligns DB columns with production/index.html frontend fields
   Run: npx wrangler d1 execute strand-portal-db --remote --file=schema_production_update.sql
   ══════════════════════════════════════════════════════════ */

-- ══ production_chipping_reports — add columns for frontend fields ══
ALTER TABLE production_chipping_reports ADD COLUMN lots_json TEXT DEFAULT '[]';
ALTER TABLE production_chipping_reports ADD COLUMN total_kg REAL DEFAULT 0;
ALTER TABLE production_chipping_reports ADD COLUMN total_amt REAL DEFAULT 0;
ALTER TABLE production_chipping_reports ADD COLUMN avg_rate REAL DEFAULT 0;
ALTER TABLE production_chipping_reports ADD COLUMN wip_batch_id TEXT DEFAULT '';
ALTER TABLE production_chipping_reports ADD COLUMN wf_state TEXT DEFAULT 'draft';
ALTER TABLE production_chipping_reports ADD COLUMN status TEXT DEFAULT 'saved';

-- ══ production_hotpress_reports — add columns for frontend fields ══
ALTER TABLE production_hotpress_reports ADD COLUMN product TEXT DEFAULT '';
ALTER TABLE production_hotpress_reports ADD COLUMN size TEXT DEFAULT '8x4';
ALTER TABLE production_hotpress_reports ADD COLUMN charges_json TEXT DEFAULT '[]';
ALTER TABLE production_hotpress_reports ADD COLUMN total_time_mins INTEGER DEFAULT 0;
ALTER TABLE production_hotpress_reports ADD COLUMN spare_time_mins INTEGER DEFAULT 0;
ALTER TABLE production_hotpress_reports ADD COLUMN avg_press_mins INTEGER DEFAULT 0;
ALTER TABLE production_hotpress_reports ADD COLUMN wf_state TEXT DEFAULT 'draft';
ALTER TABLE production_hotpress_reports ADD COLUMN status TEXT DEFAULT 'saved';

-- ══ production_wip_batches — add missing columns ══
ALTER TABLE production_wip_batches ADD COLUMN shift TEXT DEFAULT 'Day';
ALTER TABLE production_wip_batches ADD COLUMN status TEXT DEFAULT 'available';

-- ══ production_bc_reports — add missing column ══
ALTER TABLE production_bc_reports ADD COLUMN status TEXT DEFAULT 'saved';

-- ══ production_mdo_reports — add missing column ══
ALTER TABLE production_mdo_reports ADD COLUMN status TEXT DEFAULT 'saved';

-- ══ production_pp_reports — add plan operator column alias ══
-- (plan_operator already exists, ensuring full_data is used for round-trip)

-- ══ production_resin_entries — add missing columns (already have linked_ps, linked_pp, status) ══
-- Columns linked_ps, linked_pp, status already exist in schema.sql

-- ══ Update admin user to see all production sub-modules ══
-- (This is handled via the portal, no change needed here)

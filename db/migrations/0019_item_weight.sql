-- 0019_item_weight.sql
--
-- Weight per board moves onto the sales item master and the separate weight chart page goes away. Nothing here
-- has been run. The memory backend applies the same change through the '0019_item_weight' upgrade in
-- api/src/seed/upgrades.ts.

ALTER TABLE sl_items ADD COLUMN weight_kg REAL NOT NULL DEFAULT 0 CHECK (weight_kg >= 0); -- kg per board, 0 = not set

-- Each item takes its latest weight-chart weight. sl_weight_chart is kept (read-only history) and no longer written.
UPDATE sl_items SET weight_kg = COALESCE((
  SELECT w.weight_kg FROM sl_weight_chart w
  WHERE w.item_id = sl_items.id AND w.deleted_at IS NULL
  ORDER BY w.effective_date DESC, w.created_at DESC LIMIT 1
), 0);

/* ══════════════════════════════════════════════════════════
   MIGRATION — Add sales_erp module to admin user
   Run against existing D1 database:
     npx wrangler d1 execute strand-portal-db --remote --file=schema_sales_update.sql
══════════════════════════════════════════════════════════ */

-- Add sales_erp to admin user's modules and sub_rights in D1
-- The INSERT OR IGNORE seed in schema.sql now includes sales_erp,
-- but existing databases need this UPDATE.

UPDATE users
SET modules = '["dispatch","vendor","reports","hr","production","transport","erp","sales_erp","accounts","stock","maintenance","electricity","dwpas"]',
    sub_rights = '{"dispatch":["req","disp","track","party","courier","product","report","settings"],"vendor":["vend_list","vend_po","vend_inv","vend_pay"],"reports":["rpt_dash","rpt_disp","rpt_sales","rpt_exp"],"hr":["hr_emp","hr_att","hr_leave","hr_sal"],"production":["pr_batch","pr_qual","pr_mat","pr_weight"],"transport":["tr_inq","tr_rate","tr_appr","tr_order","tr_track"],"erp":["erp_entry","erp_po","erp_truck","erp_dncn","erp_inv","erp_report"],"sales_erp":["se_dash","se_cust","se_so","se_inv","se_items","se_ledger"],"accounts":["ac_inv","ac_recv","ac_pay","ac_gst"],"stock":["stk_slip","stk_ledger","stk_stock","stk_reclass","stk_master"],"maintenance":["mt_wo","mt_board","mt_area","mt_timeline","mt_export"],"electricity":["el_dash","el_punch","el_12hr","el_24hr","el_monthly","el_bills"],"dwpas":["dw_dash","dw_plan","dw_register","dw_achieve","dw_variance","dw_hr","dw_dept","dw_emp"]}'
WHERE username = 'admin';

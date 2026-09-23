/* ══════════════════════════════════════════════════════════
   MIGRATION — Add stores, complaint, reports_hub to admin user
   Run: npx wrangler d1 execute strand-portal-db --remote --file=schema_modules3_update.sql
══════════════════════════════════════════════════════════ */

UPDATE users
SET modules = '["dispatch","vendor","reports","hr","production","transport","erp","sales_erp","accounts","stock","maintenance","electricity","dwpas","stores","complaint","reports_hub"]',
    sub_rights = '{"dispatch":["req","disp","track","party","courier","product","report","settings"],"vendor":["vend_list","vend_po","vend_inv","vend_pay"],"reports":["rpt_dash","rpt_disp","rpt_sales","rpt_exp"],"hr":["hr_emp","hr_att","hr_leave","hr_sal"],"production":["pr_batch","pr_qual","pr_mat","pr_weight"],"transport":["tr_inq","tr_rate","tr_appr","tr_order","tr_track"],"erp":["erp_entry","erp_po","erp_truck","erp_dncn","erp_inv","erp_report"],"sales_erp":["se_dash","se_cust","se_so","se_inv","se_items","se_ledger"],"accounts":["ac_inv","ac_recv","ac_pay","ac_gst"],"stock":["stk_slip","stk_ledger","stk_stock","stk_reclass","stk_master"],"maintenance":["mt_wo","mt_board","mt_area","mt_timeline","mt_export"],"electricity":["el_dash","el_punch","el_12hr","el_24hr","el_monthly","el_bills"],"dwpas":["dw_dash","dw_plan","dw_register","dw_achieve","dw_variance","dw_hr","dw_dept","dw_emp"],"stores":["st_dash","st_mrn_new","st_mrn_reg","st_grn_new","st_grn_reg","st_acct","st_rpt","st_cfg"],"complaint":["cm_dash","cm_new","cm_reg","cm_rpt","cm_setup"],"reports_hub":["rh_dash","rh_purchase","rh_production","rh_stock","rh_electricity","rh_sales","rh_maintenance","rh_analytics","rh_daily","rh_monthly","rh_fy","rh_sources"]}'
WHERE username = 'admin';

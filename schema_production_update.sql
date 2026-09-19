/* ══════════════════════════════════════════════════════════
   INCREMENTAL MIGRATION — Production MIS Sub-rights Alignment
   Run against existing D1 database:
     npx wrangler d1 execute strand-portal-db --remote --file=schema_production_update.sql
══════════════════════════════════════════════════════════ */

-- UPDATE ADMIN USER MODULES & SUB-RIGHTS TO ALIGN PRODUCTION SUB-MODULES WITH THE HTML
UPDATE users SET
  sub_rights = '{"dispatch":["req","disp","track","party","courier","product","report","settings"],"vendor":["vend_list","vend_po","vend_inv","vend_pay"],"reports":["rpt_dash","rpt_disp","rpt_sales","rpt_exp"],"hr":["hr_emp","hr_att","hr_leave","hr_sal"],"production":["pr_chip","pr_hp","pr_weight","pr_resin","pr_bc","pr_plan","pr_sum","pr_mdo","pr_rep"],"transport":["tr_inq","tr_rate","tr_appr","tr_order","tr_track"],"erp":["erp_entry","erp_po","erp_truck","erp_dncn","erp_inv","erp_report"],"accounts":["ac_inv","ac_recv","ac_pay","ac_gst"],"stock":["stk_slip","stk_ledger","stk_stock","stk_reclass","stk_master"],"maintenance":["mt_wo","mt_board","mt_area","mt_timeline","mt_export"],"electricity":["el_punch","el_reports","el_monthly","el_bills","el_config"]}'
WHERE username = 'admin';

# Module roadmap: legacy → new ERP

The legacy app is 14 single-file modules in `legacy/<name>/index.html`. Each is rebuilt one at a time with the same process as SampleTrack:

1. Spec: list every function in the legacy file in `docs/<module>-spec.md`.
2. Migrations, repos (memory now, `TODO(d1)`), services and routes, with permission-matrix and behaviour tests.
3. Web pages on the design system, plus the module's Home contributions (KPIs, "Pending my action", At a glance).

## Order and why

| # | Module (legacy folder) | Legacy size | Why here |
|---|---|---|---|
| 0 | **Sign-in, session, Home** | — | Everything else needs a real session (`/api/me`) and a home to land on. |
| 1 | **SampleTrack Pro** (`sampletrack`) → Samples | 3,887 lines · 157 fns | The API is already built and tested; only the screens are missing. It proves the whole stack end to end (auth, permissions, prints, reports). |
| 2 | **Vendor Portal** (`vendor`) → Vendors | 1,831 · 115 | Vendors, categories, products and T&C are the masters that Purchase needs. |
| 3 | **Purchase ERP** (`erp`) → Purchase | 5,727 · 214 | POs come before receiving. MRN/GRN are referenced 250+ times. |
| 4 | **Stores – MRN & GRN** (`stores`) → Stores | 2,008 · 103 | Receives against Purchase POs and feeds item stock. |
| 5 | **Stock Management** (`stock`) → Stock (SKU) | 2,436 · 66 | Slips, opening, reclass and balances, all built on store and production movements. |
| 6 | **Production MIS** (`production`, + `weight-system.html`) → Production | 7,167 · 278 | The largest module. Consumes stores items and produces finished stock. |
| 7 | **Sales ERP** (`sales`) → Sales | 6,927 · 198 | Invoices and orders sell finished stock. Includes the e-mail relay and PI. |
| 8 | **Marketing & Sales CRM** (`crm`) → Sales / CRM | 2,218 · 94 | Leads and pipeline feed sales orders. |
| 9 | **Transport** (`transport`) → Transport | 1,153 · 59 | Trips carry sales invoices. |
| 10 | **Complaint Registration** (`complaint`) → Complaints | 1,683 · 79 | Complaints reference sales invoices and parties. |
| 11 | **Electricity & Meter MIS** (`electricity`) → Electricity | 1,953 · 92 | Mostly standalone. Power cost feeds cost-per-board. |
| 12 | **Maintenance Tracker** (`maintenance`) → Maintenance | 985 · 33 | Small and standalone (areas, work orders, timeline). |
| 13 | **DWPAS** (`dwpas`) → DWPAS | 2,088 · 65 | Daily work plans per department and employee. |
| 14 | **Reports Hub** (`reports`) → Reports | 2,239 · 68 | Aggregates every other module, so it goes last. |

## Status

- [x] 0 Sign-in (`/sign-in`), real session from `/api/me` with guard and 401 handling, Home with live module contributions, live notification bell and sidebar badges
- [x] 1 SampleTrack: all screens built and browser-tested for every role. Samples: dashboard (role-aware tiles, six-month trend chart with table view, status bars, recent dispatches, pending requests), sample requests, sample dispatch, live tracking (timeline, label print, QR, WhatsApp share), parties, couriers, products (Excel import with dry-run preview, export), and reports (7 server-side reports, CSV/Excel/print). Admin: users (stats, filters, add/edit/deactivate/delete), roles & permissions matrix (Super Admin only edits; Super Admin column locked; reset to defaults), activity log (filters, purge for Super Admin), company settings, and city master (add/remove custom cities, export).
- [x] 2 Vendors: API (`/api/vendors`, migration 0005, docs/vendors-spec.md) and all screens, browser-tested. Vendors list with status tabs, add/edit with pincode lookup and product picker, detail tabs (overview, products, finance, history), approve / activate / blacklist / reinstate (new `vendor_approve` action), compare 2–4, find by product, reports with CSV/Excel, print card and list, product master, categories, city & pincodes (shared city master), T&C master, vendor settings with import preview and exports. Pending-vendors sidebar badge.
- [x] 3 Purchase: API (`/api/purchase`, migration 0006, docs/purchase-spec.md) and all screens, browser-tested. Register per material (invoice vs SPL weight, GST, auto DN/CN, payable), entry form with PO and vendor pick-up and live breakup, drafts, approval (`purchase_approve`), A5 receiving slip and A4 Nilgiri lot label, truck register, POs with received/balance and T&C print, returns, DN/CN register with statuses, raw material stock ledger per FY (opening stock with approval lock, carry forward, consumption, FIFO ageing), dashboard, 6 report tabs with Excel, documents with real uploads, audit trail, species/veneer type masters.
- [x] 4 Stores: API (`/api/stores`, migration 0007, docs/stores-spec.md) and all screens, browser-tested. Gate entry (MRN) with vendor-directory picker, several materials per vehicle, A5 slip on save, register with material/status/date filters and Excel; GRN from a pending MRN ("Make GRN"), actual quantity and quality per line, unlisted items, invoice linked to the Purchase entry; Draft → Reviewed → Approved (`stores_review`, `stores_approve`); accounting with voucher and undo (`stores_account`); dashboard, MRN-pending-GRN and accounting-status reports with Excel, auto-punch settings, audit trail, pending-GRN sidebar badge.
- [x] 5 Stock: API (`/api/stock`, migration 0008, docs/stock-spec.md) and all screens, browser-tested. Item master (103 SKU groups from SKU Master v8, now saved), opening stock, SIS / SRS slips with item + thickness pickers, live balances and Miracle entry preview, A5 slip print and WhatsApp, reversal; reclassification (STR) with scenarios; live stock (SKU / department views); SKU ledger with running balance and brought-forward, department ledger, daily movement, all with Excel, print and WhatsApp; dashboard with real stage-wise stock; audit trail.
- [x] 6 Production: API (`/api/production`, migration 0009, docs/production-spec.md) and all screens, browser-tested. Production planning (products, department parameters, raw-material check, plan vs actual), hot press (charges and press / total / spare time), matt weight (batches, numpad and keyboard punching, grading, distribution and trend, corrections), chipping from Purchase Nilgiri lots at net rate → WIP Nilgiri batches with ledger and adjustments, resin consumption from Purchase resin lots, board cutting with rejects, production summary linking everything with wet-wood costing, MDO press; review → approval on every document (`production_review`, `production_approve`), FY close / reopen, thickness / size masters, dashboard, reports with Excel, prints, audit trail.
- [x] 7 Sales: API (`/api/sales`, migration 0010, docs/sales-spec.md) and all screens, browser-tested. LLP / OSB firms with per-firm numbering and GST state; party master (GSTIN tax auto-detect per firm, ledger, credit), item master, effective-dated price list and weight chart; proforma invoices → confirm into sales orders; sales orders with price / weight lookup, invoiced and balance per line, status, dispatch details; sales invoices against order lines with CGST / SGST / IGST, IRN, e-way bill and approval (`sales_approve`); dispatch register, FG inventory with reserved stock, LLP → OSB inter-company register with reconciliation; dashboard, 14 reports (pending-order pivot on balances) with Excel and print; A4 prints, email drafts from templates, settings, audit trail.
- [ ] 8–14 not started

## Where legacy data lived (for the import at DB-connect time)

- `/api/<module>/…` (old server): crm, dwpas, electricity, erp (`/api/purchase/state`), maintenance, production, sampletrack (`/api/dispatch/state`), stock, stores, transport.
- Own API base: vendor (`API + '/vendors' | '/products' | '/categories' | '/cities' | '/tnc'`).
- Browser storage only: complaint, reports, sales (`spl_pi`, plus an e-mail relay Worker).

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
- [ ] 2–14 not started

## Where legacy data lived (for the import at DB-connect time)

- `/api/<module>/…` (old server): crm, dwpas, electricity, erp (`/api/purchase/state`), maintenance, production, sampletrack (`/api/dispatch/state`), stock, stores, transport.
- Own API base: vendor (`API + '/vendors' | '/products' | '/categories' | '/cities' | '/tnc'`).
- Browser storage only: complaint, reports, sales (`spl_pi`, plus an e-mail relay Worker).

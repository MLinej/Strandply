# Vendors module: functional spec

Rebuild of the legacy **Vendor Portal** (`legacy/vendor/index.html`, 1,831 lines, 115 functions). Server code is in `api/src/modules/vendors`, screens are in `web/src/modules/vendors`, and the schema is in `db/migrations/0005_vendors.sql`.

## 1. What carried over

| Legacy | New |
|---|---|
| All Vendors / Pending Review / Approved / Active / Blacklisted sections (`renderTable`, `renderPending`, …) | **Vendors** page: one list with status tabs and counts, search, category/state filters, and sort (name, recent, top rated). |
| Sidebar "By Category" shortcuts (`filterByCat`) | Category filter on Vendors; the Categories page links to the filtered list. |
| Add/Edit vendor modal (`buildVModal`, `saveV`), "Save Inactive" / "Submit for Review" | Vendor form with the same sections and buttons. The code is suggested by the server (`SPL-VEN-YY-NNN`) unless one is typed in. |
| Pincode → city/state auto-fill (`onPin`), city autocomplete (`onCity`) | Pincode lookup against the shared city master (§4), plus a city list. |
| Product multi-select (`filterProds`, `togProd`) | Searchable product checklist, filtered to the chosen categories by default. |
| Detail modal with Overview / Products / Finance / History tabs (`openDet`, `detContent`) | Same four tabs, with workflow buttons in the footer. |
| `approveV`, `activateV`, `openBL` / `confBL`, `reinstateV` (Director only) | Workflow steps (§3), gated by the `vendor_approve` action. |
| Compare (`togCmp`, `runCmp`, max 4) | Tick 2–4 vendors → **Compare vendors** page (`?ids=` so it can be shared), plus a vendor picker on that page. |
| Find by Product (`renderProc`) | **Find by product**: approved and active vendors per product, sorted by rating or lead time. |
| Reports (`renderReports`, `exportCSV`) | **Vendor reports**: overview, top-6 by category / state / payment terms, every vendor; CSV and Excel. |
| Product Master (`openAddP`, `saveP`, `delP`) | **Product master**: code `SPL-P-YY-NNN`, units, conversion, HSN, GST, MOQ, lead time. |
| Categories with icon, colour, sort order, status (`buildCModal`, `saveC`, `delC`) | **Categories** with the same icon and colour pickers, live preview, and the products-per-category table. |
| City / State master with pincodes (`renderCities`, `saveCIT`) | **City & pincodes**: the SampleTrack city master gained pincodes, so there is one city list for the whole ERP. |
| T&C Master (`renderTnc`, `saveTnc`) | **T&C master**, unchanged fields: title, category, version, text, summary, status, applies to. |
| Vendor PDF (`downloadVendorPDF`) | Print card (one vendor) and Print list (the filtered directory), A4, with the company header from Company settings. |
| Settings & System: e-mail settings, import/export | **Vendor settings**: e-mail sender, import (vendors, products, categories, cities) with a preview, and exports. |

Left out on purpose:
- **"Clear all local data"** only reset the browser's copy, so it has no meaning with a server.
- **Full JSON backup/restore**: the per-kind imports and exports cover it, and backups belong to the infrastructure backup service.
- **EmailJS keys and "Send test"**: the legacy test was a placeholder. Sending is connected with the e-mail relay (docs/DB-CONNECT-LATER.md).
- **Company details for PDFs** were duplicated in the portal; prints now use Company settings.

Added:
- Duplicate-name warning on vendors (save anyway is allowed).
- Delete for vendors (the legacy portal had none).
- Categories and products can't be deleted while in use; the legacy portal deleted them and left vendors pointing at nothing.
- Activity log entries for every change, export, print and import.
- A pending-vendors badge in the sidebar.

## 2. Access

| Key | Kind | Grants |
|---|---|---|
| `vendors` | page | Vendors list, detail, compare, find by product. |
| `vendor_reports` | page | Vendor reports. |
| `vendor_masters` | page | Product master, categories, city & pincodes, T&C. |
| `vendor_settings` | page | Vendor settings, import. |
| `vendor_approve` | action | Approve, activate, blacklist, reinstate (the legacy "Director" check). |

Shared actions apply as elsewhere: `edit` (add/edit, submit), `delete`, `print`, `export`.

Defaults:
- **Super Admin and Admin:** everything.
- **Management:** `vendors` and `vendor_reports`, read-only (they have print and export but no edit).
- **Dispatch and Marketing:** nothing.

## 3. Vendor status flow

```
            submit                approve          activate
inactive ──────────► pending ───────────► approved ─────────► active
    │                   │                     ▲  │               │
    └──────── blacklist (reason required) ────┼──┴───────────────┘
                        ▼                     │ reinstate
                   blacklisted ───────────────┘
```

- A new vendor is `pending` ("Submit for review") or `inactive` ("Save inactive").
- Editing never changes the status.
- Each step records who and when (`approved_by/at`, `activated_by/at`, `blacklisted_by/at` and the reason). Reinstating clears the blacklist fields.

## 4. Cities and pincodes

- Pincodes live on `st_city_master` (a JSON array). A pincode belongs to one live city.
- Built-in cities can't be renamed or removed, but their pincodes can be edited.
- The seed carries the legacy portal's 20 cities' pincodes and adds Valsad.
- `GET /api/sampletrack/cities/pincode/:pincode` serves the vendor form.

## 5. Import

- File types: .xlsx, .xls or .csv, with loose header matching (e.g. "GSTIN" or "GST").
- Several categories or products in one cell: separate them with `|`.
- Rows whose name already exists are **skipped, never overwritten** (legacy behaviour). A name repeated within the file is added once.
- A preview writes nothing. The commit re-checks the file and adds every valid row in one unit of work.
- Legacy colour classes `c1`…`c12` are mapped to the new colour names.

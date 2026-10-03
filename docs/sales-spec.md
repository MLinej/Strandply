# Sales module: functional spec

Rebuild of the legacy **Sales ERP** (`legacy/sales/index.html`, 6,927 lines). Server code is in `api/src/modules/sales`, screens are in `web/src/modules/sales`, the schema is in `db/migrations/0010_sales.sql`, and the shared calculations are in `api/src/contracts/sales.ts`.

## 1. Records

| Record | Number | What it records |
|---|---|---|
| Party | — | Party master, shared by both firms. Holds name, code, type (Dealer / OEM / Distributor / Internal Company), GSTIN, PAN and account group. Also address, contact, credit days and limit, transport preference, payment terms, a tax type per firm, and active. |
| Item | — | Board catalogue: name, brand, grade, sub type, thickness, width, length, sq m per board, default rate per sq m, HSN, active. |
| Price list entry | — | An item's rate per sq m from an effective date. |
| Weight chart entry | — | An item's weight per board (kg) from an effective date. |
| Proforma invoice | PI/001/26-27 | Quote to a party. Holds bill-to and ship-to, validity date, PO reference, terms, lines, freight and GST %. Status is Draft, Sent to party, Confirmed or Cancelled. |
| Sales order | SO/12/26-27 | The order. Holds bill-to and ship-to, the customer's PO number and date, expected dispatch date, sales person, terms, lines, freight and GST %. It also holds the status and the dispatch details (date, vehicle, transporter and their GSTIN, LR, driver and mobile). |
| Sales invoice | SPL/07/26-27 (LLP), OSB/07/26-27 (OSB) | Tax invoice against an order's lines. Holds the dispatched pcs, sq m and rate per line, tax type, freight, GST %, IRN, e-way bill and weight. Approval is Pending, Approved or Rejected. |
| FG stock entry | — | Finished-goods sq m on hand and reorder level, per firm and specification (grade, thickness, width, length). |
| Inter-company transfer | billing doc = the LLP invoice no. | An LLP → OSB billing document as recorded in OSB's purchase register: material, quantity, rate, taxes, freight, total and vehicle. |

**Firms.** Proformas, orders, invoices and FG stock belong to Strandply LLP or Strandply OSB. Lists follow the firm switcher in the app shell, and a new document takes the shell's firm (LLP when it shows both). Parties, items, price list and weight chart are shared. Numbers run per firm and FY. OSB orders and proformas are prefixed `OSB-` so they never clash with LLP's.

### Calculations

- **Line amount** = sq m × rate per sq m. Rate per sq ft is shown for reference only: rate per sq m × 2.9768 ÷ 32.
- **Sq m** = pcs × the item's sq m factor. The factor defaults to width × length and is editable on the item and on the line.
- **Totals**: items + freight = taxable. GST on the taxable amount is CGST + SGST at half the rate each for SG+CG, or IGST at the full rate. Grand total = taxable + GST. Orders and proformas show the same split. The stored `totalPaise` is always this total.
- **Tax type**:
  - From the bill-to party's GSTIN state code against the firm's state: LLP Gujarat 24, OSB Maharashtra 27 (a setting). Same state gives SG+CG; otherwise IGST.
  - A party with no GSTIN uses the type set on the party for that firm.
  - An invoice can override it.
- **Rates and weights on a line**:
  - Picking an item fills the rate from the latest price-list entry on or before the document date. Without one, the item's default rate is used.
  - The weight comes from the weight chart the same way.
  - Changing the document date re-prices the lines.
- **Order progress**: per line, what invoices have taken (pcs, sq m) and the balance. Balance amount = balance sq m × rate.
- **Weight**: total weight = pcs × weight per board. Invoice tons default to thickness × width × length × pcs × 0.65 t/m³ unless a weight is entered.
- **FG reserved** = sq m on pending orders (not completed or cancelled) of the same firm and specification. Available = on hand − reserved. Low stock is when available is below the reorder level.
- **Inter-company**: material value = qty × rate. Total = material + CGST + SGST + IGST + freight. "Matched" means an LLP invoice with the billing-doc number exists.

### Rules

- **Proformas**:
  - Confirming one creates a Confirmed sales order. The order gets the same parties, terms, lines, freight and GST and is dated today; the PI date becomes its PO date and the PI reference its PO number.
  - A confirmed proforma is locked: no edit, no delete, no second confirm.
  - A cancelled one is locked until it is reopened as draft.
  - Deleting the order made from a proforma puts the proforma back to "Sent to party".
- **Orders**:
  - Once an order has invoices, its parties and lines are fixed. Dates, terms, freight, status and remarks can still change.
  - An order with invoices can't be deleted; cancel it instead.
  - Cancelled orders can't be invoiced or dispatched.
  - Status is set by hand, as in legacy: Draft, Confirmed, Production planned, Ready for dispatch, Partially dispatched, Completed, Cancelled.
- **Invoices**:
  - Every invoice is raised against an order. Its item details and order quantities come from the order.
  - Lines entered at 0 are skipped, and an order line can't appear twice.
  - Dispatching more than the balance is allowed, as in legacy (the dev data has "Excess" orders). The form flags it.
  - Approval works like this: Pending → Approved or Rejected (a reason is required). Editing a rejected invoice sends it back to Pending. Approved invoices are locked, and can be reopened to Pending by someone with `sales_approve`. Approved invoices can't be deleted.
- **Masters**:
  - A party or item on any document can't be deleted; mark it inactive. Inactive ones can't be picked on new documents.
  - Deleting an item removes its price-list and weight-chart rows.
  - Price list and weight chart allow one entry per item and date.
  - FG stock allows one entry per firm and specification.
  - An inter-company billing doc is unique.

## 2. Access

| Key | Kind | Grants |
|---|---|---|
| `sales_dashboard` | page | Dashboard and audit trail |
| `sales_masters` | page | Party master, item master, price list, weight chart |
| `sales_proforma` | page | Proforma invoices (incl. confirm → order) |
| `sales_orders` | page | Sales orders (incl. dispatch details) |
| `sales_invoices` | page | Sales invoices, inter-company |
| `sales_dispatch` | page | Dispatch register, FG inventory |
| `sales_reports` | page | Reports hub (reads every register) |
| `sales_settings` | page | Sales settings |
| `sales_approve` | action | Approve, reject or reopen invoices |

Legacy had a role dropdown with no real checks; invoice approval was a free select. Defaults:
- **Super Admin and Admin:** everything.
- **Management:** dashboard and reports (with print and export).
- **Dispatch and Marketing:** nothing.

## 3. What carried over, and what changed

| Legacy | New |
|---|---|
| Dashboard: sales value, basic, tons and pcs dispatched, pending orders, outstanding, top customer and product, dispatch pending, product-group table, top 8 customers, monthly trend, date range | Same, per firm, plus invoices awaiting approval and sales by state. |
| Party master: search, state / city / group filters, add / edit with GSTIN tax auto-detect, ledger (by ship-to), party reports (sales and credit utilisation), Excel | Same. Tax types are kept per firm, and the type filter replaces the group filter (every legacy party is SUNDRY DEBTORS). Credit utilisation is a report. |
| Item master with brand master, sq m factor auto from W × L | Same. Brands and grades are lists in Sales settings. |
| Price list and weight chart, effective-dated | Same. Rows show whether they are current, upcoming or superseded. |
| Proforma invoice: same form as SO, statuses, confirm → SO and lock, PDF, email, Excel | Same. |
| Sales orders: KPIs, filters (status, bill-to, ship-to, state, city), sort, multi-line form with price / weight lookup, PDF, email, Excel (line level), order ageing report, → invoice | Same. The detail also shows invoiced and balance per line, the invoices and dispatch. |
| Sales invoices: pick SO → its lines with SO qty and editable dispatched qty, CGST / SGST / IGST, IRN, e-way bill, weight, approval, quick approve, monthly report, PDF, email, Excel | Same, with the balance shown per line and approval through `sales_approve`. |
| Dispatch register: orders with a vehicle or dispatch date, KPIs, vehicle and transporter reports, Excel | Same. Dispatch details are recorded on the order. |
| FG inventory: stock by spec, reserved from pending orders, low stock, add entry | Same, per firm, with edit and delete. |
| Inter-company view: LLP → OSB transfers, reconciliation with LLP invoices, Excel | Same. Entries can be added, edited and deleted (legacy only showed imported rows). |
| Reports hub (12 reports) with date range; pending-order pivot with Excel and PDF | The same 12 plus order ageing and credit utilisation. Every report has Excel and print. The pending-order report works on balances. |
| Settings: payment / delivery terms, sales persons, brands, email recipients and templates | Same, plus grades and each firm's GST state code. |
| "Send Email": template + recipients, mailto or copy | Same (mailto, copy, print the PDF to attach). |

Legacy bugs fixed:
- **Seeded orders lost their vehicle, transporter, LR and driver**, so the dispatch register was nearly empty. The conversion keeps them.
- **An invoice copied the whole order's freight**, so every partial invoice charged it again. Freight defaults to the order's only on its first invoice.
- **The pending-order report showed the full order quantity as "balance".** It now subtracts what has been invoiced.
- **Invoices ignored the order's GST %** (always 9 + 9 or 18). They now use the invoice's GST %, which defaults to the order's.
- **The tax type was looked up by the party's name** and defaulted to SG+CG for any name not in the master. Parties are now picked from the master and the type comes from their GSTIN for the document's firm.
- **Order numbers came from the highest number in any FY, with "26-27" hard-coded.** Numbers now run per firm and FY.
- **Two copies of the proforma and party-master code** (the later one won). There is now one of each.

Removed:
- **The role dropdown and the font switcher.**
- **The e-mail relay Worker settings** (URL, key, connected flag). Sending through a relay is a later integration (DB-CONNECT-LATER.md, infrastructure). Email opens the person's mail app, as legacy did without a relay.
- **The OSB purchase order → LLP sales order flow** ("Needs Approval" inbox, `poAutoCreateMode`). Its screens were no longer in the legacy navigation; the inter-company register covers LLP → OSB transfers.

## 4. Data

- The item master (62 items) is reference data, seeded everywhere (`api/src/seed/sales-items.ts`, also in 0010).
- The legacy party master, orders, invoices and inter-company register are real business records. They are **dev-only** demo data (`api/src/seed/sales-demo.dev.ts`): 674 parties, 65 orders, 57 invoices and 111 transfers.
- Legacy kept orders and invoices as one row per line. The conversion groups them by number, as the legacy app did on load, and recomputes totals.
- Legacy order statuses map like this: "Ok" and "Excess" → Completed, "CANCEL" → Cancelled, "Pending" → Confirmed.
- Importing the live legacy data is part of the DB-connect task.

## 5. Not in this module yet

- **Receipts:** "outstanding" is everything invoiced, as in legacy. Receipts and credit notes belong to Accounts.
- **Stock movements:** invoices don't move FG stock or Stock (module 5) SKU balances. FG inventory is maintained by hand, as in legacy.
- **E-invoice and e-way bill generation:** the IRN and e-way bill numbers are typed in.

# Purchase module: functional spec

Rebuild of the legacy **Purchase ERP** (`legacy/erp/index.html`, 5,727 lines, 214 functions). Server code is in `api/src/modules/purchase`, screens are in `web/src/modules/purchase`, the schema is in `db/migrations/0006_purchase.sql`, and the calculation is in `api/src/contracts/purchase.ts` (`calcEntry`, shared by the server and the form preview).

## 1. Materials and the calculation

There are six fixed materials. "Per ton" means quantities are in kg and amount = qty × rate ÷ 1000.

| Material | Unit | Rate | Extra fields |
|---|---|---|---|
| Nilgiri Wood | Kg | per ton | Species (master) and lot label |
| Resin | Kg | per ton | |
| Kraft Paper | Pcs | per piece | |
| Fire Wood | Kg | per ton | |
| Core Veneer | Pcs | per piece | |
| Face Veneer | Sq Mtr | per sq mtr | Veneer type (master), alternate piece count |

Each entry has an **invoice quantity** and a **Strandply (SPL) quantity** (our weighbridge), one rate, an optional **rate difference** per rate unit, and other charges. GST is SG+CG (half each), IGST, or URD (none), at 0/5/12/18/28%.

- **A. Invoice:** invoice qty × rate, plus GST, plus other charges.
- **B. Strandply:** SPL qty × rate, plus GST.
- **C. Quantity note:**
  - invoice > SPL: a **debit note** for the shortfall.
  - SPL > invoice: a **credit note** for the excess.
  - It reconciles the invoice to what arrived: A ∓ C = B + other charges.
- **D. Rate note:** SPL qty × |rate difference|, plus GST.
  - A positive difference (the invoice rate is above the agreed rate) gives a debit note.
  - A negative difference gives a credit note.
- **Payable** = B + other charges − rate DN + rate CN.

Money is integer paise, and each GST component is rounded to the paisa.

## 2. Access

| Key | Kind | Grants |
|---|---|---|
| `purchase_dashboard` | page | Dashboard, reports, audit trail |
| `purchase_entries` | page | Register, truck register, returns, documents, type masters |
| `purchase_orders` | page | Purchase orders |
| `purchase_notes` | page | Debit / credit notes |
| `purchase_inventory` | page | Raw material stock (opening, consumption, ledger, ageing) |
| `purchase_approve` | action | Approve entries, POs, returns and opening stock; unlock opening stock |

These replace the legacy hard-coded PIN approver ("Jimit Mehta", PIN 1234) and the delete PIN.

Defaults:
- **Super Admin and Admin:** everything.
- **Management:** dashboard and stock, read-only.
- **Dispatch and Marketing:** nothing.

The legacy Purchase Manager, Store and Accounts roles arrive with the ERP role model (PLAN.md §4); until then a Super Admin can grant these keys in Roles & permissions.

## 3. What carried over, and what changed

| Legacy | New |
|---|---|
| Six material registers | One **Purchase register** with a tab per material: stats, FY / month / status filters, search, sort, Excel. |
| Add / edit entry, Save Draft | Entry form: PO pick-up (fills vendor and rate), vendor search over the Vendors module (fills code, GSTIN, PAN, place, tax type, items), next lot suggested, species / veneer type, live amount breakup, attachments. A draft is kept out of registers, notes and stock until posted. |
| Approval PIN, delete PIN | The `purchase_approve` and `delete` permissions. Editing an approved entry or PO sends it back for approval. |
| Truck receiving slip (A5), Nilgiri lot label (A4) | The same prints, from server payloads, with the company header from Company settings. |
| Truck register | All posted entries, every material. |
| DN/CN register with status cycling | Notes worked out from entries, with tabs (debit, credit, rate difference), totals, and a status per note (Pending, Under Review, Issued, Settled, Cancelled). |
| PO module with T&C, PDF | POs with received / balance / progress from posted entries. Clauses come from the shared Vendors T&C master; the legacy PO clauses were added to it. Auto-numbered PO-YY-NNN when left blank. |
| Purchase returns | Returns RET-YY-NNN, optionally linked to the original entry. Stock is reduced at once; approval records the sign-off. |
| Inventory: opening stock per FY, carry forward, consumption, valuation | The stock ledger per FY with Nilgiri split by species. Opening stock is saved as a draft or for approval, locked once approved, and can be unlocked. Last FY's closing is offered as the opening until one is saved. Consumption is entered per row. |
| Reports tabs | Day-wise, product × day, materials, vendors (quantity variance), rate variance, yield & consumption, with Excel for day-wise and product × day. |
| Dashboard | The FY or a month: value, vendors, open notes, entries awaiting approval, stock value, today's inward, monthly value, top vendors, by material, vehicles, recent entries. |
| Documents (upload) | Real uploads (PDF/JPG/PNG up to 10 MB, contents checked against the extension), attached to an entry or standalone. |
| Audit trail | The activity log filtered to purchase actions. |
| Nilgiri species / face veneer type masters | Kept as server-side masters (they were stored in the browser before). |

Legacy bugs fixed:
- **Nilgiri was "per kg" in the form** but per ton in the saved data. It is per ton everywhere now.
- **The slip's net payable subtracted the quantity debit note** from an amount already computed on the SPL quantity, which double-counted. Payable is now SPL total ∓ the rate note (§1).
- **The rate note was based on the invoice quantity in the data** but the SPL quantity in the code. It uses the SPL quantity.
- **Saving dropped "other charges"** that the form had shown.
- **Inventory closing ignored consumption** when carrying forward, and valued stock including GST. Closing now subtracts consumption, and stock is valued at basic.
- **Consumption, yield and ageing were placeholders** (fixed 65%, 78%, 62/23/10/5%). Consumption is entered, yield comes from it, and ageing is FIFO over actual receipts.
- **Delete renumbered every row**; entries now keep their lot.
- **A repeated vendor invoice** is now warned about.

Removed:
- **The User Roles info page:** Roles & permissions covers it.
- **The duplicate vendor directory page:** the Vendors module has it.
- **jsPDF downloads:** prints use the browser's Save as PDF.
- **The inventory "period" filter:** it mixed one month's purchases with the whole year's opening and consumption.

## 4. Numbering

| What | Format | Notes |
|---|---|---|
| Lot | `<prefix><NN>` (N, R, K, F, C, V) | Per material per FY; the next is the highest used + 1. Can be typed. |
| PO | Typed, or `PO-YY-NNN` | Unique. |
| Return | `RET-YY-NNN` | |

## 5. Files

Document bytes live in a blob store: `api/.data/files` in local dev, memory in tests. **TODO(r2):** an R2 bucket on Workers, plus a retention job for the files of deleted documents.

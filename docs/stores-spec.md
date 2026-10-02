# Stores module: functional spec

Rebuild of the legacy **Stores – MRN & GRN** app (`legacy/stores/index.html`, 2,008 lines, 103 functions). Server code is in `api/src/modules/stores`, screens are in `web/src/modules/stores`, and the schema is in `db/migrations/0007_stores.sql`.

## 1. The flow

1. **Gate entry (MRN).** Security logs each vehicle at the gate: vehicle, guard, driver, vendor, invoice / challan number if the driver has it, gate remarks, and one line per material on the vehicle with an approximate quantity, unit and packages. Saving prints the A5 MRN slip. The MRN is **Pending GRN**.
2. **Goods receipt (GRN).** Stores picks the pending MRN, or uses "Make GRN" on it. The lines come from the MRN. For each line Stores enters the actual quantity and its quality, and can add items that weren't on the gate entry (unlisted). The invoice number is checked against Purchase entries. Saving prints the GRN and marks the MRN **GRN created**. Lines left without an actual quantity are not saved.
3. **Review, then approval.** A GRN goes Draft → Reviewed → Approved, one step at a time.
4. **Accounting.** An approved GRN is marked accounted with the voucher number it was booked under in the accounts software. This can be undone.

Quality per line, from worst to best: Damaged / Rejected, Short received, Partial (balance pending), Excess received, OK (matches MRN). A GRN's quality is its worst line.

Materials: Nilgiri Wood, Resin, Kraft Paper, Fire Wood, Core Veneer, Face Veneer (the Purchase material ids), plus Other. Units: Kg, MT, Nos, Sheets, Bundle, Litre, Roll.

## 2. Access

| Key | Kind | Grants |
|---|---|---|
| `stores_dashboard` | page | Dashboard, audit trail |
| `stores_gate` | page | Gate entry (MRN) register and form |
| `stores_grn` | page | GRN register and form; also lists pending MRNs |
| `stores_accounting` | page | Accounting (approved GRNs, vouchers) |
| `stores_reports` | page | MRN pending GRN, accounting status |
| `stores_settings` | page | Auto-punch settings |
| `stores_review` | action | Review a GRN (Draft → Reviewed) |
| `stores_approve` | action | Approve a GRN (Reviewed → Approved) |
| `stores_account` | action | Mark a GRN accounted, and undo it |

The three actions replace the legacy PIN roles: Reviewer (P K Sinha, 2222), Approver (Jimit Mehta, 3333) and Accountant (Accounts team, 4444). The stamps record the signed-in user, not a fixed name.

Defaults:
- **Super Admin and Admin:** everything.
- **Management:** dashboard and reports, read-only (they can print a GRN and export).
- **Dispatch and Marketing:** nothing.

Security, Stores and Accounts roles arrive with the ERP role model (PLAN.md §4). Until then a Super Admin grants these keys in Roles & permissions.

## 3. What carried over, and what changed

| Legacy | New |
|---|---|
| MRN form, "Save & Print MRN Slip" | Gate entry form, saved and printed in one step. The vendor is picked from the Vendors directory or typed. A picked vendor's name comes from the directory. |
| MRN register: search, material, status, date range, Excel (one row per item), PDF | The same filters, kept in the URL; Excel one row per item. |
| "➜ GRN" / "View GRN" on an MRN | "Make GRN" opens the GRN form for that MRN; "View GRN" opens it. |
| GRN form from a pending MRN, extra items, invoice link badge | The same. The link is to a **Purchase entry** with that invoice number (preferring the same vendor), shown with its lot, and saved on the GRN. |
| GRN register with status flow, Review / Approve by PIN | Status tabs, the Draft → Reviewed → Approved flow, `stores_review` / `stores_approve`. |
| Accounting audit trail: mark accounted with voucher (PIN), undo (PIN) | The same with `stores_account`; Excel. |
| Dashboard: today's MRNs / GRNs, pending GRN, pending accounting, recent MRNs, ageing | The same, plus GRNs awaiting review and awaiting approval. |
| Report: MRN prepared but GRN pending (per item, vendor / material / min-days filters, KPIs, Excel) | Same. |
| Report: accounting status (KPIs, Excel) | Same. |
| Settings: auto-punch MRN / GRN date and time | Same, stored server-side. With auto-punch on, the server clock (India time) stamps the document and typed times are ignored. |
| Sidebar badge: pending GRN | Same (Stores and Goods receipt). |
| A5 MRN and GRN PDFs | The same slips, printed from server payloads with the company header from Company settings. |

New:
- An MRN can be **edited or deleted while it is Pending GRN**. A GRN can be edited or deleted **until it is approved**. Editing a reviewed GRN sends it back to Draft. Deleting a GRN puts its MRN back to Pending GRN.
- A GRN can't be dated before its gate entry (when auto-punch is off).
- An audit trail of every Stores change, sign-off, export and print.

Legacy bugs fixed:
- **Numbers came from counting the FY's records.** Deleting a record would reuse a number. Numbers now come from a per-FY counter and are never reused.
- **Two GRNs could be made for one MRN** if two people had the form open. The server allows one live GRN per MRN.
- **The invoice "link" matched any field called invoiceNo in any module's browser storage.** It now looks only at Purchase entries.

Removed:
- **Backup / restore JSON:** the data lives on the server.
- **The roles and PINs table:** replaced by the permission explanation in Stores settings and the Roles screen.
- **jsPDF register PDFs:** registers export to Excel. Slips print through the browser's Save as PDF.

## 4. Numbering

| What | Format | Notes |
|---|---|---|
| MRN | `MRN/26-27/0001` | Per FY of the gate date, from the counter `MRN-2026-27`. |
| GRN | `GRN/26-27/0001` | Per FY of the receiving date, from the counter `GRN-2026-27`. |

The forms show the next number as a preview. It is only taken when the document is saved.

## 5. Not in this module yet

The old navigation listed Store POs, item issues and item stock for Stores. The legacy Stores app has none of these. Item stock arrives with Stock (module 5).

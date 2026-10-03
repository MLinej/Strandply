# Stock module: functional spec

Rebuild of the legacy **Stock Management** app (`legacy/stock/index.html`, 2,436 lines, SKU Master v8). Server code is in `api/src/modules/stock`, screens are in `web/src/modules/stock`, and the schema is in `db/migrations/0008_stock.sql`.

## 1. Items, SKU codes and movements

- **Item master.** 103 item groups from SKU Master v8, each with a prefix (OC-611), a description, a family (OSB, OSB-CAL, S-OSB, S-OSB-CAL, MDO, HYB, RCOSB, Raw Material), a department / stock location (26 of them, in process order), size, grade, unit and its valid thicknesses.
- **SKU code.** The prefix plus a two-digit thickness (OC-611 + 12 = **OC-61112**). A group with no thicknesses is a fixed code: the prefix is the SKU (raw material, consumables, scrap).
- **Movements.** Every movement is a MINUS leg on one SKU and/or a PLUS leg on another:

| Movement | Number | Legs |
|---|---|---|
| Opening stock | — | + item |
| Stock issue slip (SIS) | `ISS/2026/001` | − from (stock location), + to (department / WIP) |
| Stock receipt slip (SRS) | `MRS/2026/001` | − from (department / WIP), + to (stock location) |
| Reclassification (STR) | `STR/2026/001` | − from, + to (regrade, reject, cut size, close WIP…) |

- **Balance** of a SKU = the sum of its legs over every live movement. Nothing else is stored.
- **Rules:**
  - FROM and TO must be different SKU codes.
  - A MINUS can't take a SKU below zero.
  - Removing a movement can't take its PLUS SKU below zero.
  - Dates default to today and can't be in the future.
  - Quantities allow up to 3 decimals (kg).
- Numbers run per calendar year of the document date, as in legacy.

## 2. Access

| Key | Kind | Grants |
|---|---|---|
| `stock_dashboard` | page | Dashboard, audit trail |
| `stock_slips` | page | Slip register and the SIS / SRS form |
| `stock_ledger` | page | Live stock, SKU / department ledgers, daily movement, Excel |
| `stock_reclass` | page | Reclassification |
| `stock_masters` | page | Item master, opening stock |

`edit` creates, `delete` reverses or deletes, `print` and `export` as everywhere. Defaults:
- **Super Admin and Admin:** everything.
- **Management:** dashboard and ledgers.
- **Dispatch and Marketing:** nothing.

## 3. What carried over, and what changed

| Legacy | New |
|---|---|
| Home: total stock, slip counts with a date range, stage-wise bars, recent slips, New SIS / SRS | Dashboard with the same; the REJ header alert is the "Rejected + scrap" tile. |
| Slip entry: SIS / SRS toggle, FROM / TO item + thickness pickers with live stock, Miracle entry preview, qty, shift, batch (auto), PR / SO ref, remarks | Same, in a dialog. |
| Print slip, WhatsApp slip | Same (A5, from a server payload with the company header). |
| History with search | Slip register: type tabs, search (slip no., either SKU, batch, ref), date range, Excel. |
| Ledger: SKU-wise (running balance), dept-wise (IN / OUT), daily movement; print / WhatsApp | Same three views with date range, Excel, print and WhatsApp. |
| Stock: SKU-wise by family, dept-wise closing with totals; print / WhatsApp | Live stock with SKU / department views, family / department / search filters, Excel, print and WhatsApp. |
| Reclass with 7 scenarios, history, delete | Same; delete is a checked reversal. |
| Item master add / edit / delete | Same, **saved on the server**. |
| Opening stock add / reverse | Same. |

New:
- A slip can be **reversed** (it had no delete), with the same check as opening reversal.
- Reclassifications are included in the daily movement report.
- An audit trail of every Stock change, export and print.

Legacy bugs fixed:
- **Ledgers and stage-wise stock ignored opening stock and reclassification.** They summed slips only, so balances were wrong as soon as opening stock was entered. Everything now uses the same balance.
- **The SKU ledger's "All SKUs" running balance** added every SKU together. The balance now runs per SKU, with the balance brought forward when a start date is set.
- **Item master changes were never saved** (lost on reload). They are now stored, and an item's prefix, thicknesses in use and the item itself are protected while it has movements (legacy only blocked deleting an item with a balance, and allowed renaming its prefix).
- **Deleting a reclassification didn't check stock** and could leave the TO SKU negative.
- **Numbers came from counting slips**, so a deleted slip's number could be reused. They come from a counter now.

Removed:
- **The browser loader / alert toasts and the hard-coded company address:** the app shell and Company settings cover these.

## 4. Not in this module yet

Production (module 6) will post its consumption and output as movements on these same SKUs. Sales (module 7) will issue finished goods.

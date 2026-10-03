# Production module: functional spec

Rebuild of the legacy **Production MIS** (`legacy/production/index.html`, 7,167 lines) and the stand-alone **Matt Weight System** (`legacy/production/weight-system.html`, 2,058 lines). Server code is in `api/src/modules/production`, screens are in `web/src/modules/production`, the schema is in `db/migrations/0009_production.sql`, and the shared calculations are in `api/src/contracts/production.ts`.

## 1. Documents

| Document | Number | What it records |
|---|---|---|
| Production plan | PPR-0001 | Shift plan: product lines (product, size, thickness, priority, target boards); target matt weight, matts, resin per matt, wet wood on the floor; boiler / dryer / blender / forming / pre-press / hot press / cutting parameters; links to the hot press, board cutting and matt batch that carried it out. |
| Hot press report | HP-0001 | Product, size, thickness, operator, and one line per press charge (pcs, load and unload time). |
| Chipping report | CHR-0001 | Nilgiri wood chipped, by Purchase lot. Each line fixes the lot's **net rate** at save. |
| WIP Nilgiri batch | WIP-0001 | Made from one chipping report; used by production summaries. |
| Resin consumption | RC-0001 | Resin used from one Purchase resin lot. |
| Board cutting | BC-0001 | Boards cut from one hot press report (one cutting report per hot press). |
| Production summary | PS-0001 | A shift's output and consumption, linking its plan, hot press, cutting, matt batch, resin entries and the WIP batches it used. |
| MDO press report | MDO-0001 | Press start and end, item lines (board type, thickness, paper, BSL / OSL / both, finish, pcs, cycle time), paper used and wasted. |
| Matt weight batch | MWB-0001 | Setpoint, pass band, target matts and the punched matt weights. |

### Calculations

- **Hot press:**
  - Boards: the sum of the charges' pieces.
  - Press time: the sum of each charge's load → unload.
  - Total time: clock time from the first load to the last unload; times past midnight wrap.
  - Spare time: total − press.
- **Board cutting:**
  - Rejects: boards pressed − boards cut.
  - Reject %: rejects as a share of boards pressed.
  - The pressed count is read live from the hot press report.
- **Lots:**
  - Net rate: Purchase invoice rate − rate difference. A positive difference is a debit note.
  - Available: SPL quantity − what chipping (Nilgiri) or resin consumption has used.
  - Over-drawing a lot is refused. Only posted Purchase entries can be used.
- **WIP Nilgiri:**
  - Chipped: the chipping report's quantity, at its average rate.
  - Available: chipped − used in production summaries ± manual adjustments.
  - The balance may go negative, as in legacy, because chipped weight is a worked-out figure. The ledger runs per batch.
- **Production summary:**
  - With linked resin entries, resin kg and ₹ come from them; without, they are typed.
  - Wet wood kg and ₹ come from the WIP lines at each batch's rate.
  - Reject % = board rejects ÷ press pcs.
- **Production plan:**
  - Sqft = boards × the size's area (8x4 = 32).
  - Estimated charges = ceil(boards ÷ boards per charge, default 30).
  - Resin needed = resin per matt × matts.
  - Dry wood = matt weight × matts − resin; wet wood = dry wood × 2.5 (a setting).
  - Matts default to the planned boards.
- **Matt weight:**
  - Grading: pass within ±band of the setpoint, warn within ±2×band, otherwise reject.
  - Statistics: average, min, max, sample standard deviation, pass rate.
- **Plan vs actual:**
  - A plan is compared with its linked hot press, cutting and matt batch: boards, charges, boards cut, rejects, matts, matt weight.
  - A summary is compared with its plan: boards, matts, matt weight, resin, wet wood, rejects.
  - ≥ 98% of plan is "On plan".

## 2. Access

| Key | Kind | Grants |
|---|---|---|
| `production_dashboard` | page | Dashboard, reports, audit trail (reads every register) |
| `production_planning` | page | Production plans, production summaries |
| `production_press` | page | Hot press, board cutting, MDO press |
| `production_matt` | page | Matt weight |
| `production_materials` | page | Chipping, WIP Nilgiri, resin consumption |
| `production_settings` | page | Master lists, planning factors, financial years |
| `production_review` | action | Mark reviewed / return to draft |
| `production_approve` | action | Approve / reject; correct or delete punched matt weights; close or reopen a financial year |

These replace the legacy PIN roles: Operator (1111), P K Sinha reviewer (2222), Jimit Mehta approver (3333), Admin (1234).

Defaults:
- **Super Admin and Admin:** everything.
- **Management:** dashboard (with reports and audit).
- **Dispatch and Marketing:** nothing.

## 3. What carried over, and what changed

| Legacy | New |
|---|---|
| Dashboard: KPIs, all-modules summary, boards-by-product chart, recent activity, Nilgiri stock, date / FY filter | Same, plus documents waiting for review and approval. |
| Each module's register with KPIs, search, view, edit, PDF, XLS, send for review, delete | One register per document: status tabs, search, FY and date filters, Excel, view / edit / print / delete, the sign-off buttons and the history. |
| Draft → review → reviewed → approved, notes, return / reject | Same. Editing a document under review sends it back to draft, and approved documents are locked (legacy let them be edited). |
| Hot press with charges | Same; time figures shared with the form preview. |
| Chipping by lot, "+ WIP batch" | Same; lots are the real Purchase entries instead of a hard-coded copy. |
| WIP Nilgiri stock and ledger, manual adjustment | Same; the ledger is worked out from chipping, summaries and adjustments, so it can't drift. |
| Resin consumption by lot, lot stock | Same, from Purchase resin entries; the oldest lot with stock is offered first. |
| Board cutting from a hot press, auto reject | Same. |
| Production summary with links and multi-batch WIP | Same, with plan vs actual in the view and the print. |
| Production planning with all department fields, raw-material check, plan vs actual | Same. |
| MDO press | Same. |
| Matt weight batches, numpad and keyboard punching, live KPIs, edit / delete a weight (Jimit PIN), close batch | Same; corrections need `production_approve`. The stand-alone Matt Weight System's distribution and trend charts, min / max / std dev and report are included. |
| Reports & summary tabs with date range and export | Same, with Excel per module. |
| Close / reopen financial year | Same: a closed FY's records can't be added, changed, deleted or signed off. |
| Thickness and size masters | Same, in Production settings, with boards-per-charge and wet-wood factor. |
| PDFs for every document, matt report, dashboard, reports | Prints for every document and matt batch (A4, company header, sign-off names from the history); report pages print from the browser. |
| Audit trail (last 500, local) | The shared activity log, filtered to production. |

Legacy bugs fixed:
- **Editing a hot press report recalculated time differently from creating one.** It summed the charges and counted spare time as each charge beyond 90 minutes. Both now use one calculation.
- **Estimated press charges were boards ÷ 30 on screen but ÷ 450 when saved.** Now there is one rule, with boards per charge as a setting.
- **The wet-wood requirement was × 2.5 in the form but not in the PDF.** Now one rule.
- **Saving board cutting or resin quietly overwrote figures in an existing production summary.** Summaries now read their links.
- **Purchase lots were a hard-coded list in the page**, so new purchases never appeared. Lots now come from Purchase.
- **Approved documents could still be edited, and deleted documents left their links dangling.** Approved documents are now locked, and a document that others use can't be deleted.
- **Two board cutting reports could be made for one hot press.** It is now one per hot press.

Removed:
- **PIN role switching, the session auto-lock and the PDF colour themes:** the app's sign-in and permissions cover them.
- **JSON backup / restore:** the data lives on the server.
- **Google Sheets sync and the separate users list of the Matt Weight System.**

## 4. Not in this module yet

- **Stock movements:** production doesn't post movements to Stock (module 5) yet, so hot press output, cutting and rejects don't move SKU balances. This is a follow-up once the two modules' item codes are mapped.
- **Purchase inventory:** the Purchase raw-material stock ledger still takes consumption as typed figures, not from chipping and resin consumption.

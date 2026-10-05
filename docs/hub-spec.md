# Reports Hub: functional spec

Rebuild of the legacy **Reports Hub** (`legacy/reports/index.html`, 2,239 lines). It holds no records of its own: every figure is read from the other modules' records through their repos and worked out with those modules' own calculations, so the hub always agrees with the module screens. Server code is in `api/src/modules/hub`, screens are in `web/src/modules/reports`, and the shapes are in `api/src/contracts/hub.ts`. `db/migrations/0017_hub.sql` only grants the pages to roles.

The legacy hub read each module's browser storage (or a pasted JSON export). Here it reads the live data, so the legacy "Data Sources" import screen becomes a read-only summary of what each module holds.

## 1. Period

Every report takes a range: `from` / `to` dates or a financial year (`fy`, April to March). With neither, it covers **the current FY to date**. A `from` later than `to` is refused (422).

## 2. Figures and where they come from

| Section | Source | Rules |
|---|---|---|
| Purchase | Purchase entries dated in the range | Drafts are left out. Value = the SPL total with tax, plus other charges (as on the purchase entry). "Awaiting approval" = submitted, not yet approved. Optional material filter. By material (qty in the material's unit), by month, top vendors, the latest entries. |
| Production | Hot press reports dated in the range | Boards = the hot press report's total boards. By month, product, shift. |
| Electricity | Meter readings and PGVCL bills | Metered units and cost day by day at the tariff in force (the Electricity module's daily costing). Bills count by bill date. By month: billed and metered side by side (both ₹). Bill list with paid / unpaid. |
| Sales | Sales invoices dated in the range; sales orders | Revenue, tons (from the board size × pieces on each line), average invoice, invoices awaiting approval, top customers, by firm, by month. **Pending orders are every order still open, whatever its date** (legacy behaviour), with tons and value; the order pipeline counts orders by status. Optional firm filter. |
| Maintenance | Work orders | A work order counts if it was raised, is due, or had timeline activity in the range (legacy `taskTouchedInRange`). Open, completed, **overdue as of today**, by category and priority, the open list by due date. |
| Stock | Purchase inventory ledger; SKU stock | Raw material per material for an FY: opening, purchased, consumed, closing, closing value. SKU stock now, by department. |
| Cost per board | Purchase + electricity + production | Combined cost = purchase value + metered power cost. Cost per board and kWh per 1,000 boards, overall and by month (blank where no boards were pressed). Raw material share of the combined cost. A rough guide: purchases count when received, not when used. |
| Other modules (period reports) | Complaints, freight order forms, DWPAS plans | Complaints dated in the range and how many are still Open / In Progress; freight order forms (not cancelled) and their value; work plans and their average line achievement %. |

## 3. Screens

| Screen | Content |
|---|---|
| Reports hub | KPI tiles (purchase, boards, power, sales, cost per board, open work orders), month charts for each, purchase by material. Range picker. Excel. |
| Purchase / Production / Stock / Electricity / Sales / Maintenance reports | KPIs, month chart, ranked lists and tables for the module, with the filters above. |
| Cost per board | KPIs, raw material and power by month (two series, same unit), kWh per 1,000 boards, month-by-month table. |
| Daily / Monthly / Financial year report | One date, one month or one FY: KPI tiles, the other-module pills, and section tables (purchase by material, production by product, electricity, sales invoices, pending orders, open maintenance). A4 print of the whole report; Excel. |
| Data sources | Each module, its record count, when it last changed and a link to it. |

Charts: one or two series in the same unit (never two scales), every month in the range shown even when quiet, a hover readout per month, and a table view.

**Excel** (`/api/hub/export`): one workbook for the range: Summary (including power), Purchase, Production, Cost per board, Sales, Pending orders, Maintenance.

## 4. Access

| Key | Kind | Grants |
|---|---|---|
| `hub_dashboard` | page | The hub dashboard |
| `hub_modules` | page | The module reports and cost per board |
| `hub_periodic` | page | Daily, monthly and FY reports |
| `hub_sources` | page | Data sources |

Print and Excel follow the role's `print` / `export` actions. Management has dashboard, modules and periodic; administrators have everything. The hub shows figures from modules a person may not otherwise open (it is a management view), so grant it with that in mind.

## 5. Legacy coverage

| Legacy | Here |
|---|---|
| Dashboard (KPIs, charts) | Reports hub |
| Purchase, Production, Stock, Electricity, Sales, Maintenance reports | Module reports |
| Cross-Module Analytics | Cost per board |
| Daily / Monthly / FY report, print, Excel | Period reports |
| Data Sources (import JSON / read storage) | Data sources (live, read-only) |

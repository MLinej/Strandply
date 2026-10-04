# Electricity module: functional spec

Rebuild of the legacy **Electricity & Meter MIS** (`legacy/electricity/index.html`, 1,953 lines). Server code is in `api/src/modules/electricity` (the costing is in `calc.ts`), screens are in `web/src/modules/electricity`, the schema is in `db/migrations/0014_electricity.sql`, and the shared types are in `api/src/contracts/electricity.ts`.

## 1. Records

| Record | What it records |
|---|---|
| Meter details | Meter number, consumer number, category, sanctioned load (kVA), CT and PT ratio, tariff, billing cycle. One set: the setting `electricity.meter`. |
| Rate history | Four dated histories: **MF** (multiplying factor), **fixed charge** per 30-day month, **energy rate** per kWh and **fuel surcharge** per kWh. One entry per kind per date. |
| Reading | Date, AM or PM shift, time, the cumulative kWh reading, PF, night units, remarks. |
| PGVCL bill | Bill, due and paid dates; advance adjusted; kWh and kVArh readings; average PF; night units; the twelve charges (demand, energy, fuel surcharge, PF / night / EHV rebates, time of use, GT, total consumption, electricity duty, meter charges, TCS); net and total payable; remarks; the invoice PDF. |

Money is in paise. Rates are stored per kWh in paise, and the fixed charge per month in paise.

### Costing (as legacy)

- **Rates by date.** Every reading, day and bill uses the entry in force on its date: the latest from on or before it. Before the first entry the earliest entry is used; with no entries the legacy defaults apply (MF 30, ₹6,38,675 a month, ₹4.20 and ₹2.30 per kWh).
- **A reading's difference** is its kWh minus the reading just before it, in either shift: a cumulative meter's previous value. Net kWh = difference × MF. Energy = net × energy rate; fuel = net × fuel rate. The fixed charge is the month ÷ 30 per day, and ÷ 60 per 12-hour shift.
- **A day** (the 12-hr, 24-hr and monthly views and the dashboard) takes the last AM and the last PM reading. Each shift's use is its last reading minus the reading before the shift began. The day's cost is energy + fuel + one day's fixed charge. PF is the PM reading's, else the AM's. Days without readings are left out.
- **The status strip** shows today's latest AM and PM readings, PM − AM once both are in, the day's cost so far, and the latest PF.
- **PF bands:** 0.95 or more earns the incentive (green), 0.85–0.94 is normal, and below 0.85 is penalised (red).

### Rules

- **Readings:**
  - AM is 00:00–11:59 and PM is 12:00–23:59; the form picks the shift from the time.
  - One reading per date and time, and none in the future.
  - The meter only counts up: a reading can't be lower than the one before it or higher than the one after it.
  - The punch form previews the difference, net units and cost before saving.
- **Rate histories:** one entry per kind per date, and each history keeps at least one entry (legacy rules). Adding or removing an entry re-costs every reading and day it covers.
- **Bills:**
  - Bill date, kWh reading and total payable are required. One bill per date.
  - The kWh and kVArh differences are from the previous bill by date, × the MF on the bill date. The form works them out while you type; they're recalculated on every read.
  - Each bill shows what the meter readings cost for its period (the day after the previous bill through the bill date), so the actual bill can be compared with the estimate.
  - The invoice is a PDF of up to 10 MB, stored in the blob store.
- **Bill totals:** count, last bill, average, the current financial year's total, and average PF.

## 2. Access

| Key | Kind | Grants |
|---|---|---|
| `electricity_dashboard` | page | Dashboard and audit trail |
| `electricity_readings` | page | Meter reading punch and the reading log |
| `electricity_reports` | page | 12 / 24-hr view and the monthly report |
| `electricity_bills` | page | PGVCL bill register and invoices |
| `electricity_settings` | page | Meter details and the four rate histories |

No new actions: the generic `edit`, `delete`, `print` and `export` apply. Legacy had no access control.

Defaults:
- **Super Admin and Admin:** everything.
- **Management:** dashboard, reports and bills (read, print, export).
- **Dispatch, Marketing:** nothing. Grant the readings page to whoever punches the meter.

## 3. What carried over, and what changed

| Legacy | New |
|---|---|
| Top status bar (today's AM / PM, delta, cost, PF, meter number) | The status strip on the readings page, plus the rates in force today. |
| Meter Reading Punch: shift toggle, live preview, PF gauge, last 50 readings, CSV / PDF | Same. The log pages through every reading and filters by shift and date. Excel replaces CSV. |
| 12-Hr View and 24-Hr View by month, CSV | One page with a 12-hr / 24-hr switch, a total row, Excel and print. |
| Monthly Report for a date range, CSV / PDF | Same, with Excel and print. |
| Dashboard: 8 KPIs, monthly trend, month-wise cost table | Same. Defaults to the financial year to date. |
| PGVCL Bills: every field, auto diffs, PDF attachment, CSV / PDF | Same, plus the readings estimate beside each bill and an unpaid marker. |
| Meter Configuration with MF / FC / energy / fuel histories | The Meter & tariff page, with the entry in force marked. |
| — | New: an audit trail of every reading, bill, rate and meter change and export. |

Legacy bugs fixed:
- **Two readings in one shift undercounted.** Legacy took the last reading minus the one just before it, which could be an earlier reading in the same shift. A shift now counts from the reading before it began.
- **A reading lower than the previous one was accepted**, giving negative consumption and cost. Now rejected, and the preview warns.
- **Bill differences were saved when the bill was entered**, so entering an earlier bill afterwards left the next bill's difference wrong. They're now worked out from the bills as they stand.
- **Two readings could have the same date and time.** Now one per date and time.
- **"YTD Total" on bills was the calendar year.** It's now the financial year.

## 4. Data

- Legacy kept its records on the old server (`/api/electricity/config`, `/readings`, `/bills`), with the invoice PDF as base64 in the bill row. There was nothing in the file to convert.
- Seeded everywhere: the legacy defaults as the first entry of each rate history (from 1 April 2025), and a blank meter setting.
- Dev also gets two weeks of twice-daily readings (18 Sept – 1 Oct 2026) and the August and September bills.
- Importing the live data is part of the DB-connect task.

## 5. Not in this module yet

- **One meter.** The plant has one HT connection; sub-meters per department aren't tracked.
- **Power cost doesn't flow into Production costing yet.** The roadmap's cost-per-board link waits for the Reports Hub.
- **Bills are typed in.** There's no PGVCL bill download or PDF reading.

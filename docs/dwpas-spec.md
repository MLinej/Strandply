# DWPAS: functional spec

Rebuild of the legacy **Daily Work Plan & Achievement System** (`legacy/dwpas/index.html`, 2,088 lines). Server code is in `api/src/modules/dwpas`, screens are in `web/src/modules/dwpas`, the schema is in `db/migrations/0016_dwpas.sql`, and the shared rules are in `api/src/contracts/dwpas.ts`.

## 1. Records

| Record | What it records |
|---|---|
| Department | Name, code, head, description, active. The 12 legacy departments are seeded. |
| Employee | Code, name, department (as typed, since legacy also had Management and Production), designation, type (Skilled, Unskilled, Supervisor, Manager), active. The 7 legacy employees are seeded. |
| Plan | One per day: type (Regular Day, Extra Shift, Overtime, Holiday Planning), prepared by, remarks, status, the department lines and the trail. |
| Plan line | Department, its head (copied when saved), work planned, target and unit (Sheets, Boards, Kg, MT, Liters, Nos, Hours, Trips), skilled and unskilled manpower, machine, priority (High, Medium, Low), operator; and the achievement: actual quantity, skilled and unskilled used, deviation reason, head remarks. |

### Rules

- **One plan per date.** Saving for a date creates its plan or replaces its header and lines. Lines need a department from the master (active) and the work; at least one line.
- **Status:**
  - Saving makes a draft.
  - **Submit** moves it to Submitted.
  - **Approve** (needs `dwpas_approve`) moves it to Approved.
  - Editing a submitted plan puts it back to draft, and the trail says so.
  - An approved plan can't be edited or deleted until an approver **reopens** it (back to draft).
- **Achievement:**
  - Entered against each line, in order, from the plan's day onwards (not for days still to come).
  - % = actual ÷ target, rounded. **95% and up is green, 80–94% amber, below 80% red** (legacy traffic light).
  - Achievement already recorded stays with a line when the plan is edited, as long as its department and work are unchanged.
- **Totals per plan:** lines, skilled and unskilled planned and used, lines recorded, green / amber / red counts, high-priority lines.
- **Masters:**
  - Department and employee names are unique (ignoring case and spaces), and so are employee codes.
  - Renaming a department renames it on employees; plans keep the name they were saved with.
  - A department on plans can only be deactivated.

## 2. Access

| Key | Kind | Grants |
|---|---|---|
| `dwpas_dashboard` | page | Today's plan and the audit trail |
| `dwpas_plans` | page | Plan entry, the register, achievement entry, prints |
| `dwpas_reports` | page | Variance analysis and HR manpower |
| `dwpas_masters` | page | Departments and employees |
| `dwpas_approve` | action | Approve and reopen plans |

Defaults:
- **Super Admin and Admin:** everything, including `dwpas_approve`.
- **Management:** dashboard, plans (read, print, export) and reports.
- **Dispatch, Marketing:** nothing. Grant `dwpas_plans` with edit to supervisors who enter plans and achievement.

Approvers get a sidebar badge with the number of plans waiting for approval.

## 3. What carried over, and what changed

| Legacy | New |
|---|---|
| Dashboard for today: lines planned, green / amber / red, manpower, plan vs actual bars, summary | Same, for any date (today by default), with actual vs planned manpower. |
| Daily Plan Entry: check a date, load and edit or start new; header, line table, status dropdown, workflow bubbles | Picking the date loads its plan or starts a new one. Save draft or Submit; the workflow shows where the plan is. |
| Plan Register: date range, status, search; detail with lines and actions | Same, with approve / reopen, the trail and delete. |
| Achievement Entry: actual, skilled, unskilled, reason, head remarks per line, live % | Same. |
| Variance Analysis: range and department filter | Same, plus a department summary (worst first) and a count of planned lines still without achievement. |
| HR Manpower for a date | Same, with what was actually used. |
| Department and Employee Masters | Same, with edit and an active flag. |
| Plan, achievement and manpower PDFs (red bands, Times) | The same three as A4 prints, with sign-off lines for supervisor, department head and production head. |
| — | New: an Excel export of plans and achievement, the audit trail, and the plans-to-approve badge. |

Legacy bugs fixed:
- **Anyone could mark a plan Approved:** the status was a free dropdown on the entry form. Approval is now a separate step that needs `dwpas_approve`.
- **"Today" was the UTC date**, so between midnight and 5:30 am IST the dashboard, plan entry and HR views showed the previous day. Today is now the business date in India.
- **Typing achievement changed the plan in memory at once**, so leaving without pressing Save still showed figures that were never stored. Nothing changes until it's saved.
- **A department on plans could be deleted.** It can now only be deactivated.

## 4. Data

- Legacy loaded from the old server (`/api/dwpas/departments`, `/employees`, `/plans`) and fell back to the hard-coded masters. There was nothing in the file to convert beyond those masters.
- Seeded everywhere: the 12 legacy departments and 7 legacy employees.
- Dev also gets plans for 29 Sept – 1 Oct 2026 (two approved with achievement, one submitted).
- Importing the live plans is part of the DB-connect task.

## 5. Not in this module yet

- **Plans aren't linked to Production documents** (hot press, chipping…): actuals are typed here, as in legacy. The Reports Hub can set the two side by side.
- **Employees aren't app users.** Prepared-by and operator are names from the employee master.

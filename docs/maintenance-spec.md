# Maintenance module: functional spec

Rebuild of the legacy **Maintenance Work Tracker** (`legacy/maintenance/index.html`, 985 lines). Server code is in `api/src/modules/maintenance`, screens are in `web/src/modules/maintenance`, the schema is in `db/migrations/0013_maintenance.sql`, and the shared rules are in `api/src/contracts/maintenance.ts`.

## 1. Records

| Record | Number | What it records |
|---|---|---|
| Plant area | — | A name and an active flag. Offered on work orders, which store the name. |
| Work order | WO-26-0001 | Title, category, plant area, priority, status, the technician it's assigned to (typed), due date, description, notes, the date it was completed, and a timeline. |
| Timeline entry | — | Created, assigned, status, edited or note: the text, who and when. Append-only. |

- **Categories:** Mechanical, Electrical, Hydraulic, Pneumatic, Civil, Instrumentation, HVAC, Safety.
- **Priorities:** Critical, High, Medium, Low.
- **Statuses:** Open, In Progress, On Hold, Completed.
- **Numbers** run per financial year of the day it's raised (`MT-WO-<fy>` counter).

### Rules

- **Required:** title, assigned to and due date, as in legacy. The area must be an active one; existing work orders keep an area that was later deactivated.
- **Overdue** means past the due date and not completed. Overdue dates show in red, and the count is the sidebar badge.
- **The timeline writes itself:**
  - Creating adds "created" and "assigned" entries, plus a status entry if it starts in another status.
  - Editing adds "Edited title, priority…" naming the fields that changed.
  - A new assignee adds "Reassigned from … to …".
  - A status change, from the form or the status buttons, adds "Status changed to …", with an optional note.
  - Notes are posted from the timeline tab.
  - Saving with no changes adds nothing.
- **Completed** stamps today's date. Moving out of Completed clears it.
- **Areas:**
  - Names are unique (ignoring case and spaces).
  - Renaming one renames it on its work orders.
  - An area with work orders can't be removed, only deactivated (legacy blocked the removal too).
- **Deleting** a work order is a soft delete and needs the `delete` action.

## 2. Access

| Key | Kind | Grants |
|---|---|---|
| `maintenance_dashboard` | page | Dashboard and audit trail |
| `maintenance_orders` | page | Work orders: raise, edit, change status, add notes, print, share |
| `maintenance_masters` | page | Plant areas |
| `maintenance_reports` | page | Maintenance reports and the Excel export |

No new actions: the generic `edit`, `delete`, `print` and `export` apply. Legacy had no access control; everyone acted as "Jimit Mehta, Plant Manager".

Defaults:
- **Super Admin and Admin:** everything.
- **Management:** dashboard and reports, with export.
- **Dispatch, Marketing:** nothing. Grant the work-orders page on the Roles screen to anyone who should raise them.

## 3. What carried over, and what changed

| Legacy | New |
|---|---|
| Stats bar (total, open, in progress, critical, completed) and sidebar filters by status, priority, area | Six status tiles on the work orders page that filter the list, plus the filter bar. |
| List view with edit, PDF, WhatsApp and delete per row | Same, from the row menu. |
| Board view by status | Same. Shows up to 100 matching work orders. |
| Detail panel: details, status buttons, delete; timeline with notes | Same. |
| New / edit form (identity, assignment & schedule, details) | Same fields. The technician field suggests names already used. |
| PDF download (jsPDF) | An A4 print with the timeline and the three signature lines (raised by, technician, approved by). |
| WhatsApp share | Same message, flagging overdue. |
| Manage areas (add, remove when unused) | A plant areas page that can also rename and deactivate. |
| — | New: a dashboard (overdue list, open work by priority / area / category, latest activity), reports (raised vs completed, on-time share, average days to complete, split by area, category, technician and priority), an Excel export, the audit trail, and the overdue badge. |

Legacy bugs fixed:
- **Work order numbers were random** ("WO-" plus six random characters), so they could collide and didn't sort. They're now numbered per year.
- **The "On Hold" count in the sidebar was always 0.** It was hard-coded; the tiles now count it.
- **Area names were compared case-sensitively**, so "press shop" could be added beside "Press Shop". Names are now unique ignoring case.
- **Everything was recorded as "Jimit Mehta".** The timeline and audit trail now show the signed-in user.

## 4. Data

- Legacy kept its records on the old server (`/api/maintenance/work-orders`, `/areas`, `/timeline`). There was nothing in the file to convert.
- Seeded everywhere: the eight legacy default areas.
- Dev also gets the five legacy demo work orders, with dates moved to this season.
- Importing the live data is part of the DB-connect task.

## 5. Not in this module yet

- **Preventive (scheduled) maintenance.** The old app had none; the placeholder "Preventive schedule" page was dropped.
- **Technicians are typed names**, not users or employees, as in legacy.
- **No spare-parts link.** Parts mentioned in notes aren't issued from Stores.

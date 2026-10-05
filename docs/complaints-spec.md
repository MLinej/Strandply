# Complaints module: functional spec

Rebuild of the legacy **Complaint Registration** (`legacy/complaint/index.html`, 1,683 lines). Server code is in `api/src/modules/complaints`, screens are in `web/src/modules/complaints`, the schema is in `db/migrations/0015_complaints.sql`, and the shared types are in `api/src/contracts/complaints.ts`.

## 1. Records

| Record | Number | What it records |
|---|---|---|
| Complaint | CMP/26-27/0001 | Date, salesman, customer (a Sales party or a typed name), contact, location, the Sales invoice it is about (optional), material, category, priority, description, who was notified, status, the date it was resolved, up to six photos, and the case timeline. |
| Timeline entry | — | Registered, edited, status change or comment: the text, who and when. Comments can carry photos and videos. |
| Recipient | — | Name, role, email, active. Offered under "Notify" on the form. |

The legacy lists carry over:
- **Materials:** OSB Board, Plywood, Face Veneer, Core Veneer, Block Board, Flush Door, Other.
- **Categories:** Quality Issue, Quantity Shortage, Damage in Transit, Delayed Delivery, Billing / Invoice Issue, Wrong Material Supplied, Other.
- **Priorities:** Low, Medium, High, Critical.
- **Statuses:** Open, In Progress, Resolved, Closed. "Open" in reports means Open or In Progress; "resolved" means Resolved or Closed.

### Rules

- **Required:** salesman, customer, material, category, description and someone to notify (a recipient from the list, or a typed email), as in legacy. The date defaults to today and can't be in the future.
- **Numbering:** per financial year of the complaint's date (counter `CP-<fy>`).
- **Customer:**
  - Pick from the Sales party master (contact and city fill in) or type a new name. Typed names are offered next time.
  - With a Sales party picked, one of its invoices can be attached. An invoice for another party is refused.
- **Notification:**
  - The complaint keeps a snapshot of who was notified.
  - After registering, the page offers **Email** (mailto with the legacy subject and summary) and **Print report**. A browser can't attach files to mailto, so the email asks for the printed report to be attached, as legacy did with its PDF.
- **Timeline:**
  - Registering adds "Complaint registered · notified …".
  - An edit adds "Edited priority, description…", naming what changed; saving with no changes adds nothing.
  - A status change adds "Status changed from A to B." with an optional note.
  - Comments carry text and up to 10 photos or videos.
  - Every entry is by the signed-in user.
- **Resolved on:** set to today when a complaint first moves from Open or In Progress to Resolved or Closed. Kept when moving from Resolved to Closed; cleared when reopened.
- **Files:**
  - Up to six photos on the complaint (JPG, PNG or WebP, 5 MB each).
  - Comment videos (MP4, MOV or WebM) up to 10 MB each.
  - Each file's contents are checked against its extension. Files are stored in the blob store and served to anyone who can see the register.
- **Deleting** a complaint is a soft delete and needs the `delete` action. Legacy had no delete.

## 2. Access

| Key | Kind | Grants |
|---|---|---|
| `complaints_dashboard` | page | Dashboard and audit trail |
| `complaints_register` | page | New complaint, the register, status, photos, comments, print |
| `complaints_reports` | page | Reports and the Excel export |
| `complaints_masters` | page | Notification recipients |

No new actions: the generic `edit`, `delete`, `print` and `export` apply.

Defaults:
- **Super Admin and Admin:** everything.
- **Marketing** (the salesmen): dashboard and register, with edit and print. No delete or export.
- **Management:** dashboard, register (read and print) and reports, with export.
- **Dispatch:** nothing.

The sidebar badge counts complaints still Open (not yet taken up).

## 3. What carried over, and what changed

| Legacy | New |
|---|---|
| Dashboard: total, open, in progress, resolved, recent 8 | Same, plus closed, open criticals and a by-category chart. Every tile opens the filtered register. |
| New Complaint form with photo upload (6, compressed), recipient or custom email, party dropdown or new name | Same fields, plus the Sales invoice. Photos are uploaded as they are. |
| On register: PDF download and mailto | A success panel with Print report and Email. |
| Register: search, status and priority filters, View / Edit / PDF, CSV | Same, with category, material and date filters too. Excel replaces CSV. |
| Detail: details, photos, status dropdown, timeline with comments, photos and videos | A side panel with the same, plus removing a photo and deleting the complaint. |
| Reports: FY, from / to, party-wise, issue-wise, month-wise chart | Same, plus salesman-wise, material-wise and average days to resolve. |
| Recipients & Parties: recipients list; a party list synced from the Sales ERP's browser storage | Recipients page (with an active flag). Parties come straight from the Sales party master. |
| Complaint PDF (jsPDF) with photos and timeline | An A4 print with the same sections. Photos are printed; videos are noted. |
| — | New: an audit trail and the open-complaints badge. |

Legacy bugs fixed:
- **The number used today's financial year, not the complaint's date**, so a complaint back-dated to March got the new year's number. It now follows the complaint date.
- **Numbers were counted in each browser's storage**, so two salesmen on different devices could raise the same CMP number. Numbers now come from one server counter.
- **Comments and status changes were signed with a typed "Your name"**, and edits were logged under the complaint's salesman rather than the editor. Entries now carry the signed-in user.
- **Photos and videos were stored as base64 inside the browser's storage**, which fills up after a handful of complaints, and nobody else could see them. They now live in the blob store and are shared.

## 4. Data

- Legacy kept everything in each browser's storage (`spl_complaint_records`, `_recipients`, `_parties`, `_seq`). There was nothing in the file to convert.
- Seeded everywhere: the two legacy recipients, Jimit Mehta and P K Sinha. Neither has an email, so add one on the Recipients page to enable the Email button.
- Dev also gets three complaints.
- Importing complaints from the old browsers is part of the DB-connect task.

## 5. Not in this module yet

- **Email is sent from the user's own mail app** (mailto). Sending from the server with the PDF attached waits for the email relay.
- **No link from Sales or CRM back to a party's complaints yet.** The Reports Hub can bring them together.

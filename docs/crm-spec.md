# CRM module: functional spec

Rebuild of the legacy **Marketing & Sales CRM** (`legacy/crm/index.html`, 2,218 lines). Server code is in `api/src/modules/crm`, screens are in `web/src/modules/crm`, the schema is in `db/migrations/0011_crm.sql`, and the shared rules are in `api/src/contracts/crm.ts`.

## 1. Records

| Record | Number | What it records |
|---|---|---|
| Lead | — | A marketing enquiry: company, two contacts and numbers, WhatsApp, email, address, customer type, product of interest, source, campaign, salesperson, stage, next action and date, remarks. Typed in or imported from a sheet. |
| Customer | — | A full profile, usually converted from a lead. Holds contacts, GSTIN and PAN; business details (monthly requirement, products used, current supplier, preferred thickness and size, application, brands, payment and credit); and the relationship (source, salesperson, status, Hot / Warm / Cold priority, first / last contact, next follow-up). Can link to a Sales party. |
| Follow-up | — | A call, WhatsApp, meeting or visit with a customer: discussion, customer response, next action and date, status. |
| Opportunity | — | A possible order: product, thickness, size, quantity, estimated value, stage, probability, competitor, expected close. A customer can have several. |
| Quotation | QT/26-27/0001 | Product, quantity, rate, GST %, validity and status, optionally for an opportunity. Printable. |
| Order won | ORD/26-27/0001 | Made by marking an opportunity won: value, rate, dispatch date, reason, source, days from first contact. |
| Order lost | — | Made by marking an opportunity lost. Holds the reason, the competitor and its price, our price, the customer's expected price, and a reactivation date. |
| Task | — | A to-do (call, send quotation or sample, visit…) for a customer, with assignee, due date, priority and status. |
| Campaign | — | Name, platform, dates, budget, audience and product. Leads name their campaign. |
| Product, salesperson | — | Masters offered in the forms. Records store the name, as legacy did. |

### Rules

- **Duplicates** are checked against leads and customers:
  - Same mobile (last 10 digits), same company + city, or same email.
  - The lead form warns while you type and still lets you save; import flags them and still imports.
- **Convert lead → customer** copies the contact, address, type, product, source, salesperson and next follow-up. The customer's first contact is the lead's date and its last contact is today. The lead keeps the link and moves from "New Lead" to "Contacted". A lead converts once.
- **Follow-ups:**
  - Defaults come from the customer: contact person, salesperson (else the user), priority.
  - Logging one sets the customer's last contact.
  - An open one with a next date sets the customer's next follow-up.
  - Completing one sets the last contact to today.
  - "Open" means Pending or Rescheduled. It's due on its next date, else its own date.
- **The follow-up board** buckets open follow-ups as overdue, today, tomorrow or later. Overdue plus today is the CRM badge in the sidebar.
- **Opportunities:**
  - Won and lost are reached only through Mark won / Mark lost, which create the order record and close the opportunity (probability 100 or 0).
  - A closed opportunity can't change stage or be deleted.
  - Deleting its won or lost order reopens it at Negotiation.
  - An opportunity with a quotation can't be deleted.
- **Reactivate** turns a lost order into a new opportunity at Qualification, 20%, once. A reactivated lost order can't be deleted.
- **Quotations:**
  - Value = quantity × rate; GST is on top.
  - Numbered per FY.
  - The opportunity must belong to the same customer.
- **Customers** with follow-ups, opportunities, quotations, orders or tasks can't be deleted; archive them. A deleted lead unlinks from its customer.

### Dashboard alerts (legacy "Management Alerts")

- Follow-ups overdue.
- Open opportunities above ₹2,00,000 with no follow-up for 14 days.
- Quotations "Sent" more than 15 days ago.
- Open opportunities whose customer has no next follow-up date.
- Active customers with no contact for 30+ days (dormant).
- Lost orders whose reactivation date has come.

## 2. Access

| Key | Kind | Grants |
|---|---|---|
| `crm_dashboard` | page | Dashboard and audit trail |
| `crm_leads` | page | Raw lead data, lead management, import, convert |
| `crm_followups` | page | Follow-ups (board and report), tasks |
| `crm_customers` | page | Customers and the 360° view (also log follow-ups and add opportunities there) |
| `crm_pipeline` | page | Opportunities, quotations, orders won and lost |
| `crm_masters` | page | Sources and campaigns, product master, salespersons, settings |
| `crm_reports` | page | Reports and analytics |

No new actions: the generic `edit`, `delete`, `print` and `export` apply. Legacy had a "viewing as" dropdown with no real checks.

Defaults:
- **Super Admin and Admin:** everything.
- **Marketing:** dashboard, leads, follow-ups, customers and pipeline, with edit and print; no delete or export.
- **Management:** dashboard and reports, with print and export.
- **Dispatch:** nothing.

## 3. What carried over, and what changed

| Legacy | New |
|---|---|
| Dashboard: 8 KPIs, management alerts, funnel, source performance, overdue follow-ups, lost-reason split | Same. Every KPI opens its page. |
| Raw lead data: add, Excel import with preview and duplicate count, export, convert | Same. The import preview shows each row's problem or possible duplicate. |
| Lead management: stage summary and move stage | Same. The stage summary links to the filtered list. |
| Follow-ups: today's screen with call, WhatsApp, note, reschedule, complete; report with filters, charts and export | Same. Call is a `tel:` link. The board filters by salesperson. |
| Customer master with a 360° view: overview, opportunities, follow-ups, quotations, orders, timeline, quick follow-up, + opportunity | Same, plus a tasks tab and a link to the Sales party, which shows their Sales orders and invoices. |
| Opportunities with Won / Lost; quotations with print; orders won; orders lost with charts and reactivation | Same. |
| Tasks, campaigns with source performance, product master, salespersons with their figures | Same. |
| Settings: lost reasons, sources, lead-scoring note, audit trail | Same. The audit trail is its own page (the shared activity log). |
| Reports: follow-up report, product, city, salesperson won / lost, lead ageing, competitors, dormant customers | Same, narrowed by date and salesperson. The follow-up report lives on the Follow-ups page. |
| Global search, notification panel | The app's Ctrl K search and the sidebar badge (overdue + today's follow-ups). |

Legacy bugs fixed:
- **"Reactivate" could be pressed again and again.** Each press made another opportunity. Now it works once per lost order.
- **Won / lost could be recorded twice for one opportunity**, and a closed one could be put back to any stage. Now neither is possible; deleting the order reopens it.
- **The funnel counted opportunities only when their stage name matched a lead stage**, so opportunities at "Sample" were missed. Now "Sample" counts under "Sample Sent".
- **Duplicate checks compared mobiles as typed**, so "+91 98250 11111" didn't match "9825011111". The last 10 digits are compared now.

## 4. Data

- The legacy CRM kept its records on the old server (`/api/crm/state`), so there was nothing in the file to convert.
- Seeded everywhere: the legacy default products (6), salespersons (2), sources (18) and lost reasons (20).
- Dev also gets a small made-up demo set (`api/src/seed/crm-demo.dev.ts`) that exercises every screen.
- Importing the live CRM state is part of the DB-connect task.

## 5. Not in this module yet

- **Leads and customers are separate from the Sales party master.** A CRM customer can be linked to a Sales party by hand; there's no automatic matching yet.
- **Salespersons are CRM's own list.** Sales keeps its own list of sales persons in Sales settings, so the two aren't shared yet.
- **Calls and WhatsApp open the phone or WhatsApp; nothing is logged automatically.**

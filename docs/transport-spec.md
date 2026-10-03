# Transport module: functional spec

Rebuild of the legacy **Transport Module** (`legacy/transport/index.html`, 1,153 lines). Server code is in `api/src/modules/transport`, screens are in `web/src/modules/transport`, the schema is in `db/migrations/0012_transport.sql`, and the shared rules are in `api/src/contracts/transport.ts`.

## 1. The freight flow

Inquiry (INQ) → rate comparison (RC) → freight approval (FRA) → order form (SFO). Each step links to the others, and each screen shows the chain.

| Record | Number | What it records |
|---|---|---|
| Vehicle type | — | Name, description, capacity, active. Offered on inquiries and transporters, which store the name. |
| Transporter | TRP-26-001 | Contact person and two mobiles, email, address, city / state / pincode, GSTIN, PAN, TDS declaration, credit terms, bank (IFSC, bank, branch, account name and number), the vehicle types they run, operating cities, a 1–5 rating, active. |
| Inquiry | INQ-26-001 | Date, from and to (city, state, pincode), material, weight in MT, vehicle type, loading date, door or godown delivery, freight paid by Strandply or the party, an optional budget, remarks. |
| Rate comparison | RC-26-001 | One per inquiry. Each transporter's rate for the full load, transit time and minimum guarantee weight, the chosen quote, and a justification. |
| Freight approval | FRA-26-001 | The comparison's approval number, given when it's submitted, with the trail of who submitted, approved, rejected or reworked it. |
| Order form | SFO-26-001 | Issued from an approved comparison. It keeps a copy of the transporter's details and the shipment, so later master edits don't change it. Printable for the transporter to sign. Issued → delivered (with date) or cancelled. |

Numbers run per financial year (`TR-<prefix>-<fy>` counters). Transporter codes use one running counter (`TR-TRP`).

### Rules

- **Lowest and budget:**
  - The lowest quote is the lowest non-zero rate. A blank rate means "didn't quote".
  - Picking anything other than the lowest, or a rate above the inquiry's budget, needs a justification before submitting.
  - Such a comparison is approved as an *exception*, and the trail says so.
- **Editing:**
  - An inquiry and its comparison can be edited while the comparison is a draft or was rejected.
  - Once submitted (pending) or approved, both are fixed.
  - Editing a rejected comparison puts it back to draft, logs "reworked" in the trail, and reopens the inquiry.
- **Inquiry status follows the comparison:**
  - Open, then "rates compared" once submitted, then approved or rejected, then ordered.
  - Cancelling is blocked while the comparison waits for approval or has an order.
  - Reopening returns the inquiry to where its comparison stands.
- **Approval:** needs the `transport_approve` action. Rejecting needs a reason.
- **Order forms:**
  - One live order per approved comparison.
  - Cancelling an order (a reason can be noted) frees the comparison for a new one; the inquiry goes back to approved.
  - Marking delivered takes a date (today by default).
- **Suggestions:**
  - A new comparison starts with up to four active transporters that run the inquiry's vehicle. Those whose city or operating cities include either end of the route come first, then by rating.
  - "Past rates on this route" shows each transporter's latest quote on earlier comparisons with the same from city, to city and vehicle.
- **Masters:**
  - Renaming a vehicle type renames it on transporters too.
  - A type used on inquiries can only be deactivated.
  - A transporter who has quoted can only be deactivated.
  - Transporter names and codes are unique.

## 2. Access

| Key | Kind | Grants |
|---|---|---|
| `transport_dashboard` | page | Dashboard and audit trail |
| `transport_freight` | page | Inquiries, rate comparisons, approvals list, order forms (and reading the transporter list to pick from) |
| `transport_masters` | page | Transporters (with import and export) and vehicle types |
| `transport_reports` | page | Freight reports and the inquiry / order exports |
| `transport_approve` | action | Approve or reject a submitted comparison |

The generic `edit`, `delete`, `print` and `export` apply as usual.

Defaults:
- **Super Admin and Admin:** everything, including `transport_approve`.
- **Dispatch:** dashboard and freight, with edit and print. Dispatch can submit but not approve, and has no delete or export.
- **Management:** dashboard and reports, with print and export.
- **Marketing:** nothing.

Approvers get a sidebar badge with the number of comparisons waiting.

## 3. What carried over, and what changed

| Legacy | New |
|---|---|
| Dashboard with the four-step flow and counts | Dashboard with open inquiries, drafts, waiting for approval, in transit, freight this month and how often the lowest rate was chosen; what's waiting; recent inquiries. |
| Inquiries with city / pincode pickers | Same, using the shared city master. A new inquiry goes straight to its rate comparison. |
| Rate comparison: quotes, lowest marked, market-rate hint, justification, save draft, submit | Same. The hard-coded "market rates" are replaced by real past quotes on the same route and vehicle. |
| Freight approval: Dispatch → Accounts, approve / exception approve / reject with remarks, history | One approval by whoever has `transport_approve`. Exception is decided from the quotes rather than by which button was pressed. Rejected comparisons can be reworked and resubmitted. |
| Order form generation and print (linked IDs, transporter, route, material, confirmed rate, terms, signatures) | Same layout and terms, plus delivered and cancelled statuses. |
| Transporter master: search, operating-city / state / vehicle filters, add / edit, Excel upload, profile PDF | Same, plus export and an active filter. The import shows a preview first. |
| Vehicle master | Same, with rename and deactivate. |
| Freight reports (an empty placeholder) | Real reports: order forms, freight, delivered, lowest-rate share, exceptions, saving vs the highest quote, and freight by month, transporter, route and vehicle. Excel exports of inquiries and order forms. |

Legacy bugs fixed:
- **Anyone could approve.** Approvals were gated by a Dispatch / Accounts switch in the header that any user could flip. They now need the `transport_approve` permission.
- **Transporter codes came from the list length**, so a code could repeat after a delete. Codes now come from a counter.
- **Freight Reports was an empty page.** It now has real figures.

## 4. Data

- Legacy kept its records on the old server (`/api/transport/state`), with a browser cache. There was nothing in the file to convert.
- Seeded everywhere: the six legacy vehicle types.
- Dev also gets the four legacy sample transporters.
- Importing the live state is part of the DB-connect task.

## 5. Not in this module yet

- **Order forms don't link to Sales invoices or dispatches yet.** The roadmap's "trips carry sales invoices" waits for a shared dispatch link.
- **No payment tracking.** Freight bills, TDS deduction and payment to the transporter belong to Accounts.
- **The legacy IFSC lookup** (an outside bank-details API) isn't carried over. Bank details are typed in.

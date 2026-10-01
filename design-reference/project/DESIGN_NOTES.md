# Strandply ERP — design notes (from canvas)

Shared components

01 · SIGN IN

In the video: split card on a dark photo background, solid-red left panel labelled 'Internal ERP', user code + PIN, vendor credit in the footer.

Redrawn: flat #F5F6F8 page (the logo sits only on white / soft grey), full lockup on white, no red block. Added a firm switch (Strandply LLP / OSB Unit) since the build serves both. Red appears once — the Sign in button.

02 · HOME — MY WORK LIST

In the video: greeting, 6 KPI tiles (Production, Sales, Finished stock, Accounts, Purchase, People), a 'Pending my action' list with Open links (7 overdue · 322 in all), Go-to shortcuts, and an At-a-glance grid per module. Active nav item is a solid red bar; nav uses letter badges instead of icons.

Redrawn: outline icons in the sidebar with a red-light active state; KPI icons in neutral circles and only Payables due gets the red tint; pending list gains a Module column; overdue complaints flagged with a red dot; alerts and shortcuts move to a right rail.

03 · GLOBAL SEARCH (CTRL K)

In the video: palette over Home; typing 'lucknow' returns grouped Invoices and Sales orders with status pills, keyboard hints and a result count (19).

Redrawn: same pattern plus type filters (All, Invoices, Sales orders, GRNs, Customers, Vendors, Employees). 'Partial' moves from pink to purple (the no-blue info colour); Cancelled turns neutral so red stays scarce.

04 · STORES — GOODS RECEIPT (GRN)

In the video: GRN list with status tabs (All 43, Draft, Reviewed, Approved, Accounted 38, Rejected), filters, checkbox multi-select, and a bottom bar where Review, Approve, Account and Reject are ALL solid red. GRN numbers in red.

Redrawn: one primary (Approve), Reject as a danger outline, the rest secondary; doc numbers in primary text; selected rows tinted #FFF7F7; pills follow the workflow Reviewed (amber) → Approved (purple) → Accounted (green); Rejected red.

05 · SALES — GST TAX INVOICE

In the video: invoice detail with tabs (Invoice, Payment, e-Invoice, Files & history), actions Print/PDF, e-Invoice JSON, Receipt, Credit note and a solid-red Cancel invoice; GST invoice preview with IRN, bill-to / ship-to, e-way bill, vehicle, transporter.

Redrawn: A4 portrait preview in Inter, amounts as 'Rs.' (the PDF font has no ₹ glyph), a right rail for payment, e-Invoice and dispatch status. Cancel demoted to a danger outline; Record receipt is the one primary. Bank details left as placeholders.

06 · REPORTS — COST PER BOARD

In the video: plant-wide cost Apr–Sept 2026 — 12,803 good boards, ₹2.05 Cr, ₹1,602.89 per board, ₹538.46 per sqm, 4 of 6 months flagged; month table (material, power, PGVCL bill, labour, maintenance, other); raw material consumed; 'how this is worked out' notes.

Redrawn: added a cost-split bar (power ≈ 55% of cost) and an Inputs pill per month so flagged months are obvious.

07 · ACCOUNTS — GSTR-2B MATCH

In the video: 2B vs books reconciliation for Aug 2026 — 21 in 2B, 19 matched, 2 not in books, ₹67,787.06 ITC at risk; JSON/CSV import; tabs by mismatch type; 3 bills (Saurashtra Wood, Jay Ambe Paper, Rajkot Bearing).

Redrawn: coloured left-border cards replaced by tinted icons; ITC at risk is the one red KPI; per-row 'Remind supplier' action; totals row keeps taxable and tax together.

08 · SALES DASHBOARD

In the video: shown in dark mode — per-firm KPIs for Strandply LLP and OSB Unit, monthly sales bars, top customers and top SKUs, with red bars everywhere.

Redrawn in the light theme: bars neutral, only the current month red; Overdue is the single emphasised KPI per firm. Dark mode can be the same layout with swapped tokens.

Strandply ERP — screens from the video, redrawn to the design guideline


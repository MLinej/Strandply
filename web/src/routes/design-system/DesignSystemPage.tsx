import {
  AlertTriangle,
  Download,
  FileJson,
  IndianRupee,
  Package,
  Printer,
  Search,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Factory,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Input,
  KpiTile,
  Modal,
  Pill,
  Select,
  Skeleton,
  SkeletonText,
  StatusPill,
  Tabs,
  useToast,
} from '@/components/ui';
import { PrimaryScope } from '@/lib/primary-scope';
import { STATUS_TONE, type Status } from '@/lib/status';
import { GrnDemo } from './GrnDemo';

const SECTIONS = [
  ['rules', 'Rules'],
  ['colour', 'Colour'],
  ['type', 'Typography'],
  ['shape', 'Radius, size & shadow'],
  ['button', 'Button'],
  ['input', 'Input & Select'],
  ['card', 'Card'],
  ['kpi', 'KPI tile'],
  ['pill', 'Status pill'],
  ['tabs', 'Tabs'],
  ['table', 'Data table'],
  ['modal', 'Modal'],
  ['toast', 'Toast'],
  ['empty', 'Empty state'],
  ['skeleton', 'Skeleton'],
] as const;

export default function DesignSystemPage() {
  return (
    <div className="mx-auto flex max-w-[1400px] gap-8 px-6 py-6">
      <nav aria-label="Sections" className="sticky top-6 hidden h-fit w-44 shrink-0 flex-col gap-0.5 lg:flex">
        <div className="label-caps mb-2 px-2.5">Design system</div>
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-md px-2.5 py-1.5 text-base font-medium text-muted hover:bg-card hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <main className="flex min-w-0 flex-1 flex-col gap-12">
        <header className="flex flex-col gap-1">
          <h1 className="text-h1 font-bold tracking-tight">Strandply design system</h1>
          <p className="text-base text-muted">
            Tokens and components measured from design-reference/project. Every demo box is its own screen, so each one shows at most one red action.
          </p>
        </header>

        <Section id="rules" title="Rules">
          <div className="grid gap-3.5 md:grid-cols-2">
            <Rule title="Red appears once per screen">
              Only the single primary action is filled red. Everything else is secondary. Destructive actions (Cancel invoice, Reject) are danger-outline. In development a second primary in the same scope logs a console error.
            </Rule>
            <Rule title="No blue, anywhere">
              Purple is the info colour (Approved, Partial). Focus is an ink border or outline. The Tailwind palette is replaced, so <code className="text-sm">bg-blue-500</code> or <code className="text-sm">text-red-600</code> won’t compile to anything.
            </Rule>
            <Rule title="Status colour comes from one map">
              Screens pass a status to <code className="text-sm">&lt;StatusPill&gt;</code> and never choose a colour. Draft → Reviewed (amber) → Approved (purple) → Accounted (green); Rejected red; Cancelled neutral.
            </Rule>
            <Rule title="One emphasised figure per group">
              KPI rows use neutral icon circles. Only the figure that needs attention (Payables due, ITC at risk, Overdue) gets the red tint.
            </Rule>
          </div>
        </Section>

        <Section id="colour" title="Colour" note="CSS variables in styles/tokens.css, mapped in tailwind.config.ts.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <Swatch name="primary" hex="#D71920" use="The one primary action, active nav" className="bg-primary" />
            <Swatch name="primary-light" hex="#FFF1F2" use="Active nav / page, bad KPI circle" className="bg-primary-light" />
            <Swatch name="primary-tint" hex="#FFF7F7" use="Selected table rows" className="bg-primary-tint" />
            <Swatch name="primary-border" hex="#F3C4C6" use="Danger-outline border" className="bg-primary-border" />
            <Swatch name="ink" hex="#172033" use="Text, doc numbers, focus" className="bg-ink" />
            <Swatch name="muted" hex="#667085" use="Secondary text, headers" className="bg-muted" />
            <Swatch name="faint" hex="#98A2B3" use="Meta, placeholders" className="bg-faint" />
            <Swatch name="border" hex="#E6E8EC" use="Cards, controls" className="bg-border" />
            <Swatch name="divider" hex="#EEF0F3" use="Row separators" className="bg-divider" />
            <Swatch name="subtle" hex="#F5F6F8" use="Neutral pills, icon circles" className="bg-subtle" />
            <Swatch name="page" hex="#F8F9FA" use="App background, table header" className="bg-page" />
            <Swatch name="card" hex="#FFFFFF" use="Surfaces" className="bg-card" />
            <Swatch name="amber" hex="#D97706 / #FFFBEB" use="Reviewed, Open, warnings" className="bg-amber" />
            <Swatch name="green" hex="#16A34A / #F0FDF4" use="Accounted, Active, Matched" className="bg-green" />
            <Swatch name="purple" hex="#7C3AED / #F5F3FF" use="Approved, Partial, info" className="bg-purple" />
          </div>
        </Section>

        <Section id="type" title="Typography" note="Inter 400 / 500 / 600 / 700, self-hosted. Numbers in tables and KPIs use tabular figures.">
          <Card flush>
            <div className="divide-y divide-divider">
              <TypeRow token="text-h1" spec="24 / 700 / −0.2" className="text-h1 font-bold tracking-tight" sample="Invoice LLP/26-27/0096" />
              <TypeRow token="text-kpi" spec="22 / 700" className="text-kpi font-bold tabular-nums" sample="₹16,86,956" />
              <TypeRow token="text-kpi-sm" spec="20 / 700" className="text-kpi-sm font-bold tabular-nums" sample="₹10.68 L" />
              <TypeRow token="text-xl" spec="16 / 600" className="text-xl font-semibold" sample="Strandply LLP" />
              <TypeRow token="text-title" spec="15 / 600" className="text-title font-semibold" sample="Pending my action" />
              <TypeRow token="text-lg" spec="14" className="text-lg" sample="Sign-in inputs and button" />
              <TypeRow token="text-md" spec="13.5" className="text-md font-medium" sample="Tabs · Invoice · Payments · e-Invoice" />
              <TypeRow token="text-base" spec="13 — default" className="text-base" sample="Store count against gate entries — review → approval → accounting" />
              <TypeRow token="text-sm" spec="12.5" className="text-sm" sample="Table body · Ahmedabad Industrial Stores · 99,120.00" />
              <TypeRow token="text-meta" spec="12" className="text-meta text-muted" sample="Strandply LLP · next 7 days" />
              <TypeRow token="text-caption" spec="11.5" className="text-caption text-muted" sample="↑ ↓ move · Enter open · Esc close" />
              <TypeRow token="label-caps" spec="11 / 600 / +0.4 / upper" className="label-caps" sample="GRN no. · Vendor · Taxable" />
              <TypeRow token="text-label-sm" spec="10.5 / 500 / upper" className="text-label-sm font-medium uppercase tracking-label text-faint" sample="Collections MTD" />
            </div>
          </Card>
        </Section>

        <Section id="shape" title="Radius, size & shadow">
          <div className="grid gap-3.5 md:grid-cols-3">
            <Card title="Radius">
              <div className="flex flex-wrap items-end gap-4">
                {[
                  ['rounded-sm', '4', 'rounded-sm'],
                  ['rounded-md', '6', 'rounded-md'],
                  ['rounded-pager', '7', 'rounded-pager'],
                  ['rounded', '8', 'rounded'],
                  ['rounded-lg', '12', 'rounded-lg'],
                  ['rounded-full', 'pill', 'rounded-full'],
                ].map(([token, px, cls]) => (
                  <div key={token} className="flex flex-col items-center gap-1.5">
                    <div className={`h-12 w-12 border border-border bg-subtle ${cls}`} />
                    <span className="text-caption text-muted">{px}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Heights">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {[
                  ['h-ctl-sm', '32 · toolbar & bulk-bar buttons'],
                  ['h-ctl', '36 · buttons, inputs, selects'],
                  ['h-ctl-lg', '42 · sign-in inputs'],
                  ['h-ctl-xl', '44 · sign-in button'],
                  ['h-row-head', '34 · table header'],
                  ['h-row', '38 · table row, tabs'],
                  ['h-topbar', '60 · top bar'],
                  ['w-sidebar', '232 · sidebar'],
                ].map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-semibold">{k}</dt>
                    <dd className="text-muted">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card title="Spacing & shadow">
              <p className="text-sm text-muted">
                Tailwind’s 4px scale plus the mockups’ off-grid steps: 3, 5, 7, 11, 18 (4.5), 22 (5.5). Page padding 24; card gaps 14–16; toolbar gaps 8–10.
              </p>
              <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm shadow-overlay">shadow-overlay: modal, palette, toast only</div>
            </Card>
          </div>
        </Section>

        <Section id="button" title="Button" note="primary · secondary · danger-outline, plus ghost for text actions (Clear, Save this view).">
          <Demo title="Variants">
            <Button variant="primary">Approve</Button>
            <Button>Review</Button>
            <Button variant="danger-outline">Reject</Button>
            <Button variant="ghost">Save this view</Button>
          </Demo>
          <div className="grid gap-3.5 md:grid-cols-3">
            {(['sm', 'md', 'lg'] as const).map((size) => (
              <Demo key={size} title={`${size} · ${size === 'sm' ? 32 : size === 'md' ? 36 : 44}px`}>
                <Button size={size} variant="primary">
                  Save
                </Button>
                <Button size={size}>Cancel</Button>
                <Button size={size} variant="danger-outline">
                  Delete
                </Button>
              </Demo>
            ))}
          </div>
          <Demo title="With icon · loading · disabled">
            <Button icon={Download}>Export CSV</Button>
            <Button variant="primary" loading>
              Saving
            </Button>
            <Button disabled>Account</Button>
            <Button variant="danger-outline" disabled>
              Reject
            </Button>
          </Demo>
          <Demo title="In context: invoice header (one primary; Cancel demoted to danger-outline)">
            <Button icon={Printer}>Print / PDF</Button>
            <Button icon={FileJson}>e-Invoice JSON</Button>
            <Button>Credit note</Button>
            <Button variant="danger-outline">Cancel invoice</Button>
            <Button variant="primary" icon={IndianRupee}>
              Record receipt
            </Button>
          </Demo>
        </Section>

        <Section id="input" title="Input & Select" note="36px, 8px radius, ink border on focus. Sign-in uses the 42px size on page-grey.">
          <Demo title="Input" grid>
            <Input label="Vendor invoice no." placeholder="e.g. S001/26-27/440" />
            <Input label="Search" icon={Search} placeholder="GRN, MRN, invoice or item" />
            <Input label="Quantity" suffix="kg" inputMode="decimal" defaultValue="3,57,600" />
            <Input label="GSTIN" defaultValue="24ABPFS4321Q1Z" error="GSTIN must be 15 characters" />
            <Input label="Due date" type="date" hint="Defaults to 30 days from invoice date" />
            <Input label="Firm" defaultValue="Strandply LLP" disabled />
          </Demo>
          <Demo title="Select" grid>
            <Select label="Vendor" placeholder="All vendors" options={VENDOR_OPTIONS} />
            <Select label="Return period" defaultValue="2026-08" options={PERIODS} />
            <Select label="Transporter" placeholder="Choose transporter" options={[]} error="Required for e-way bill" />
          </Demo>
          <Demo title="Large · sign-in" grid>
            <Input size="lg" label="User code" placeholder="e.g. ACC01" />
            <Input size="lg" label="PIN" type="password" placeholder="4-digit PIN" inputMode="numeric" />
          </Demo>
        </Section>

        <Section id="card" title="Card">
          <div className="grid gap-3.5 md:grid-cols-[2fr_1fr]">
            <Card
              flush
              title="Pending my action"
              actions={
                <>
                  <Pill tone="red" size="md">
                    7 overdue
                  </Pill>
                  <Pill size="md">322 in all</Pill>
                </>
              }
            >
              <div className="label-caps grid h-row-head grid-cols-[1fr_140px_70px_80px] items-center border-y border-border bg-page px-5">
                <div>Item</div>
                <div>Module</div>
                <div className="text-right">Count</div>
                <div />
              </div>
              {[
                ['Complaints past resolution date', 'Complaints', 7, true],
                ['GRNs to approve', 'Stores', 1, false],
                ['GRNs to account', 'Stores', 3, false],
                ['Shifts to approve', 'Production', 1, false],
              ].map(([label, module, count, critical]) => (
                <div key={label as string} className="grid h-row grid-cols-[1fr_140px_70px_80px] items-center border-b border-divider px-5 text-base last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${critical ? 'bg-primary' : ''}`} />
                    <span className={critical ? 'font-semibold text-primary' : 'font-medium'}>{label}</span>
                  </div>
                  <div className="text-muted">{module}</div>
                  <div className="text-right font-semibold tabular-nums">{count}</div>
                  <a href="#card" className="text-right text-sm font-semibold">
                    Open ›
                  </a>
                </div>
              ))}
            </Card>
            <Card title="Alerts">
              <div className="flex flex-col gap-3">
                <Alert tone="text-primary" title="7 complaints are past their resolution date" meta="Complaints · today" />
                <Alert tone="text-amber" title="4 store items at or below minimum" meta="Stores · today" />
                <Alert tone="text-amber" title="4 trips delayed" meta="Transport · today" />
              </div>
            </Card>
          </div>
        </Section>

        <Section id="kpi" title="KPI tile" note="Neutral icon circles; only one emphasised figure per row.">
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
            <KpiTile icon={Factory} label="Production" value="0" meta="Good boards yesterday" />
            <KpiTile icon={TrendingUp} label="Sales" value="₹12,60,741" meta="Strandply LLP · this month" />
            <KpiTile icon={Package} label="Finished stock" value="24,438" meta="Boards in hand" />
            <KpiTile icon={Wallet} label="Payables due" value="₹16,86,956" meta="Strandply LLP · next 7 days" emphasis="bad" />
            <KpiTile icon={ShoppingCart} label="Purchase" value="₹40,77,741" meta="Purchases this month" />
            <KpiTile icon={Users} label="People" value="55" meta="Active employees" />
          </div>
          <div className="label-caps mt-2">Compact · Sales dashboard</div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
            <KpiTile variant="compact" label="Sales MTD" value="₹10.68 L" meta="13 invoices · ₹12.61 L incl. GST" />
            <KpiTile variant="compact" label="Sales FYTD" value="₹70.60 L" meta="94 invoices" />
            <KpiTile variant="compact" label="Collections MTD" value="₹11.75 L" meta="Incl. TDS" />
            <KpiTile variant="compact" label="Outstanding" value="₹32.05 L" meta="All customers" />
            <KpiTile variant="compact" label="Overdue" value="₹16.50 L" meta="Past due date" emphasis="bad" />
            <KpiTile variant="compact" label="Orders on hold" value="1" meta="Credit hold" emphasis="warn" />
            <KpiTile variant="compact" label="Open order value" value="₹3.09 L" meta="Uninvoiced, incl. GST" />
            <KpiTile variant="compact" label="Margin MTD" value="₹2.22 L" meta="At standard cost" />
          </div>
        </Section>

        <Section id="pill" title="Status pill" note="20px, 11/600. Colour from lib/status.ts: pass the status, never the colour.">
          <Demo title="GRN workflow">
            {(['Draft', 'Reviewed', 'Approved', 'Accounted', 'Rejected', 'Cancelled'] as const).map((s) => (
              <StatusPill key={s} status={s} />
            ))}
          </Demo>
          <Demo title="All mapped statuses">
            {(Object.keys(STATUS_TONE) as Status[]).map((s) => (
              <StatusPill key={s} status={s} />
            ))}
          </Demo>
          <Demo title="Count pills (22px, card headers)">
            <Pill tone="red" size="md">
              7 overdue
            </Pill>
            <Pill size="md">322 in all</Pill>
            <Pill tone="amber" size="md">
              PGVCL: 2 months
            </Pill>
          </Demo>
        </Section>

        <Section id="tabs" title="Tabs">
          <TabsDemo />
        </Section>

        <Section id="table" title="Data table" note="Sortable headers, checkbox selection tinted #FFF7F7, bulk bar (its own primary scope), pagination, loading and empty states.">
          <TableDemo />
        </Section>

        <Section id="modal" title="Modal" note="Native <dialog>: focus trap, Esc and inert background built in. Its own primary scope.">
          <ModalDemo />
        </Section>

        <Section id="toast" title="Toast" note="Bottom-right, auto-dismiss (errors stay longer), pauses on hover.">
          <ToastDemo />
        </Section>

        <Section id="empty" title="Empty state">
          <div className="grid gap-3.5 md:grid-cols-2">
            <Card>
              <EmptyState
                icon={Truck}
                title="No trips in transit"
                description="Trips appear here once a dispatch is loaded and the vehicle leaves the gate."
              />
            </Card>
            <Card>
              <PrimaryScope name="empty-demo">
                <EmptyState
                  icon={AlertTriangle}
                  title="No GSTR-2B imported for August 2026"
                  description="Drop the 2B JSON from the GST portal, or a CSV, to match it against your books."
                  action={<Button variant="primary">Import GSTR-2B</Button>}
                />
              </PrimaryScope>
            </Card>
          </div>
        </Section>

        <Section id="skeleton" title="Skeleton">
          <div className="grid gap-3.5 md:grid-cols-3">
            <KpiTile icon={Wallet} label="Payables due" value="" loading meta="Strandply LLP · next 7 days" />
            <Card title="Alerts">
              <SkeletonText lines={4} />
            </Card>
            <Card title="Shapes">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8.5 w-8.5 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            </Card>
          </div>
        </Section>
      </main>
    </div>
  );
}

/* ——— demos ——— */

function TabsDemo() {
  const [grn, setGrn] = useState('All');
  const [inv, setInv] = useState('invoice');
  return (
    <div className="grid gap-3.5 md:grid-cols-2">
      <Demo title="Status tabs with counts (filter a table below)">
        <Tabs
          aria-label="GRN status"
          value={grn}
          onChange={setGrn}
          className="w-full"
          items={[
            { value: 'All', label: 'All', count: 43 },
            { value: 'Draft', label: 'Draft', count: 0 },
            { value: 'Reviewed', label: 'Reviewed', count: 1 },
            { value: 'Approved', label: 'Approved', count: 3 },
            { value: 'Accounted', label: 'Accounted', count: 38 },
          ]}
        />
      </Demo>
      <Demo title="Document tabs with a panel">
        <Tabs
          aria-label="Invoice sections"
          value={inv}
          onChange={setInv}
          className="w-full"
          items={[
            { value: 'invoice', label: 'Invoice' },
            { value: 'payments', label: 'Payments', count: 0 },
            { value: 'einvoice', label: 'e-Invoice' },
            { value: 'history', label: 'Files & history' },
          ]}
        >
          <p className="text-base text-muted">
            Panel for <span className="font-semibold text-ink">{inv}</span>. Use ← → to move between tabs.
          </p>
        </Tabs>
      </Demo>
    </div>
  );
}

function TableDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={loading} onChange={(e) => setLoading(e.target.checked)} />
        Show loading state
      </label>
      <div className="rounded-lg border border-dashed border-border bg-page p-4">
        <GrnDemo loading={loading} />
      </div>
      <p className="text-meta text-muted">
        Try it: select rows across statuses and press Approve. Only Reviewed GRNs move; the rest stay selected and are listed in the toast. Search “xyz” for the empty state.
      </p>
    </div>
  );
}

function ModalDemo() {
  const toast = useToast();
  const [receipt, setReceipt] = useState(false);
  const [reject, setReject] = useState(false);
  return (
    <Demo title="Examples">
      <Button onClick={() => setReceipt(true)}>Open “Record receipt”</Button>
      <Button onClick={() => setReject(true)}>Open “Reject GRNs”</Button>

      <Modal
        open={receipt}
        onClose={() => setReceipt(false)}
        closeOnBackdrop={false}
        title="Record receipt"
        description="LLP/26-27/0096 · Pune Modular Kitchens · balance ₹1,10,719.40"
        footer={
          <>
            <Button onClick={() => setReceipt(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setReceipt(false);
                toast({ title: 'Receipt recorded', description: 'RCPT/26-27/0212 · ₹1,10,719.40' });
              }}
            >
              Record receipt
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input label="Amount" defaultValue="1,10,719.40" suffix="₹" inputMode="decimal" />
          <Input label="Date" type="date" defaultValue="2026-09-30" />
          <Select label="Mode" defaultValue="neft" options={[{ value: 'neft', label: 'NEFT / RTGS' }, { value: 'cheque', label: 'Cheque' }, { value: 'upi', label: 'UPI' }]} />
          <Input label="Reference" placeholder="UTR or cheque no." />
          <Input label="TDS deducted" defaultValue="0.00" suffix="₹" containerClassName="sm:col-span-2" hint="Leave 0 if the customer paid in full" />
        </div>
      </Modal>

      <Modal
        open={reject}
        onClose={() => setReject(false)}
        size="sm"
        title="Reject 2 GRNs?"
        description="GRN/26-27/0041 and GRN/26-27/0039 go back to the store. Stock is not posted."
        footer={
          <>
            <Button onClick={() => setReject(false)}>Keep</Button>
            <Button
              variant="danger-outline"
              onClick={() => {
                setReject(false);
                toast({ tone: 'error', title: '2 GRNs rejected' });
              }}
            >
              Reject
            </Button>
          </>
        }
      >
        <Input label="Reason" placeholder="e.g. quantity short against invoice" />
      </Modal>
    </Demo>
  );
}

function ToastDemo() {
  const toast = useToast();
  return (
    <Demo title="Tones">
      <Button onClick={() => toast({ title: 'GRN/26-27/0043 approved' })}>Success</Button>
      <Button onClick={() => toast({ tone: 'warning', title: '3 GRNs approved', description: '2 skipped: GRN/26-27/0038, GRN/26-27/0037 are already accounted.' })}>
        Warning
      </Button>
      <Button onClick={() => toast({ tone: 'error', title: 'Couldn’t save the invoice', description: 'The e-way bill number is already used on LLP/26-27/0085.' })}>
        Error
      </Button>
      <Button onClick={() => toast({ tone: 'info', title: 'GSTR-2B import started', description: 'Matching 21 invoices for August 2026.' })}>Info</Button>
    </Demo>
  );
}

/* ——— page scaffolding ——— */

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3.5">
      <div className="flex flex-col gap-0.5 border-b border-border pb-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** A bordered demo surface. Each one is its own primary scope ("screen"). */
function Demo({ title, grid, children }: { title: string; grid?: boolean; children: ReactNode }) {
  return (
    <PrimaryScope name={title}>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="label-caps mb-3">{title}</div>
        <div className={grid ? 'grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3' : 'flex flex-wrap items-center gap-2'}>{children}</div>
      </div>
    </PrimaryScope>
  );
}

function Rule({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4.5 py-4">
      <div className="text-base font-semibold">{title}</div>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}

function Swatch({ name, hex, use, className }: { name: string; hex: string; use: string; className: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className={`h-14 border-b border-border ${className}`} />
      <div className="px-3 py-2.5">
        <div className="text-sm font-semibold">{name}</div>
        <div className="text-caption tabular-nums text-muted">{hex}</div>
        <div className="mt-0.5 text-caption text-faint">{use}</div>
      </div>
    </div>
  );
}

function TypeRow({ token, spec, className, sample }: { token: string; spec: string; className: string; sample: string }) {
  return (
    <div className="grid items-baseline gap-2 px-5 py-3 md:grid-cols-[150px_170px_1fr]">
      <code className="text-sm font-semibold">{token}</code>
      <span className="text-meta text-muted">{spec}</span>
      <span className={`truncate ${className}`}>{sample}</span>
    </div>
  );
}

function Alert({ tone, title, meta }: { tone: string; title: string; meta: string }) {
  return (
    <div className="flex gap-2.5">
      <AlertTriangle size={17} strokeWidth={1.8} className={`mt-px shrink-0 ${tone}`} aria-hidden />
      <div>
        <div className="text-base font-medium">{title}</div>
        <div className="mt-0.5 text-caption text-faint">{meta}</div>
      </div>
    </div>
  );
}

const VENDOR_OPTIONS = ['Ahmedabad Industrial Stores', 'Mumbai Hydraulics & Lubes', 'Rajkot Bearing Centre', 'Surat Packaging Materials'].map((v) => ({ value: v, label: v }));
const PERIODS = [
  { value: '2026-09', label: 'September 2026' },
  { value: '2026-08', label: 'August 2026' },
  { value: '2026-07', label: 'July 2026' },
];

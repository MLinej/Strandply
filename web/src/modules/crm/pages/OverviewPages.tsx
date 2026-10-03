import { History, Plus, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { ActivityEntryView } from '@contracts/admin';
import type { CampaignView, CrmProduct, Salesperson, SalespersonView } from '@contracts/crm';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, Pagination, Pill, Select, Skeleton, useToast, type Column } from '@/components/ui';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { BarList } from '../../purchase/ui';
import { useCrmAudit, useCrmDashboard, useCrmMeta, useCrmReports, useSalespersonStats, useSaveCrmSettings, useSources } from '../api';
import { RecordList } from '../components/RecordList';
import { CAMPAIGN_FIELDS, PRODUCT_FIELDS, SALESPERSON_FIELDS } from '../fields';
import { d, inr, lakh, stamp } from '../ui';

const TONE = { red: 'red', amber: 'amber', green: 'green' } as const;

/** CRM dashboard (legacy dashboard): KPIs, management alerts, funnel, sources, overdue follow-ups, lost reasons. */
export function DashboardPage() {
  const v = useCrmDashboard().data;
  if (!v) return <Skeleton className="m-6 h-96" />;
  const tile = (to: string, label: string, value: string, meta: string) => (
    <Link to={`/crm/${to}`} className="block rounded-lg focus-visible:outline focus-visible:outline-2">
      <KpiTile label={label} value={value} meta={meta} />
    </Link>
  );
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="CRM dashboard" description="Leads, pipeline and follow-ups for the marketing and sales team." />
      <div className="grid gap-3 sm:grid-cols-4">
        {tile('leads', 'Leads', String(v.leads), `${v.qualified} qualified`)}
        {tile('opportunities', 'Open opportunities', String(v.openOpps), `${lakh(v.pipelinePaise)} pipeline`)}
        {tile('followups', 'Follow-ups today', String(v.dueToday), `${v.overdue} overdue`)}
        {tile('quotations', 'Quotations sent', String(v.quotesSent), `${v.quotes} in all`)}
        {tile('won', 'Orders won', String(v.won), lakh(v.wonPaise))}
        {tile('lost', 'Orders lost', String(v.lost), lakh(v.lostPaise))}
        {tile('customers', 'Active customers', String(v.customers), 'In the customer list')}
        {tile('followups', 'Overdue follow-ups', String(v.overdue), 'Need attention')}
      </div>
      {v.alerts.length > 0 && (
        <Card title="Management alerts">
          <ul className="flex flex-col gap-2" aria-label="Management alerts">
            {v.alerts.map((a) => (
              <li key={a.text}>
                <Link to={`/crm/${a.page}`} className="flex items-center gap-2 text-base hover:underline">
                  <Pill tone={TONE[a.tone]}>{a.tone === 'red' ? 'Act' : a.tone === 'amber' ? 'Watch' : 'Opportunity'}</Pill>
                  {a.text}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card title="Sales funnel">
          <BarList rows={v.funnel.map((f) => ({ label: f.name, value: f.value }))} format={String} />
        </Card>
        <Card title="Overdue follow-ups">
          {v.overdueList.length ? (
            <ul className="flex flex-col divide-y divide-divider">
              {v.overdueList.map((f) => (
                <li key={f.id} className="py-1.5">
                  <Link to={`/crm/customers?open=${f.customerId}`} className="font-medium hover:underline">
                    {f.customerName}
                  </Link>
                  <span className="block text-caption text-muted">
                    {f.nextAction ?? 'Follow up'} · due {d(f.due)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No overdue follow-ups.</p>
          )}
        </Card>
        <Card title="Lead sources">
          <BarList rows={v.sources.map((s) => ({ label: s.name, value: s.value }))} format={String} empty="No leads yet" />
        </Card>
        <Card title="Lost reasons">
          <BarList rows={v.lostReasons.map((s) => ({ label: s.name, value: s.value }))} format={String} empty="No lost orders yet" />
        </Card>
      </div>
    </div>
  );
}

/** Marketing sources & campaigns (legacy campaigns): which activity brings business. */
export function CampaignsPage() {
  const sources = useSources().data;
  const columns: Column<CampaignView>[] = [
    { id: 'name', header: 'Campaign', className: 'font-medium', cell: (c) => c.name },
    { id: 'platform', header: 'Platform', width: '130px', className: 'text-sm', cell: (c) => c.platform ?? '—' },
    { id: 'dates', header: 'Runs', width: '200px', className: 'tabular-nums text-sm', cell: (c) => (c.startDate || c.endDate ? `${d(c.startDate)} – ${d(c.endDate)}` : '—') },
    { id: 'product', header: 'Product', width: '130px', className: 'text-sm', cell: (c) => c.product ?? '—' },
    { id: 'budget', header: 'Budget', width: '110px', align: 'right', className: 'tabular-nums', cell: (c) => inr(c.budgetPaise) },
    { id: 'leads', header: 'Leads', width: '70px', align: 'right', className: 'tabular-nums', cell: (c) => c.leads },
    { id: 'cpl', header: 'Cost / lead', width: '110px', align: 'right', className: 'tabular-nums', cell: (c) => inr(c.costPerLeadPaise) },
  ];
  return (
    <RecordList
      kind="campaigns"
      title="Sources & campaigns"
      description="Source → leads → qualified → quotations → won → revenue, and what each campaign cost per lead (leads name their campaign)."
      noun="campaign"
      columns={columns}
      fields={CAMPAIGN_FIELDS}
      searchPlaceholder="Campaign, platform"
      above={
        <Card title="Source performance">
          <DataTable
            label="Source performance"
            minWidth={760}
            columns={[
              { id: 's', header: 'Source', className: 'font-medium', cell: (r) => r.source },
              { id: 'l', header: 'Leads', width: '80px', align: 'right', className: 'tabular-nums', cell: (r) => r.leads },
              { id: 'q', header: 'Qualified', width: '90px', align: 'right', className: 'tabular-nums', cell: (r) => r.qualified },
              { id: 'qt', header: 'Quotations', width: '100px', align: 'right', className: 'tabular-nums', cell: (r) => r.quotations },
              { id: 'w', header: 'Won', width: '70px', align: 'right', className: 'tabular-nums', cell: (r) => r.won },
              { id: 'x', header: 'Lost', width: '70px', align: 'right', className: 'tabular-nums', cell: (r) => r.lost },
              { id: 'rev', header: 'Revenue', width: '130px', align: 'right', className: 'font-semibold tabular-nums', cell: (r) => inr(r.revenuePaise) },
            ]}
            rows={sources ?? []}
            getRowId={(r) => r.source}
            loading={!sources}
            empty={<EmptyState icon={History} title="No source activity yet" />}
          />
        </Card>
      }
    />
  );
}

/** Product master (legacy products). */
export function ProductsPage() {
  const columns: Column<CrmProduct>[] = [
    { id: 'name', header: 'Product', className: 'font-medium', cell: (p) => p.name },
    { id: 'thic', header: 'Thickness', width: '140px', className: 'text-sm', cell: (p) => p.thickness ?? '—' },
    { id: 'size', header: 'Size', width: '100px', className: 'text-sm', cell: (p) => p.size ?? '—' },
    { id: 'grade', header: 'Grade', width: '110px', className: 'text-sm', cell: (p) => p.grade ?? '—' },
    { id: 'app', header: 'Application', width: '200px', className: 'text-sm', cell: (p) => p.application ?? '—' },
    { id: 'rate', header: 'Standard rate', width: '120px', align: 'right', className: 'tabular-nums', cell: (p) => (p.ratePaise ? inr(p.ratePaise) : '—') },
    { id: 'moq', header: 'MOQ', width: '100px', className: 'text-sm', cell: (p) => p.moq ?? '—' },
    { id: 'st', header: 'Status', width: '90px', cell: (p) => (p.active ? <Pill tone="green">Active</Pill> : <Pill>Inactive</Pill>) },
  ];
  return <RecordList kind="products" title="Product master" description="Products offered in leads, opportunities and quotations. Add new ones any time." noun="product" columns={columns} fields={PRODUCT_FIELDS} newInitial={{ active: true }} searchPlaceholder="Product" />;
}

/** Salesperson management (legacy salespersons): territory and each person's pipeline. */
export function SalespersonsPage() {
  const stats = new Map((useSalespersonStats().data ?? []).map((s) => [s.id, s]));
  const st = (id: string) => stats.get(id) as SalespersonView | undefined;
  const columns: Column<Salesperson>[] = [
    { id: 'name', header: 'Name', className: 'font-medium', cell: (p) => p.name },
    { id: 'terr', header: 'Territory', width: '130px', className: 'text-sm', cell: (p) => p.territory ?? '—' },
    { id: 'des', header: 'Designation', width: '150px', className: 'text-sm', cell: (p) => p.designation ?? '—' },
    { id: 'leads', header: 'Leads', width: '70px', align: 'right', className: 'tabular-nums', cell: (p) => st(p.id)?.leads ?? '—' },
    { id: 'od', header: 'Overdue', width: '80px', align: 'right', className: 'tabular-nums', cell: (p) => st(p.id)?.overdue ?? '—' },
    { id: 'pipe', header: 'Pipeline', width: '120px', align: 'right', className: 'tabular-nums', cell: (p) => (st(p.id) ? lakh(st(p.id)!.pipelinePaise) : '—') },
    { id: 'won', header: 'Won', width: '120px', align: 'right', className: 'tabular-nums', cell: (p) => (st(p.id) ? `${st(p.id)!.won} · ${lakh(st(p.id)!.wonPaise)}` : '—') },
    { id: 'st', header: 'Status', width: '90px', cell: (p) => (p.active ? <Pill tone="green">Active</Pill> : <Pill>Inactive</Pill>) },
  ];
  return (
    <RecordList
      kind="salespersons"
      title="Salespersons"
      description="Who owns leads and customers, with their open pipeline and orders won. Names are what leads and customers store."
      noun="salesperson"
      columns={columns}
      fields={SALESPERSON_FIELDS}
      newInitial={{ active: true }}
      searchPlaceholder="Name, territory"
    />
  );
}

/** A name list edited as chips (legacy Lost Reasons / Marketing Sources masters). */
function ListMaster({ title, hint, items, onSave, editable }: { title: string; hint: string; items: string[]; onSave: (next: string[]) => Promise<void>; editable: boolean }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  return (
    <Card title={title} description={hint}>
      <div className="mb-3 flex flex-wrap gap-1.5" aria-label={title}>
        {items.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full border border-border bg-page px-2.5 py-0.5 text-sm">
            {t}
            {editable && items.length > 1 && (
              <button type="button" aria-label={`Remove ${t}`} className="text-faint hover:text-primary" onClick={() => void onSave(items.filter((x) => x !== t))}>
                <X size={12} aria-hidden />
              </button>
            )}
          </span>
        ))}
      </div>
      {editable && (
        <form
          className="flex items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = value.trim();
            if (!v) return;
            if (items.some((x) => x.toLowerCase() === v.toLowerCase())) return setError('Already in the list');
            void onSave([...items, v]).then(() => {
              setValue('');
              setError(undefined);
            });
          }}
        >
          <Input aria-label={`New ${title.toLowerCase()}`} value={value} onChange={(e) => setValue(e.target.value)} error={error} containerClassName="flex-1" />
          <Button type="submit" icon={Plus}>
            Add
          </Button>
        </form>
      )}
    </Card>
  );
}

/** Master settings (legacy settings): lost reasons, marketing sources, lead-scoring note. */
export function SettingsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const meta = useCrmMeta().data;
  const save = useSaveCrmSettings();
  const run = async (input: { sources?: string[]; lostReasons?: string[] }) => {
    try {
      await save.mutateAsync(input);
      toast({ tone: 'success', title: 'Saved' });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  };
  if (!meta) return <Skeleton className="m-6 h-96" />;
  return (
    <div className="flex max-w-5xl flex-col gap-3.5 p-6">
      <PageHeader title="CRM settings" description="Lists offered in the CRM forms. Records keep the name they were saved with." />
      <div className="grid gap-3.5 lg:grid-cols-2">
        <ListMaster title="Marketing sources" hint="Where leads come from." items={meta.sources} onSave={(sources) => run({ sources })} editable={canDo('edit')} />
        <ListMaster title="Lost reasons" hint="Offered when an opportunity is marked lost." items={meta.lostReasons} onSave={(lostReasons) => run({ lostReasons })} editable={canDo('edit')} />
      </div>
      <Card title="Lead scoring" description="Hot / Warm / Cold is set by hand on each customer, as in the old CRM.">
        <p className="text-sm text-muted">
          Weigh customer type, estimated requirement, product fit, purchase timeline, budget, decision-maker contact, existing relationship, previous purchases and engagement while qualifying, then set the priority on the
          customer.
        </p>
      </Card>
    </div>
  );
}

/** Reports & analytics (legacy reports). */
export function ReportsPage() {
  const meta = useCrmMeta().data;
  const url = useUrlState(['from', 'to', 'sp'] as const);
  const v = url.values;
  const r = useCrmReports({ from: v.from || undefined, to: v.to || undefined, salesperson: v.sp || undefined }).data;
  const bars = (rows: { name: string; value: number }[] | undefined) => (rows ?? []).map((x) => ({ label: x.name, value: x.value }));
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="CRM reports" description="Enquiries, ageing, salesperson results, competitors and dormant customers. The follow-up report is under Follow-ups." />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="From date" type="date" value={v.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={v.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
        <Select aria-label="Salesperson" placeholder="All salespersons" options={(meta?.salespersons ?? []).map((s) => ({ value: s, label: s }))} value={v.sp} onChange={(e) => url.set({ sp: e.target.value })} containerClassName="w-[180px]" />
      </div>
      {!r ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-2">
          <Card title="Enquiries by product">
            <BarList rows={bars(r.products)} format={String} empty="No leads" />
          </Card>
          <Card title="Leads by city (top 10)">
            <BarList rows={bars(r.cities)} format={String} empty="No leads" />
          </Card>
          <Card title="Salesperson results">
            <table className="w-full text-sm" aria-label="Salesperson results">
              <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
                <tr>
                  <th className="px-3 py-1.5 text-left">Salesperson</th>
                  <th className="px-3 py-1.5 text-right">Won</th>
                  <th className="px-3 py-1.5 text-right">Lost</th>
                  <th className="px-3 py-1.5 text-right">Won value</th>
                </tr>
              </thead>
              <tbody>
                {r.salespeople.map((p) => (
                  <tr key={p.name} className="border-t border-divider">
                    <td className="px-3 py-1.5">{p.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.won}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.lost}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{inr(p.wonPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Open lead ageing">
            <BarList rows={bars(r.ageing)} format={String} />
          </Card>
          <Card title="Competitors (lost orders)">
            <BarList rows={bars(r.competitors)} format={String} empty="No lost orders" />
          </Card>
          <Card title="Dormant customers" description="Active customers with no contact for 30+ days.">
            {r.dormant.length ? (
              <ul className="flex flex-col divide-y divide-divider">
                {r.dormant.slice(0, 12).map((c) => (
                  <li key={c.id} className="flex justify-between py-1.5 text-sm">
                    <Link to={`/crm/customers?open=${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <span className="text-muted">
                      {c.salesperson ?? '—'} · {c.days} days
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No dormant customers.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

const AREA: Record<string, string> = { crm_lead: 'Lead', crm_customer: 'Customer', crm_followup: 'Follow-up', crm_opportunity: 'Opportunity', crm_quotation: 'Quotation', crm_won: 'Order won', crm_lost: 'Order lost', crm_task: 'Task', crm_campaign: 'Campaign', crm_product: 'Product', crm_salesperson: 'Salesperson', crm_settings: 'Settings', crm_export: 'Export' };

/** Every CRM change, import, export and print, newest first (legacy audit trail). */
export function AuditPage() {
  const url = useUrlState([] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useCrmAudit({ q: url.q || undefined, page: url.page });
  const columns: Column<ActivityEntryView>[] = [
    { id: 'when', header: 'When', width: '170px', className: 'text-muted tabular-nums', cell: (a) => stamp(a.createdAt) },
    {
      id: 'who',
      header: 'By',
      width: '170px',
      cell: (a) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{a.userName ?? 'System'}</span>
          {a.userRole && <span className="text-caption text-faint">{a.userRole}</span>}
        </span>
      ),
    },
    { id: 'area', header: 'Area', width: '120px', cell: (a) => <Pill>{AREA[a.entityType ?? ''] ?? a.entityType}</Pill> },
    { id: 'action', header: 'Action', width: '120px', cell: (a) => a.action },
    { id: 'details', header: 'Details', cell: (a) => a.details },
  ];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="CRM audit trail" description="Every lead, customer, follow-up, opportunity, quotation, order, import, export and print, newest first." />
      <Input aria-label="Search audit trail" icon={Search} placeholder="User or details" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[280px]" />
      <DataTable
        label="CRM audit trail"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(a) => a.id}
        minWidth={900}
        loading={list.isLoading}
        empty={<EmptyState icon={History} title="Nothing recorded yet" />}
        footer={(list.data?.total ?? 0) > 50 && <Pagination page={url.page} pageSize={50} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
    </div>
  );
}


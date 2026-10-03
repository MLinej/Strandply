import { ArrowRightLeft, ExternalLink, Upload, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CUSTOMER_TYPES, LEAD_STAGES, type Lead, type LeadImportResult } from '@contracts/crm';
import { useSession } from '@/app/session';
import { Button, Card, MenuItem, Modal, Pill, Select, useToast, type Column } from '@/components/ui';
import { errorMessage } from '../../samples/ui/errors';
import { useDebounced } from '../../samples/ui/list-state';
import { fetchDuplicates, useConvertLead, useCrmMeta, useImportLeads, useLeadStages } from '../api';
import { RecordForm } from '../components/RecordForm';
import { RecordList } from '../components/RecordList';
import { LEAD_FIELDS, STAGE_FIELDS } from '../fields';
import { d, StagePill } from '../ui';

/** Warns while typing when the mobile, name + city or email is already a lead or customer. */
function DuplicateWarning({ values, except }: { values: Record<string, string | boolean>; except?: string }) {
  const q = useDebounced({ companyName: String(values.companyName ?? ''), mobile: String(values.mobile ?? ''), email: String(values.email ?? ''), city: String(values.city ?? '') }, 400);
  const [hits, setHits] = useState<string[]>([]);
  useEffect(() => {
    if (!q.mobile && !(q.companyName && q.city) && !q.email) return setHits([]);
    fetchDuplicates({ ...Object.fromEntries(Object.entries(q).filter(([, v]) => v)), except })
      .then(setHits)
      .catch(() => setHits([]));
  }, [q.companyName, q.mobile, q.email, q.city]);
  if (!hits.length) return null;
  return (
    <p className="rounded border border-primary-border bg-primary-tint px-3 py-2 text-sm" role="status">
      Possible duplicate: {hits.join('; ')}. You can still save.
    </p>
  );
}

/** Excel / CSV lead import with a preview (legacy handleImportFile / showImportPreview). */
function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const imp = useImportLeads();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<LeadImportResult | null>(null);
  useEffect(() => {
    if (open) {
      setFile(null);
      setPreview(null);
    }
  }, [open]);
  async function pick(f: File | null) {
    setFile(f);
    setPreview(null);
    if (!f) return;
    try {
      setPreview(await imp.mutateAsync({ file: f, commit: false }));
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t read the file', description: errorMessage(err) });
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Import leads"
      description="Columns: Company Name, Contact Person, Mobile Number, Email, City, State, Customer Type, Product, Source, Salesperson, Remarks."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!preview?.valid}
            loading={imp.isPending}
            onClick={() =>
              void imp
                .mutateAsync({ file: file!, commit: true })
                .then((r) => {
                  toast({ tone: 'success', title: `${r.imported} leads imported` });
                  onClose();
                })
                .catch((err) => toast({ tone: 'error', title: 'Import failed', description: errorMessage(err) }))
            }
          >
            Import {preview?.valid ?? 0} leads
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" aria-label="Lead sheet" className="text-sm" onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
        {preview && (
          <>
            <p className="text-base">
              {preview.total} rows · <strong>{preview.valid} valid</strong> · {preview.duplicates} possible duplicates
            </p>
            <div className="max-h-80 overflow-auto rounded border border-border">
              <table className="w-full text-sm" aria-label="Import preview">
                <thead className="sticky top-0 bg-page text-label font-semibold uppercase tracking-label text-muted">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Row</th>
                    <th className="px-3 py-1.5 text-left">Company</th>
                    <th className="px-3 py-1.5 text-left">Mobile</th>
                    <th className="px-3 py-1.5 text-left">City</th>
                    <th className="px-3 py-1.5 text-left">Source</th>
                    <th className="px-3 py-1.5 text-left">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row} className="border-t border-divider align-top">
                      <td className="px-3 py-1.5 tabular-nums text-muted">{r.row}</td>
                      <td className="px-3 py-1.5">{r.companyName || '—'}</td>
                      <td className="px-3 py-1.5 tabular-nums">{r.mobile || '—'}</td>
                      <td className="px-3 py-1.5">{r.city ?? '—'}</td>
                      <td className="px-3 py-1.5">{r.source ?? '—'}</td>
                      <td className="px-3 py-1.5">
                        {r.error ? <Pill tone="red">{r.error}</Pill> : r.duplicates.length ? <span title={r.duplicates.join('\n')}><Pill tone="amber">Possible duplicate</Pill></span> : <Pill tone="green">New</Pill>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted">Rows with an error are skipped. Possible duplicates are imported too (as legacy did); check them afterwards.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

const leadColumns: Column<Lead>[] = [
  { id: 'date', header: 'Added', width: '100px', className: 'tabular-nums text-sm', cell: (l) => d(l.dateAdded) },
  {
    id: 'company',
    header: 'Company',
    cell: (l) => (
      <span className="flex flex-col leading-tight">
        <span className="font-medium">{l.companyName}</span>
        <span className="text-caption text-faint">{[l.contactPerson, l.customerType].filter(Boolean).join(' · ')}</span>
      </span>
    ),
  },
  { id: 'mobile', header: 'Mobile', width: '120px', className: 'tabular-nums text-sm', cell: (l) => l.mobile },
  { id: 'city', header: 'City', width: '120px', className: 'text-sm', cell: (l) => l.city ?? '—' },
  { id: 'product', header: 'Product', width: '120px', className: 'text-sm', cell: (l) => l.product ?? '—' },
  { id: 'source', header: 'Source', width: '130px', className: 'text-sm', cell: (l) => l.source ?? '—' },
  { id: 'sp', header: 'Salesperson', width: '130px', className: 'text-sm', cell: (l) => l.salesperson ?? '—' },
  { id: 'stage', header: 'Stage', width: '140px', cell: (l) => <StagePill s={l.stage} /> },
  { id: 'next', header: 'Next follow-up', width: '120px', className: 'tabular-nums text-sm', cell: (l) => d(l.nextFollowUpDate) },
];

function useLeadFilters() {
  const meta = useCrmMeta().data;
  return (v: Record<string, string>, set: (p: Record<string, string | null>) => void) => (
    <>
      <Select aria-label="Stage" placeholder="All stages" options={LEAD_STAGES.map((s) => ({ value: s, label: s }))} value={v.stage} onChange={(e) => set({ stage: e.target.value })} containerClassName="w-[160px]" />
      <Select aria-label="Salesperson" placeholder="All salespersons" options={(meta?.salespersons ?? []).map((s) => ({ value: s, label: s }))} value={v.salesperson} onChange={(e) => set({ salesperson: e.target.value })} containerClassName="w-[170px]" />
      <Select aria-label="Customer type" placeholder="All types" options={CUSTOMER_TYPES.map((s) => ({ value: s, label: s }))} value={v.type} onChange={(e) => set({ type: e.target.value })} containerClassName="w-[170px]" />
      <Select aria-label="Product" placeholder="All products" options={(meta?.products ?? []).map((s) => ({ value: s, label: s }))} value={v.product} onChange={(e) => set({ product: e.target.value })} containerClassName="w-[150px]" />
    </>
  );
}
const leadQuery = (v: Record<string, string>) => ({ stage: v.stage || undefined, salesperson: v.salesperson || undefined, customerType: v.type || undefined, product: v.product || undefined });

/** Raw Lead Data (legacy rawleads): every enquiry, import from Excel, convert to a customer. */
export function LeadsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { canDo } = useSession();
  const convert = useConvertLead();
  const [importing, setImporting] = useState(false);
  const filters = useLeadFilters();
  return (
    <>
      <RecordList
        kind="leads"
        title="Raw lead data"
        description="Every marketing enquiry. Duplicates are flagged as you type and on import; convert a lead to make it a customer."
        noun="lead"
        columns={leadColumns}
        fields={LEAD_FIELDS}
        newInitial={{ stage: 'New Lead' }}
        filterKeys={['stage', 'salesperson', 'type', 'product']}
        filters={filters}
        toQuery={leadQuery}
        exportKind="leads"
        formExtra={(v, r) => <DuplicateWarning values={v} except={r?.id} />}
        searchPlaceholder="Company, contact, mobile, city"
        minWidth={1250}
        above={
          canDo('edit') && (
            <div>
              <Button icon={Upload} onClick={() => setImporting(true)}>
                Import Excel
              </Button>
            </div>
          )
        }
        rowActions={(l, close) =>
          l.customerId ? (
            <MenuItem icon={ExternalLink} onClick={() => (close(), navigate(`/crm/customers?open=${l.customerId}`))}>
              Open customer
            </MenuItem>
          ) : (
            canDo('edit') && (
              <MenuItem
                icon={UserPlus}
                onClick={() => {
                  close();
                  void convert
                    .mutateAsync(l.id)
                    .then((c) => {
                      toast({ tone: 'success', title: `${c.companyName} is now a customer` });
                      navigate(`/crm/customers?open=${c.id}`);
                    })
                    .catch((err) => toast({ tone: 'error', title: 'Couldn’t convert', description: errorMessage(err) }));
                }}
              >
                Convert to customer
              </MenuItem>
            )
          )
        }
      />
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
    </>
  );
}

/** Lead Management (legacy leads): leads by stage, moved along the pipeline. */
export function PipelinePage() {
  const stages = useLeadStages().data ?? [];
  const filters = useLeadFilters();
  const [moving, setMoving] = useState<Lead | null>(null);
  const { canDo } = useSession();
  const total = stages.reduce((s, x) => s + x.value, 0);
  return (
    <>
      <RecordList
        kind="leads"
        title="Lead management"
        description="New lead → contacted → qualified → … → order won or lost. Move a lead along with its next action and date."
        noun="lead"
        columns={leadColumns}
        fields={LEAD_FIELDS}
        newInitial={{ stage: 'New Lead' }}
        filterKeys={['stage', 'salesperson', 'type', 'product']}
        filters={filters}
        toQuery={leadQuery}
        searchPlaceholder="Company, contact, mobile, city"
        minWidth={1250}
        onRowClick={canDo('edit') ? setMoving : undefined}
        above={
          <Card title="Stage summary" description={`${total} leads`}>
            <div className="flex flex-wrap gap-2" aria-label="Stage summary">
              {stages.map((s) => (
                <a key={s.name} href={`?stage=${encodeURIComponent(s.name)}`} className="flex items-center gap-2 rounded border border-border px-3 py-1.5 text-sm hover:border-ink">
                  <span>{s.name}</span>
                  <strong className="tabular-nums">{s.value}</strong>
                </a>
              ))}
            </div>
          </Card>
        }
        rowActions={(l, close) =>
          canDo('edit') && (
            <MenuItem icon={ArrowRightLeft} onClick={() => (close(), setMoving(l))}>
              Move stage
            </MenuItem>
          )
        }
      />
      <RecordForm kind="leads" open={!!moving} record={moving} title={`Move stage · ${moving?.companyName ?? ''}`} fields={STAGE_FIELDS} size="md" onClose={() => setMoving(null)} />
    </>
  );
}


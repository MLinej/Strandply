import { Download, FileSpreadsheet, Mail, Save, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { VendorImportKind, VendorImportReport, VendorImportRow } from '@contracts/vendors';
import { useSession } from '@/app/session';
import { Button, Card, Input, Modal, Pill, Skeleton, useToast } from '@/components/ui';
import type { Tone } from '@/lib/status';
import { exportCities } from '../../samples/api';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { PageHeader } from '../../samples/ui/PageHeader';
import { downloadImportTemplate, exportCategories, exportVendorProducts, exportVendors, useSaveVendorEmailSettings, useVendorEmailSettings, useVendorImport } from '../api';

const KIND_LABEL: Record<VendorImportKind, string> = { vendors: 'Vendors', products: 'Products', categories: 'Categories', cities: 'Cities' };
const KIND_NOTE: Record<VendorImportKind, string> = {
  vendors: 'Name, Categories, Products (separate several with |), Contact, Phone, Email, City, State, Pincode, GSTIN, PAN, Payment Terms, Status, Rating. Categories and products must already exist.',
  products: 'Name, Category, Unit, Alt Unit, Conv Factor, HSN, GST%, MOQ, Lead Days, Description. Codes are assigned on import.',
  categories: 'Name, Icon, Color, Description, Sort Order, Status.',
  cities: 'City, State, Pincodes (separate with |).',
};
const ROW_TONE: Record<VendorImportRow['status'], Tone> = { would_add: 'green', added: 'green', skipped: 'neutral', error: 'red' };
const ROW_LABEL: Record<VendorImportRow['status'], string> = { would_add: 'Will add', added: 'Added', skipped: 'Skipped', error: 'Error' };

/** Bulk import with a dry-run preview first (legacy openImport / handleImport / confirmImportData). */
function ImportDialog({ kind, onClose }: { kind: VendorImportKind | null; onClose: () => void }) {
  const toast = useToast();
  const run = useVendorImport();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<VendorImportReport | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setFile(null);
    setReport(null);
  }, [kind]);
  if (!kind) return null;
  const noun = KIND_LABEL[kind].toLowerCase();

  async function choose(f: File | undefined) {
    if (!f || !kind) return;
    setFile(f);
    setReport(null);
    try {
      setReport(await run.mutateAsync({ kind, file: f, commit: false }));
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t read the file', description: errorMessage(err) });
    }
  }
  async function commit() {
    if (!file || !kind) return;
    try {
      const r = await run.mutateAsync({ kind, file, commit: true });
      setReport(r);
      toast({ tone: r.totals.added ? 'success' : 'warning', title: `${r.totals.added} ${noun} imported`, description: `${r.totals.skipped} skipped, ${r.totals.errors} with errors` });
    } catch (err) {
      toast({ tone: 'error', title: 'Import failed', description: errorMessage(err) });
    }
  }

  // Field ids → words: sortOrder → sort order, gst → GST.
  const unmapped = report ? Object.entries(report.columns).filter(([, v]) => !v).map(([k]) => (k === 'gst' || k === 'pan' || k === 'hsn' || k === 'moq' ? k.toUpperCase() : k.replace(/([A-Z])/g, ' $1').toLowerCase())) : [];
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Import ${noun}`}
      description={`Excel (.xlsx, .xls) or CSV. Columns: ${KIND_NOTE[kind]} Rows whose name already exists are skipped, never overwritten.`}
      footer={
        <>
          <Button icon={FileSpreadsheet} onClick={() => downloadImportTemplate(kind).catch((err) => toast({ tone: 'error', title: 'Download failed', description: errorMessage(err) }))}>
            Download template
          </Button>
          <Button onClick={onClose}>{report?.mode === 'commit' ? 'Done' : 'Cancel'}</Button>
          {report?.mode === 'preview' && (
            <Button variant="primary" icon={Upload} loading={run.isPending} disabled={!report.totals.added} onClick={commit}>
              Import {report.totals.added} {report.totals.added === 1 ? noun.replace(/ies$/, 'y').replace(/s$/, '') : noun}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="sr-only" aria-label="Spreadsheet file" onChange={(e) => void choose(e.target.files?.[0])} />
          <Button icon={Upload} loading={run.isPending && !report} onClick={() => input.current?.click()}>
            {file ? 'Choose another file' : 'Choose file'}
          </Button>
          <span className="truncate text-base text-muted">{file?.name ?? 'No file chosen'}</span>
        </div>
        {report && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="green" size="md">
                {report.totals.added} {report.mode === 'commit' ? 'added' : 'to add'}
              </Pill>
              <Pill size="md">{report.totals.skipped} skipped</Pill>
              <Pill tone={report.totals.errors ? 'red' : 'neutral'} size="md">
                {report.totals.errors} errors
              </Pill>
              <span className="text-caption text-faint">{report.totals.rows} rows read</span>
            </div>
            {unmapped.length > 0 && <p className="text-meta text-muted">No column found for: {unmapped.join(', ')}.</p>}
            <div className="max-h-80 overflow-y-auto rounded border border-border">
              <table className="w-full text-base">
                <thead className="sticky top-0 bg-page">
                  <tr className="h-row-head text-left text-label font-semibold uppercase tracking-label text-muted">
                    <th className="px-3 font-semibold">Row</th>
                    <th className="px-3 font-semibold">{KIND_LABEL[kind].replace(/ies$/, 'y').replace(/s$/, '')}</th>
                    <th className="px-3 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.row} className="border-t border-divider align-top">
                      <td className="px-3 py-1.5 text-faint">{r.row}</td>
                      <td className="px-3 py-1.5">{r.label}</td>
                      <td className="px-3 py-1.5">
                        <Pill tone={ROW_TONE[r.status]}>{ROW_LABEL[r.status]}</Pill>
                        {r.reason && <span className="ml-2 text-meta text-muted">{r.reason}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function EmailSettingsCard() {
  const toast = useToast();
  const { canDo } = useSession();
  const settings = useVendorEmailSettings();
  const save = useSaveVendorEmailSettings();
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!settings.data) return;
    setFromName(settings.data.fromName);
    setReplyTo(settings.data.replyTo ?? '');
  }, [settings.data]);
  const changed = settings.data && (fromName.trim() !== settings.data.fromName || (replyTo.trim() || null) !== settings.data.replyTo);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fromName.trim()) return setErrors({ fromName: 'Sender name is required' });
    setErrors({});
    try {
      await save.mutateAsync({ fromName: fromName.trim(), replyTo: replyTo.trim() || null });
      toast({ tone: 'success', title: 'E-mail settings saved' });
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }

  return (
    <Card title="E-mail sender" description="Used when vendor e-mails (enquiries, POs) are sent. Sending is switched on with the e-mail relay.">
      {!settings.data ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
          <Input label="From name" icon={Mail} value={fromName} onChange={(e) => setFromName(e.target.value)} error={errors.fromName} disabled={!canDo('edit')} />
          <Input label="Reply-to e-mail" type="email" placeholder="procurement@strandply.in" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} error={errors.replyTo} disabled={!canDo('edit')} />
          {canDo('edit') && (
            <Button variant="primary" type="submit" icon={Save} disabled={!changed} loading={save.isPending} className="self-end">
              Save
            </Button>
          )}
        </form>
      )}
    </Card>
  );
}

/** Vendor settings (legacy Settings & System): e-mail sender, import and export. */
export function VendorSettingsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const [importing, setImporting] = useState<VendorImportKind | null>(null);
  const guard = (fn: () => Promise<unknown>) => () => void fn().catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }));

  const exports: { label: string; run: () => void }[] = [
    { label: 'All vendors (.xlsx)', run: guard(() => exportVendors({}, 'xlsx')) },
    { label: 'All vendors (.csv)', run: guard(() => exportVendors({}, 'csv')) },
    { label: 'Products (.xlsx)', run: guard(() => exportVendorProducts({})) },
    { label: 'Categories (.xlsx)', run: guard(() => exportCategories()) },
    { label: 'City master (.xlsx)', run: guard(() => exportCities()) },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Vendor settings"
        description={
          <>
            E-mail, import and export. Company details for printed vendor cards come from{' '}
            <Link to="/admin/settings" className="font-semibold text-ink underline underline-offset-2">
              Company settings
            </Link>
            .
          </>
        }
      />
      <div className="grid gap-3.5 lg:grid-cols-3">
        <EmailSettingsCard />
        <Card title="Import" description="Preview first: nothing is saved until you confirm.">
          <div className="flex flex-col gap-2">
            {(Object.keys(KIND_LABEL) as VendorImportKind[]).map((k) => (
              <Button key={k} icon={Upload} disabled={!canDo('edit')} onClick={() => setImporting(k)} className="justify-start">
                Import {KIND_LABEL[k].toLowerCase()}
              </Button>
            ))}
            {!canDo('edit') && <p className="text-meta text-muted">Your role can’t add records.</p>}
          </div>
        </Card>
        <Card title="Export" description="Spreadsheets of the current data.">
          <div className="flex flex-col gap-2">
            {exports.map((x) => (
              <Button key={x.label} icon={Download} disabled={!canDo('export')} onClick={x.run} className="justify-start">
                {x.label}
              </Button>
            ))}
            {!canDo('export') && <p className="text-meta text-muted">Your role can’t export.</p>}
          </div>
        </Card>
      </div>
      <ImportDialog kind={importing} onClose={() => setImporting(null)} />
    </div>
  );
}

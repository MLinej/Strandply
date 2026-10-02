import { CheckCircle2, FileText, Pencil, Printer, Tag, Trash2, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { DOCUMENT_TYPES, MATERIAL_BY_ID, type DocumentType, type PurchaseEntryView, type TypeKind } from '@contracts/purchase';
import { useSession } from '@/app/session';
import { Button, Input, Modal, Select, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage } from '../../samples/ui/errors';
import { documentUrl, useAddType, useApproveEntry, useDocuments, usePurchaseMeta, useRemoveType, useUploadDocument } from '../api';
import { printEntry } from '../print';
import { EntryStatusPill, materialLabel, qtyWithUnit } from '../ui';
import { CalcTable } from './CalcTable';

function Documents({ entryId }: { entryId: string }) {
  const toast = useToast();
  const { canDo } = useSession();
  const docs = useDocuments({ filters: { entryId }, pageSize: 50 }).data?.rows ?? [];
  const upload = useUploadDocument();
  const [type, setType] = useState<DocumentType>('Invoice');
  const input = useRef<HTMLInputElement>(null);
  async function onFiles(files: FileList | null) {
    for (const file of [...(files ?? [])]) {
      try {
        await upload.mutateAsync({ file, type, entryId });
        toast({ tone: 'success', title: `${file.name} attached` });
      } catch (err) {
        toast({ tone: 'error', title: `Couldn’t attach ${file.name}`, description: errorMessage(err) });
      }
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-label font-semibold uppercase tracking-label text-faint">Documents</h3>
        {canDo('edit') && (
          <div className="flex items-center gap-2">
            <Select aria-label="Document type" options={DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))} value={type} onChange={(e) => setType(e.target.value as DocumentType)} containerClassName="w-[160px]" />
            <input ref={input} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="sr-only" aria-label="Attach a document" onChange={(e) => void onFiles(e.target.files)} />
            <Button size="sm" icon={Upload} loading={upload.isPending} onClick={() => input.current?.click()}>
              Attach
            </Button>
          </div>
        )}
      </div>
      {docs.length === 0 ? (
        <p className="text-sm text-muted">Nothing attached.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-sm">
              <FileText size={15} className="shrink-0 text-muted" aria-hidden />
              <a href={documentUrl(d.id)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline">
                {d.name}
              </a>
              <span className="text-caption text-faint">
                {d.type} · {Math.max(1, Math.round(d.sizeBytes / 1024))} KB
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One entry: its details, amount breakup, documents and actions (legacy openSlip + row buttons). */
/** `onEdit` / `onDelete` omitted (e.g. on the truck register): those buttons are hidden. */
export function EntryDetail({ entry, onClose, onEdit, onDelete }: { entry: PurchaseEntryView | undefined; onClose: () => void; onEdit?: (e: PurchaseEntryView) => void; onDelete?: (e: PurchaseEntryView) => void }) {
  const toast = useToast();
  const { canDo } = useSession();
  const approve = useApproveEntry();
  const e = entry;
  const guard = (title: string, fn: () => Promise<unknown>) => fn().catch((err) => toast({ tone: 'error', title, description: errorMessage(err) }));
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        e ? (
          <span className="flex items-center gap-2">
            {materialLabel(e.material)} {e.lotNo} <EntryStatusPill status={e.status} />
          </span>
        ) : (
          'Purchase entry'
        )
      }
      description={e ? `${e.vendorName} · invoice ${e.invoiceNo}` : undefined}
      footer={
        e && (
          <>
            {canDo('delete') && onDelete && (
              <Button variant="ghost" icon={Trash2} onClick={() => onDelete(e)}>
                Delete
              </Button>
            )}
            {canDo('print') && e.status !== 'draft' && (
              <>
                <Button icon={Printer} onClick={() => void guard('Couldn’t print', () => printEntry(e.id, 'slip'))}>
                  Print slip
                </Button>
                {e.material === 'nilgiri' && (
                  <Button icon={Tag} onClick={() => void guard('Couldn’t print', () => printEntry(e.id, 'label'))}>
                    Lot label
                  </Button>
                )}
              </>
            )}
            {canDo('edit') && onEdit && (
              <Button icon={Pencil} onClick={() => onEdit(e)}>
                Edit
              </Button>
            )}
            {canDo('purchase_approve') && e.status === 'pending' && (
              <Button
                variant="primary"
                icon={CheckCircle2}
                loading={approve.isPending}
                onClick={() =>
                  void approve.mutateAsync(e.id).then(
                    (r) => toast({ tone: 'success', title: `${r.lotNo} approved` }),
                    (err) => toast({ tone: 'error', title: 'Couldn’t approve', description: errorMessage(err) }),
                  )
                }
              >
                Approve
              </Button>
            )}
          </>
        )
      }
    >
      {!e ? (
        <p className="text-base text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <DetailList
            cols={3}
            items={[
              { label: 'Inward date', value: formatDate(e.date) },
              { label: 'Invoice', value: `${e.invoiceNo}${e.invoiceDate ? ` · ${formatDate(e.invoiceDate)}` : ''}` },
              { label: 'PO', value: e.poNo },
              { label: 'Vendor', value: [e.vendorName, e.vendorCode].filter(Boolean).join(' · ') },
              { label: 'GSTIN / PAN', value: [e.gstin, e.pan].filter(Boolean).join(' · ') || null },
              { label: 'Place', value: [e.city, e.state].filter(Boolean).join(', ') || null },
              { label: 'Vehicle', value: [e.vehicleNo, e.driver, e.transporter].filter(Boolean).join(' · ') || null },
              { label: 'RST / MRN / GRN', value: [e.rstNo, e.mrnNo, e.grnNo].map((x) => x ?? '—').join(' / ') },
              { label: 'Tax', value: `${e.taxType}${e.taxType !== 'URD' ? ` @ ${e.gstPct}%` : ''}` },
              ...(MATERIAL_BY_ID[e.material].hasSpecies ? [{ label: 'Species', value: e.species }] : []),
              ...(MATERIAL_BY_ID[e.material].hasVeneerType ? [{ label: 'Veneer type', value: e.veneerType }, { label: 'Alternate qty', value: e.altQtyPcs === null ? null : `${e.altQtyPcs} Pcs` }] : []),
              ...(e.itemName ? [{ label: 'Item', value: `${e.itemName}${e.hsn ? ` · HSN ${e.hsn}` : ''}` }] : []),
              { label: 'Difference', value: e.calc.diffQty === 0 ? 'None' : `${e.calc.diffQty > 0 ? '+' : ''}${qtyWithUnit(e.material, e.calc.diffQty)}` },
              { label: 'Approval', value: e.status === 'approved' ? `${e.approvedByName ?? 'Approved'}${e.approvedAt ? `, ${formatDate(e.approvedAt.slice(0, 10))}` : ''}` : e.status === 'draft' ? 'Draft, not posted' : 'Awaiting approval' },
              { label: 'Remarks', value: e.remarks, wide: true },
            ]}
          />
          <CalcTable material={e.material} invQty={e.invQty} splQty={e.splQty} ratePaise={e.ratePaise} rateDiffPaise={e.rateDiffPaise} taxType={e.taxType} calc={e.calc} />
          <Documents entryId={e.id} />
        </div>
      )}
    </Modal>
  );
}

/** Nilgiri species / face veneer type master (legacy speciesMasterModal / veneerMasterModal). */
export function TypeMasterDialog({ kind, onClose }: { kind: TypeKind | null; onClose: () => void }) {
  const toast = useToast();
  const { canDo } = useSession();
  const types = (usePurchaseMeta().data?.types ?? []).filter((t) => t.kind === kind);
  const add = useAddType();
  const remove = useRemoveType();
  const [name, setName] = useState('');
  const title = kind === 'nilgiri_species' ? 'Nilgiri species' : 'Face veneer types';
  async function onAdd() {
    if (!kind || !name.trim()) return;
    try {
      await add.mutateAsync({ kind, name: name.trim() });
      toast({ tone: 'success', title: `${name.trim()} added` });
      setName('');
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t add', description: errorMessage(err) });
    }
  }
  return (
    <Modal open={!!kind} onClose={onClose} size="sm" title={title} description="New types appear straight away in the entry form and the stock ledger." footer={<Button onClick={onClose}>Done</Button>}>
      <ul className="mb-3 flex flex-col divide-y divide-divider rounded border border-border">
        {types.map((t) => (
          <li key={t.id} className="flex items-center justify-between px-3 py-1.5">
            <span>{t.name}</span>
            {canDo('delete') && (
              <Button
                size="sm"
                variant="ghost"
                icon={X}
                aria-label={`Remove ${t.name}`}
                disabled={types.length <= 1}
                onClick={() => void remove.mutateAsync(t.id).catch((err) => toast({ tone: 'error', title: 'Couldn’t remove', description: errorMessage(err) }))}
              />
            )}
          </li>
        ))}
      </ul>
      {canDo('edit') && (
        <form
          className="flex items-end gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            void onAdd();
          }}
        >
          <Input label="New type" value={name} onChange={(ev) => setName(ev.target.value)} containerClassName="flex-1" />
          <Button type="submit" loading={add.isPending} disabled={!name.trim()}>
            Add
          </Button>
        </form>
      )}
    </Modal>
  );
}

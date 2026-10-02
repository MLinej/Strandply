import { Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { REQUEST_PRIORITIES, type RequestInput, type RequestLineInput, type RequestPriority, type RequestView } from '@contracts/sampletrack';
import { Button, Input, Modal, Select, useToast } from '@/components/ui';
import { lineFromProduct, useCreateRequest, useParties, usePartyAssignees, useProducts, useUpdateRequest } from '../api';
import { errorMessage, fieldErrors } from '../ui/errors';

type Line = RequestLineInput & { key: string };

const blankLine = (): Line => ({ key: crypto.randomUUID(), productId: null, productName: '', board: '', thickness: '', size: '', qty: '' });

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const PICKER = { pageSize: 100, sort: 'name' } as const;

/**
 * New / edit sample request (legacy openReqModal + addProductLine + saveRequest).
 * Picking a master product fills board, thickness and size; free-text products are allowed.
 * Status is never edited here.
 */
export function RequestForm({ open, request, onClose, onSaved }: { open: boolean; request: RequestView | null; onClose: () => void; onSaved: (r: RequestView) => void }) {
  const toast = useToast();
  const create = useCreateRequest();
  const update = useUpdateRequest();
  const parties = useParties(PICKER);
  const products = useProducts(PICKER);
  const assignees = usePartyAssignees();

  const [date, setDate] = useState(todayIso());
  const [partyId, setPartyId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [priority, setPriority] = useState<RequestPriority>('Normal');
  const [requiredBy, setRequiredBy] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fill the form each time it opens.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (request) {
      setDate(request.date);
      setPartyId(request.partyId);
      setPurpose(request.purpose ?? '');
      setPriority(request.priority);
      setRequiredBy(request.requiredDispatchDate ?? '');
      setRequestedBy(request.requestedByUserId ?? '');
      setRemarks(request.remarks ?? '');
      setLines(
        request.items.length
          ? request.items.map((i) => ({
              key: i.id,
              productId: i.productId,
              productName: i.productName,
              board: i.board ?? '',
              thickness: i.thickness ?? '',
              size: i.size ?? '',
              qty: i.qtyRaw ?? '',
            }))
          : [blankLine()],
      );
    } else {
      setDate(todayIso());
      setPartyId('');
      setPurpose('');
      setPriority('Normal');
      setRequiredBy('');
      setRequestedBy('');
      setRemarks('');
      setLines([blankLine()]);
    }
  }, [open, request]);

  const productById = new Map((products.data?.rows ?? []).map((p) => [p.id, p]));

  function setLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickProduct(key: string, productId: string) {
    const p = productById.get(productId);
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        if (!p) return { ...l, productId: null };
        const filled = lineFromProduct(p, l);
        return { ...l, ...filled, board: filled.board ?? '', thickness: filled.thickness ?? '', size: filled.size ?? '', productName: filled.productName ?? '' };
      }),
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const input: RequestInput = {
      date,
      partyId,
      purpose: purpose || null,
      priority,
      requiredDispatchDate: requiredBy || null,
      requestedByUserId: requestedBy || null,
      remarks: remarks || null,
      items: lines.map(({ key: _k, ...l }) => ({
        productId: l.productId || null,
        productName: l.productName || null,
        board: l.board || null,
        thickness: l.thickness || null,
        size: l.size || null,
        qty: l.qty || null,
      })),
    };
    const local: Record<string, string> = {};
    if (!partyId) local.partyId = 'Select a party';
    if (!input.items.some((i) => i.productId || i.productName)) local.items = 'Add at least one product';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    try {
      const saved = request ? await update.mutateAsync({ id: request.id, input }) : await create.mutateAsync(input);
      toast({ tone: 'success', title: request ? `${saved.reqNo} updated` : `Request ${saved.reqNo} created` });
      onSaved(saved);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the request', description: errorMessage(err) });
    }
  }

  const busy = create.isPending || update.isPending;
  const partyOptions = (parties.data?.rows ?? []).map((p) => ({ value: p.id, label: p.city ? `${p.name} (${p.city})` : p.name }));
  const productOptions = (products.data?.rows ?? []).map((p) => ({ value: p.id, label: p.name }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={request ? `Edit ${request.reqNo}` : 'New sample request'}
      description={request ? `Status stays ${request.status}.` : 'The request number is given when you save. New requests start as Pending.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="request-form" loading={busy}>
            {request ? 'Save changes' : 'Create request'}
          </Button>
        </>
      }
    >
      <form id="request-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
          <Select
            label="Party"
            placeholder={parties.isLoading ? 'Loading…' : 'Select a party'}
            options={partyOptions}
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            error={errors.partyId}
            containerClassName="sm:col-span-2"
          />
          <Input label="Purpose" placeholder="Testing, exhibition, client visit…" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          <Select
            label="Priority"
            options={REQUEST_PRIORITIES.map((p) => ({ value: p, label: p }))}
            value={priority}
            onChange={(e) => setPriority(e.target.value as RequestPriority)}
          />
          <Input
            label="Required dispatch date"
            type="date"
            min={date}
            value={requiredBy}
            onChange={(e) => setRequiredBy(e.target.value)}
            error={errors.requiredDispatchDate}
          />
          <Select
            label="Requested by"
            placeholder="Me"
            options={(assignees.data ?? []).map((a) => ({ value: a.id, label: `${a.name} · ${a.role}` }))}
            value={requestedBy}
            onChange={(e) => setRequestedBy(e.target.value)}
            error={errors.requestedByUserId}
          />
          <Input label="Remarks" placeholder="Additional notes" value={remarks} onChange={(e) => setRemarks(e.target.value)} containerClassName="sm:col-span-2" />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold text-ink">Products</legend>
          {lines.map((l, i) => (
            <div key={l.key} className="flex flex-col gap-2 rounded border border-divider bg-page p-2.5">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-5 shrink-0 text-right text-sm font-semibold text-faint">{i + 1}</span>
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <Select
                    aria-label={`Product ${i + 1}`}
                    placeholder="Pick from the product master…"
                    options={productOptions}
                    value={l.productId ?? ''}
                    onChange={(e) => pickProduct(l.key, e.target.value)}
                    containerClassName="min-w-0"
                  />
                  {l.productId ? (
                    <p className="self-center text-sm text-muted">Board, thickness and size filled from the master. Edit them below if needed.</p>
                  ) : (
                    <Input
                      aria-label={`Product name ${i + 1}`}
                      placeholder="…or type a product that isn’t in it"
                      value={l.productName ?? ''}
                      onChange={(e) => setLine(l.key, { productName: e.target.value })}
                      error={errors[`items.${i}.productName`]}
                      containerClassName="min-w-0"
                    />
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Remove product ${i + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  className="flex h-ctl w-8 shrink-0 items-center justify-center rounded text-muted hover:bg-card hover:text-ink disabled:opacity-30"
                >
                  <X size={15} strokeWidth={1.8} aria-hidden />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 pl-7 pr-10 sm:grid-cols-4">
                <Input aria-label={`Board ${i + 1}`} placeholder="Board type" value={l.board ?? ''} onChange={(e) => setLine(l.key, { board: e.target.value })} containerClassName="min-w-0" />
                <Input aria-label={`Thickness ${i + 1}`} placeholder="Thickness (18mm)" value={l.thickness ?? ''} onChange={(e) => setLine(l.key, { thickness: e.target.value })} containerClassName="min-w-0" />
                <Input aria-label={`Size ${i + 1}`} placeholder="Size (8x4 ft)" value={l.size ?? ''} onChange={(e) => setLine(l.key, { size: e.target.value })} containerClassName="min-w-0" />
                <Input aria-label={`Quantity ${i + 1}`} placeholder="Qty (5 sheets)" value={l.qty ?? ''} onChange={(e) => setLine(l.key, { qty: e.target.value })} containerClassName="min-w-0" />
              </div>
            </div>
          ))}
          {errors.items && <p className="text-meta text-primary">{errors.items}</p>}
          <div>
            <Button size="sm" icon={Plus} onClick={() => setLines((ls) => [...ls, blankLine()])}>
              Add product
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { DISPATCH_STATUSES, type DispatchStatus, type DispatchView } from '@contracts/sampletrack';
import { Button, Input, Modal, Select, useToast } from '@/components/ui';
import { qrSvg } from '@/lib/qr';
import { fetchQrPayload, useUpdateDispatchStatus } from '../api';
import { errorMessage } from '../ui/errors';

/** Quick status update (legacy updateDispStatus). Any of the 8 statuses, with an optional note for the history. */
export function StatusUpdateDialog({ dispatch, onClose }: { dispatch: DispatchView | null; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateDispatchStatus();
  const [status, setStatus] = useState<DispatchStatus>('Pending');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (dispatch) {
      setStatus(dispatch.status);
      setNote('');
    }
  }, [dispatch]);

  async function save() {
    if (!dispatch) return;
    try {
      const d = await update.mutateAsync({ id: dispatch.id, status, note: note || null });
      toast({ tone: 'success', title: `${d.dspNo} is now ${d.status}` });
      onClose();
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t update the status', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={!!dispatch}
      onClose={onClose}
      size="sm"
      title={dispatch ? `Update ${dispatch.dspNo}` : 'Update status'}
      description={dispatch ? `Now ${dispatch.status}. The change is added to the history${dispatch.linkedRequestNo ? ` and ${dispatch.linkedRequestNo} follows it` : ''}.` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={update.isPending} disabled={dispatch?.status === status} onClick={save}>
            Update status
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select label="New status" options={DISPATCH_STATUSES.map((s) => ({ value: s, label: s }))} value={status} onChange={(e) => setStatus(e.target.value as DispatchStatus)} />
        <Input label="Note (optional)" placeholder="e.g. Stuck at Ahmedabad hub" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

/** QR code drawn in the browser. The shipment data never goes to an outside QR service. */
export function QrDialog({ dispatch, onClose }: { dispatch: DispatchView | null; onClose: () => void }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [payload, setPayload] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dispatch) return;
    let live = true;
    setSvg(null);
    setError(null);
    fetchQrPayload(dispatch.id)
      .then(async (p) => {
        const s = await qrSvg(p);
        if (live) {
          setPayload(p);
          setSvg(s);
        }
      })
      .catch((err) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, [dispatch]);

  return (
    <Modal open={!!dispatch} onClose={onClose} size="sm" title={dispatch ? `QR code · ${dispatch.dspNo}` : 'QR code'} footer={<Button onClick={onClose}>Close</Button>}>
      {error ? (
        <p className="text-base text-primary">{error}</p>
      ) : !svg ? (
        <p className="text-base text-muted">Generating…</p>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="w-48 rounded border border-border bg-card p-3" dangerouslySetInnerHTML={{ __html: svg }} />
          <code className="w-full break-all rounded bg-page px-3 py-2 text-caption text-muted">{payload}</code>
        </div>
      )}
    </Modal>
  );
}

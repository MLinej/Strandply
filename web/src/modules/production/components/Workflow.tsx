import { CheckCircle2, ClipboardCheck, Send, Undo2, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { DocKind, WfState } from '@contracts/production';
import { useSession } from '@/app/session';
import { Button, Modal, Textarea, useToast } from '@/components/ui';
import { errorMessage } from '../../samples/ui/errors';
import { useWorkflow, type WfCall } from '../api';

type Choice = { call: WfCall['step']; decision?: string; label: string; title: string; danger?: boolean };

/**
 * The buttons a user may press on a document in its current state (legacy refresh*Buttons):
 * send (edit), review / return (production_review), approve / reject (production_approve). Each asks for an optional note.
 */
export function WorkflowActions({ kind, id, docNo, state, size = 'md' }: { kind: DocKind; id: string; docNo: string; state: WfState; size?: 'sm' | 'md' }) {
  const toast = useToast();
  const { canDo } = useSession();
  const wf = useWorkflow(kind);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [note, setNote] = useState('');
  const options: (Choice & { icon: typeof Send; primary?: boolean })[] = [];
  if (state === 'draft' && canDo('edit')) options.push({ call: 'send', label: 'Send for review', title: `Send ${docNo} for review`, icon: Send, primary: true });
  if (state === 'review' && canDo('production_review')) {
    options.push({ call: 'review', decision: 'return', label: 'Return', title: `Return ${docNo} to draft`, icon: Undo2, danger: true });
    options.push({ call: 'review', decision: 'review', label: 'Mark reviewed', title: `Mark ${docNo} reviewed`, icon: ClipboardCheck, primary: true });
  }
  if (state === 'reviewed' && canDo('production_approve')) {
    options.push({ call: 'approve', decision: 'reject', label: 'Reject', title: `Reject ${docNo}`, icon: XCircle, danger: true });
    options.push({ call: 'approve', decision: 'approve', label: 'Approve', title: `Approve ${docNo}`, icon: CheckCircle2, primary: true });
  }
  async function confirm() {
    const c = choice!;
    const call = (c.call === 'send' ? { step: 'send', note: note.trim() || null } : { step: c.call, decision: c.decision, note: note.trim() || null }) as WfCall;
    try {
      const r = await wf.mutateAsync({ id, call });
      toast({ tone: 'success', title: `${r.docNo}: ${c.label.toLowerCase()}` });
      setChoice(null);
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t ${c.label.toLowerCase()}`, description: errorMessage(err) });
    }
  }
  return (
    <>
      {options.map((o) => (
        <Button
          key={o.label}
          size={size}
          variant={o.primary ? 'primary' : 'secondary'}
          icon={o.icon}
          onClick={() => {
            setNote('');
            setChoice(o);
          }}
        >
          {o.label}
        </Button>
      ))}
      <Modal
        open={!!choice}
        onClose={() => setChoice(null)}
        size="sm"
        title={choice?.title ?? ''}
        footer={
          <>
            <Button onClick={() => setChoice(null)}>Cancel</Button>
            <Button variant="primary" loading={wf.isPending} onClick={() => void confirm()}>
              {choice?.label}
            </Button>
          </>
        }
      >
        <Textarea label={choice?.danger ? 'Reason' : 'Note (optional)'} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Modal>
    </>
  );
}

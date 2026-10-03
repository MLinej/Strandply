import { Copy, Mail, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Input, Modal, Textarea, useToast } from '@/components/ui';
import { errorMessage } from '../../samples/ui/errors';
import { fetchEmail, type DocPath } from '../api';
import { printSalesDoc } from '../print';

/**
 * Legacy "Send Email": subject and body from the Sales settings template, default recipients, all editable.
 * There's no mail server: it opens the person's mail app (mailto:) or copies the text; print the PDF to attach.
 */
export function EmailDialog({ path, id, no, onClose }: { path: DocPath; id: string | null; no: string; onClose: () => void }) {
  const toast = useToast();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchEmail(path, id)
      .then((e) => {
        setTo(e.to.join(', '));
        setSubject(e.subject);
        setBody(e.body);
      })
      .catch((err) => toast({ tone: 'error', title: 'Couldn’t load the email', description: errorMessage(err) }))
      .finally(() => setLoading(false));
    // Only when the document changes.
  }, [id, path]);

  const mailto = `mailto:${to.split(',').map((s) => s.trim()).filter(Boolean).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
      toast({ tone: 'success', title: 'Copied' });
    } catch {
      toast({ tone: 'error', title: 'Couldn’t copy', description: 'Select the text and copy it instead.' });
    }
  }

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      size="lg"
      title={`Email ${no}`}
      description="Opens in your mail app. Print the PDF first to attach it."
      footer={
        <>
          <Button icon={Printer} onClick={() => id && void printSalesDoc(path, id).catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) }))}>
            Print PDF
          </Button>
          <Button icon={Copy} onClick={() => void copy()} disabled={loading}>
            Copy
          </Button>
          <Button
            variant="primary"
            icon={Mail}
            disabled={loading}
            onClick={() => {
              window.location.href = mailto;
              onClose();
            }}
          >
            Open in mail app
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="To" value={to} onChange={(e) => setTo(e.target.value)} hint="Separate addresses with commas" />
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea label="Message" rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
    </Modal>
  );
}

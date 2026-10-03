import { Lock, LockOpen, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSession } from '@/app/session';
import { Button, Card, Input, Pill, Skeleton, useToast } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage } from '../../samples/ui/errors';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useProductionMeta, useSaveProductionSettings, useSetFyClosed } from '../api';

/** A master list edited as chips (legacy Thickness / Size masters). */
function ListMaster({ title, items, suffix = '', placeholder, onSave, busy, editable, numeric }: { title: string; items: string[]; suffix?: string; placeholder: string; onSave: (next: string[]) => Promise<void>; busy: boolean; editable: boolean; numeric?: boolean }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  async function add() {
    const v = value.trim();
    if (!v) return;
    if (numeric && !/^\d+(\.\d+)?$/.test(v)) return setError('Enter a number');
    if (items.includes(numeric ? String(Number(v)) : v)) return setError('Already in the list');
    await onSave([...items, v]);
    setValue('');
    setError(undefined);
  }
  return (
    <Card title={title} description="Used by every production form.">
      <div className="mb-3 flex flex-wrap gap-1.5" aria-label={title}>
        {items.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full border border-border bg-page px-2.5 py-0.5 text-sm tabular-nums">
            {t}
            {suffix}
            {editable && items.length > 1 && (
              <button type="button" aria-label={`Remove ${t}${suffix}`} className="text-faint hover:text-primary" onClick={() => void onSave(items.filter((x) => x !== t))}>
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
            void add();
          }}
        >
          <Input aria-label={`New ${title.toLowerCase()}`} placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} error={error} containerClassName="flex-1" />
          <Button type="submit" icon={Plus} loading={busy}>
            Add
          </Button>
        </form>
      )}
    </Card>
  );
}

/** Production settings (legacy Security & Settings). PIN roles, session lock and PDF themes became app sign-in and permissions. */
export function SettingsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const meta = useProductionMeta().data;
  const save = useSaveProductionSettings();
  const fy = useSetFyClosed();
  const [factors, setFactors] = useState({ boardsPerCharge: '', wetWoodFactor: '' });
  const [confirm, setConfirm] = useState<{ fy: string; closed: boolean } | null>(null);
  useEffect(() => {
    if (meta) setFactors({ boardsPerCharge: String(meta.settings.boardsPerCharge), wetWoodFactor: String(meta.settings.wetWoodFactor) });
  }, [meta?.settings.boardsPerCharge, meta?.settings.wetWoodFactor]);
  const editable = canDo('edit');
  const run = async (input: Parameters<typeof save.mutateAsync>[0], ok: string) => {
    try {
      await save.mutateAsync(input);
      toast({ tone: 'success', title: ok });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  };
  if (!meta) return <Skeleton className="m-6 h-96" />;
  const s = meta.settings;
  return (
    <div className="flex max-w-4xl flex-col gap-3.5 p-6">
      <PageHeader title="Production settings" description="Master lists, planning factors and the financial-year lock." />
      <div className="grid gap-3 md:grid-cols-2">
        <ListMaster title="Thicknesses" items={s.thicknesses} suffix=" mm" placeholder="e.g. 26" numeric busy={save.isPending} editable={editable} onSave={(next) => run({ thicknesses: next }, 'Thicknesses saved')} />
        <ListMaster title="Sizes" items={s.sizes} placeholder="e.g. 7x4" busy={save.isPending} editable={editable} onSave={(next) => run({ sizes: next }, 'Sizes saved')} />
      </div>
      <Card title="Planning factors" description="How production plans estimate charges and wood.">
        <form
          className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void run({ boardsPerCharge: Number(factors.boardsPerCharge), wetWoodFactor: Number(factors.wetWoodFactor) }, 'Planning factors saved');
          }}
        >
          <Input label="Boards per press charge" inputMode="numeric" value={factors.boardsPerCharge} onChange={(e) => setFactors((x) => ({ ...x, boardsPerCharge: e.target.value }))} disabled={!editable} />
          <Input label="Wet wood per kg dry wood" inputMode="decimal" value={factors.wetWoodFactor} onChange={(e) => setFactors((x) => ({ ...x, wetWoodFactor: e.target.value }))} disabled={!editable} />
          {editable && (
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          )}
        </form>
      </Card>
      <Card flush title="Financial years" description="Closing a year makes its production records read-only. It can be reopened to correct a mistake.">
        <table className="w-full text-sm" aria-label="Financial years">
          <tbody>
            {meta.fys.map((y) => {
              const closed = s.closedFys.includes(y);
              return (
                <tr key={y} className="border-t border-divider first:border-0">
                  <td className="px-5 py-2 font-medium">FY {y}</td>
                  <td className="px-5 py-2">{closed ? <Pill tone="neutral">Closed</Pill> : <Pill tone="green">Open</Pill>}</td>
                  <td className="px-5 py-2 text-right">
                    {canDo('production_approve') && (
                      <Button size="sm" variant="ghost" icon={closed ? LockOpen : Lock} onClick={() => setConfirm({ fy: y, closed: !closed })}>
                        {closed ? 'Reopen' : 'Close year'}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.closed ? `Close FY ${confirm.fy}?` : `Reopen FY ${confirm?.fy ?? ''}?`}
        confirmLabel={confirm?.closed ? 'Close year' : 'Reopen'}
        busy={fy.isPending}
        onConfirm={() =>
          void fy
            .mutateAsync(confirm!)
            .then(() => toast({ tone: 'success', title: `FY ${confirm!.fy} ${confirm!.closed ? 'closed' : 'reopened'}` }))
            .catch((err) => toast({ tone: 'error', title: 'Couldn’t change the year', description: errorMessage(err) }))
            .finally(() => setConfirm(null))
        }
        onClose={() => setConfirm(null)}
      >
        {confirm?.closed ? 'Its records can still be viewed and printed, but not added, edited, deleted or signed off. Nothing is deleted.' : 'Its records become editable again. Only do this to correct a mistake.'}
      </ConfirmDialog>
    </div>
  );
}

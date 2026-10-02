import { CheckCircle2, Download, Lock, PackageOpen, Unlock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { amountFor, fyEnd, MATERIAL_BY_ID, MATERIALS, prevFy, rateUnitOf, type InventoryView, type LedgerRow, type MaterialId } from '@contracts/purchase';
import { useSession } from '@/app/session';
import { Button, Card, Input, KpiTile, Modal, Pill, Skeleton, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { errorMessage } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportInventory, rupeesToPaise, useInventory, useOpeningApproval, usePurchaseMeta, useSaveOpening, useSetConsumption } from '../api';
import { FySelect, inr, inrShort, materialLabel, qtyFmt, qtyWithUnit, useFy } from '../ui';

const rowLabel = (r: { material: MaterialId; species: string | null }) => `${materialLabel(r.material)}${r.species ? ` — ${r.species}` : ''}`;

type Line = { material: MaterialId; species: string | null; qty: string; rate: string; remarks: string };

/** Opening stock per FY (legacy openingStockModal): Nilgiri per species, others per material. */
function OpeningDialog({ fy, view, open, onClose }: { fy: string; view: InventoryView; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveOpening();
  const species = (usePurchaseMeta().data?.types ?? []).filter((t) => t.kind === 'nilgiri_species').map((t) => t.name);
  const [asOn, setAsOn] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  useEffect(() => {
    if (!open) return;
    setAsOn(view.opening.asOnDate || fyEnd(prevFy(fy)));
    type Key = { material: MaterialId; species: string | null };
    const nilgiriSpecies = [...new Set([...species, ...view.opening.items.filter((i) => i.material === 'nilgiri').map((i) => i.species ?? 'Unspecified')])];
    const keys = MATERIALS.flatMap((m): Key[] => (m.id === 'nilgiri' ? nilgiriSpecies.map((s) => ({ material: m.id, species: s })) : [{ material: m.id, species: null }]));
    setLines(
      keys.map((k) => {
        const it = view.opening.items.find((i) => i.material === k.material && (i.species ?? null) === k.species);
        return { ...k, qty: it ? String(it.qty) : '', rate: it ? String(it.ratePaise / 100) : '', remarks: it?.remarks ?? '' };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the dialog opens
  }, [open]);
  const value = (l: Line) => amountFor(l.material, Number(l.qty) || 0, rupeesToPaise(l.rate || '0'));
  const total = lines.reduce((s, l) => s + value(l), 0);
  async function submit(mode: 'draft' | 'submit') {
    try {
      await save.mutateAsync({
        fy,
        input: { asOnDate: asOn, mode, items: lines.map((l) => ({ material: l.material, species: l.species, qty: Number(l.qty) || 0, ratePaise: rupeesToPaise(l.rate || '0'), remarks: l.remarks.trim() || null })) },
      });
      toast({ tone: 'success', title: mode === 'submit' ? `Opening stock for FY ${fy} sent for approval` : 'Draft saved' });
      onClose();
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t save the opening stock', description: errorMessage(err) });
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={`Opening stock, FY ${fy}`}
      description="Stock on hand when this financial year began. Once approved it is locked; a correction needs unlocking and approving again."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => void submit('draft')}>
            Save draft
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => void submit('submit')}>
            Save and request approval
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {view.opening.source === 'carried' && <p className="rounded border border-amber/30 bg-amber-light px-3 py-2 text-sm text-amber">Filled in from FY {prevFy(fy)}’s closing stock. Check it and save.</p>}
        <Input label="As on" type="date" value={asOn} onChange={(e) => setAsOn(e.target.value)} containerClassName="w-[180px]" />
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-page text-left text-label font-semibold uppercase tracking-label text-muted">
              <tr>
                <th className="px-3 py-2">Material</th>
                <th className="px-3 py-2">Quantity</th>
                <th className="px-3 py-2">Rate</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2">Location / remarks</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const m = MATERIAL_BY_ID[l.material];
                const upd = (patch: Partial<Line>) => setLines((x) => x.map((y, j) => (j === i ? { ...y, ...patch } : y)));
                return (
                  <tr key={`${l.material}|${l.species}`} className="border-t border-divider">
                    <td className="px-3 py-1.5 font-medium">{rowLabel(l)}</td>
                    <td className="px-3 py-1.5">
                      <Input aria-label={`Quantity, ${rowLabel(l)}`} inputMode="decimal" suffix={m.unit} value={l.qty} onChange={(e) => upd({ qty: e.target.value })} containerClassName="w-[150px]" />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input aria-label={`Rate, ${rowLabel(l)}`} inputMode="decimal" suffix={`/${rateUnitOf(m)}`} value={l.rate} onChange={(e) => upd({ rate: e.target.value })} containerClassName="w-[150px]" />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{value(l) ? inr(value(l)) : '—'}</td>
                    <td className="px-3 py-1.5">
                      <Input aria-label={`Remarks, ${rowLabel(l)}`} value={l.remarks} onChange={(e) => upd({ remarks: e.target.value })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-page font-semibold">
                <td className="px-3 py-2" colSpan={3}>
                  Total opening value
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{inr(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function ConsumptionCell({ fy, row, editable }: { fy: string; row: LedgerRow; editable: boolean }) {
  const toast = useToast();
  const set = useSetConsumption();
  const [v, setV] = useState(row.consumeQty ? String(row.consumeQty) : '');
  useEffect(() => setV(row.consumeQty ? String(row.consumeQty) : ''), [row.consumeQty]);
  if (!editable) return <>{row.consumeQty ? qtyFmt(row.consumeQty) : '—'}</>;
  const commit = () => {
    const qty = Number(v) || 0;
    if (qty === row.consumeQty) return;
    void set.mutateAsync({ fy, input: { key: row.key, qty } }).catch((err) => toast({ tone: 'error', title: 'Couldn’t save consumption', description: errorMessage(err) }));
  };
  return (
    <Input
      aria-label={`Consumption, ${rowLabel(row)}`}
      inputMode="decimal"
      value={v}
      placeholder="0"
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      containerClassName="w-[120px] ml-auto"
      className="text-right"
    />
  );
}

/** Raw material stock ledger by FY (legacy Inventory page). Values at basic rate, GST excluded. */
export function InventoryPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['fy'] as const);
  const { fy, fys } = useFy(url.values.fy);
  const inv = useInventory(fy || undefined);
  const approval = useOpeningApproval();
  const [editing, setEditing] = useState(false);
  const v = inv.data;
  const o = v?.opening;
  const locked = o?.status === 'approved';

  const act = (action: 'approve' | 'unlock') =>
    void approval.mutateAsync({ fy, action }).then(
      () => toast({ tone: 'success', title: action === 'approve' ? 'Opening stock approved and locked' : 'Opening stock unlocked' }),
      (err) => toast({ tone: 'error', title: 'Couldn’t update the opening stock', description: errorMessage(err) }),
    );

  const totals = v && {
    open: v.rows.reduce((s, r) => s + r.openPaise, 0),
    purch: v.rows.reduce((s, r) => s + r.purchPaise, 0),
    ret: v.rows.reduce((s, r) => s + r.returnPaise, 0),
    cons: v.rows.reduce((s, r) => s + r.consumePaise, 0),
    close: v.rows.reduce((s, r) => s + r.closingPaise, 0),
  };

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Raw material stock"
        description="Opening + purchases − returns − consumption = closing, for each financial year. Values at basic rate (GST is input credit)."
        actions={
          <>
            <FySelect value={fy} fys={fys} onChange={(f) => url.set({ fy: f })} />
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportInventory(fy).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
          </>
        }
      />
      {!v || !o || !totals ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <Card
            title={
              <span className="flex items-center gap-2">
                Opening stock as on {formatDate(o.asOnDate)}
                {o.status === 'approved' && (
                  <Pill tone="green">
                    <Lock size={11} className="mr-1" aria-hidden />
                    Approved
                  </Pill>
                )}
                {o.status === 'pending' && <Pill tone="amber">Awaiting approval</Pill>}
                {o.status === 'draft' && <Pill>Draft</Pill>}
                {o.source === 'carried' && <Pill tone="purple">Carried from FY {prevFy(fy)}</Pill>}
                {o.source === 'blank' && <Pill>Not entered</Pill>}
              </span>
            }
            description={o.status === 'approved' && o.approvedByName ? `Approved by ${o.approvedByName}${o.approvedAt ? `, ${formatDate(o.approvedAt.slice(0, 10))}` : ''}` : undefined}
            actions={
              <span className="flex gap-2">
                {canDo('purchase_approve') && o.status === 'pending' && (
                  <Button icon={CheckCircle2} loading={approval.isPending} onClick={() => act('approve')}>
                    Approve
                  </Button>
                )}
                {canDo('purchase_approve') && locked && (
                  <Button icon={Unlock} loading={approval.isPending} onClick={() => act('unlock')}>
                    Unlock
                  </Button>
                )}
                {canDo('edit') && !locked && (
                  <Button variant="primary" icon={PackageOpen} onClick={() => setEditing(true)}>
                    {o.source === 'saved' ? 'Edit opening stock' : 'Enter opening stock'}
                  </Button>
                )}
              </span>
            }
          >
            {o.items.length ? (
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {o.items.map((i) => (
                  <span key={`${i.material}|${i.species}`}>
                    <span className="text-muted">{rowLabel(i)}:</span> <strong className="tabular-nums">{qtyWithUnit(i.material, i.qty)}</strong> <span className="text-faint">{inr(i.valuePaise)}</span>
                  </span>
                ))}
                <span className="ml-auto font-semibold">Total {inr(o.totalPaise)}</span>
              </div>
            ) : (
              <p className="text-sm text-muted">No opening stock for this year yet.</p>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {MATERIALS.map((m) => {
              const rs = v.rows.filter((r) => r.material === m.id);
              return <KpiTile key={m.id} variant="compact" label={m.label} value={qtyWithUnit(m.id, rs.reduce((s, r) => s + r.closingQty, 0), { tons: true })} meta={inrShort(rs.reduce((s, r) => s + r.closingPaise, 0))} />;
            })}
          </div>

          <Card flush title={`Stock ledger, FY ${fy}`} description={canDo('edit') ? 'Type consumption from the chipping / production report; closing updates as you go.' : undefined}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm" aria-label="Stock ledger">
                <thead className="border-y border-divider bg-page text-label font-semibold uppercase tracking-label text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Material</th>
                    <th className="px-3 py-2 text-right">Opening</th>
                    <th className="px-3 py-2 text-right">Purchased</th>
                    <th className="px-3 py-2 text-right">Returned</th>
                    <th className="px-3 py-2 text-right">Consumed</th>
                    <th className="px-3 py-2 text-right">Closing</th>
                    <th className="px-3 py-2 text-right">Closing value</th>
                    <th className="px-3 py-2 text-right">Avg rate</th>
                  </tr>
                </thead>
                <tbody>
                  {v.rows.map((r) => (
                    <tr key={r.key} className="border-b border-divider">
                      <td className="px-3 py-1.5 font-medium">
                        {rowLabel(r)}
                        <span className="block text-caption font-normal text-faint">{r.entries} entr{r.entries === 1 ? 'y' : 'ies'}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.openQty ? qtyFmt(r.openQty) : '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.purchQty ? qtyFmt(r.purchQty) : '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.returnQty ? qtyFmt(r.returnQty) : '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        <ConsumptionCell fy={fy} row={r} editable={canDo('edit')} />
                      </td>
                      <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${r.closingQty < 0 ? 'text-primary' : ''}`}>{qtyWithUnit(r.material, r.closingQty)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{inr(r.closingPaise)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted">{r.avgRatePaise === null ? '—' : `${inr(r.avgRatePaise)}/${rateUnitOf(MATERIAL_BY_ID[r.material])}`}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-page font-semibold">
                    <td className="px-3 py-2">Total value</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inrShort(totals.open)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inrShort(totals.purch)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inrShort(totals.ret)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inrShort(totals.cons)}</td>
                    <td />
                    <td className="px-3 py-2 text-right tabular-nums">{inr(totals.close)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card flush title="Stock ageing" description="Closing stock by age, first in first out: what remains is the most recent receipts.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-y border-divider bg-page text-label font-semibold uppercase tracking-label text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Material</th>
                    {v.ageing[0]?.buckets.map((b) => (
                      <th key={b.label} className="px-3 py-2 text-right">
                        {b.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {v.ageing
                    .filter((a) => a.buckets.some((b) => b.qty))
                    .map((a) => (
                      <tr key={a.material} className="border-b border-divider">
                        <td className="px-3 py-1.5 font-medium">{materialLabel(a.material)}</td>
                        {a.buckets.map((b) => (
                          <td key={b.label} className="px-3 py-1.5 text-right tabular-nums">
                            {b.qty ? (
                              <>
                                {qtyFmt(b.qty)}
                                <span className="block text-caption text-faint">{inrShort(b.paise)}</span>
                              </>
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
          <OpeningDialog fy={fy} view={v} open={editing} onClose={() => setEditing(false)} />
        </>
      )}
    </div>
  );
}

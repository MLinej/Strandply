import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { DOC_KINDS, mattStatus, PLAN_SECTIONS, type DocKind, type MattBatchView, type WfStep } from '@contracts/production';
import type { CompanyBlock } from '@contracts/sampletrack';
import { formatAmount, formatDate, formatDateTime } from '@/lib/format';
import { PAGES, printHtml } from '@/lib/print';
import { amountInWords, Box, DocHeader, DocTable, Grid, KIT_CSS, KV, MUTED, Pill, RED, Sheet, Signatures, Tile, WriteBlank, type Signer } from '@/lib/print-kit';
import { fetchDocPrint, fetchMattPrint, type CompareRow, type PrintPayload, type ViewByKind } from './api';
import { inr, kg, mins, perKg, qtyFmt, wfLabel } from './ui';


type Cell = string | number | null | undefined;
interface Table {
  title?: string;
  head: string[];
  numeric?: number[];
  rows: Cell[][];
  foot?: Cell[];
}
interface Sections {
  fields: [string, Cell][];
  tables: Table[];
}

const d = (x: string | null | undefined) => (x ? formatDate(x) : '—');
const v = (x: Cell) => (x === null || x === undefined || x === '' ? '—' : String(x));

/** What each kind prints (legacy hpDlPDF, chipDlPDF, resinDlPDF, bcDlPDF, mdoDlPDF, ppDlPDF, psDlPDF). */
function sections<K extends DocKind>(kind: K, doc: ViewByKind[K]): Sections {
  switch (kind) {
    case 'hotpress': {
      const h = doc as ViewByKind['hotpress'];
      return {
        fields: [
          ['Shift', h.shift],
          ['Product', `${h.product} · ${h.size}${h.thickness ? ` · ${h.thickness} mm` : ''}`],
          ['Operator', h.operator],
          ['Total boards', qtyFmt(h.calc.totalBoards)],
          ['Press time', mins(h.calc.pressMins)],
          ['Total time', mins(h.calc.totalMins)],
          ['Spare time', mins(h.calc.spareMins)],
          ['Average per charge', mins(h.calc.avgPressMins)],
          ['Board cutting', h.cuttingNo],
        ],
        tables: [
          {
            title: 'Charges',
            head: ['#', 'Charge', 'Pcs', 'Load', 'Unload', 'Time', 'Remarks'],
            numeric: [2],
            rows: h.charges.map((c, i) => [i + 1, c.label, c.pcs, c.load, c.unload, h.calc.perCharge[i] ? mins(h.calc.perCharge[i]!) : '—', c.remarks]),
            foot: ['', 'Total', h.calc.totalBoards, '', '', mins(h.calc.pressMins), ''],
          },
        ],
      };
    }
    case 'chipping': {
      const c = doc as ViewByKind['chipping'];
      return {
        fields: [
          ['Shift', c.shift],
          ['Machine', c.machine],
          ['Operator', c.operator],
          ['Total', kg(c.totalKg)],
          ['Amount', inr(c.totalPaise)],
          ['Average rate', perKg(c.avgRatePaise)],
          ['WIP batch', c.wipNo],
        ],
        tables: [{ title: 'Lots consumed', head: ['Lot', 'Qty (kg)', 'Net rate', 'Amount'], numeric: [1, 2, 3], rows: c.lots.map((l) => [l.lotNo, qtyFmt(l.qty), perKg(l.ratePaise), inr(l.amountPaise)]), foot: ['Total', qtyFmt(c.totalKg), perKg(c.avgRatePaise), inr(c.totalPaise)] }],
      };
    }
    case 'resin': {
      const r = doc as ViewByKind['resin'];
      return {
        fields: [
          ['Shift', r.shift],
          ['Lot', `${r.lot.lotNo} · ${r.vendorName ?? ''}`],
          ['Invoice', r.invoiceNo],
          ['Quantity', kg(r.lot.qty)],
          ['Rate', perKg(r.lot.ratePaise)],
          ['Amount', inr(r.lot.amountPaise)],
          ['Product', r.product],
          ['Operator', r.operator],
        ],
        tables: [],
      };
    }
    case 'cutting': {
      const b = doc as ViewByKind['cutting'];
      return {
        fields: [
          ['Hot press report', b.hotpressNo],
          ['Shift', b.shift],
          ['Product', `${v(b.product)} · ${v(b.size)}`],
          ['Operator', b.operator],
          ['Boards pressed', qtyFmt(b.hpPcs)],
          ['Boards cut', qtyFmt(b.cutPcs)],
          ['Rejects', `${qtyFmt(b.rejectPcs)} (${b.rejectPct}%)`],
        ],
        tables: [],
      };
    }
    case 'mdo': {
      const m = doc as ViewByKind['mdo'];
      return {
        fields: [
          ['Shift', m.shift],
          ['Operator', m.operator],
          ['Press start', m.pressStart],
          ['Press end', m.pressEnd],
          ['Working time', m.workingMins === null ? null : mins(m.workingMins)],
          ['Total pcs', qtyFmt(m.totalPcs)],
          ['Paper used', m.paperUsed],
          ['Paper wastage', m.paperWastage],
        ],
        tables: [{ title: 'Items', head: ['Board type', 'Thickness', 'Paper', 'Type', 'Finish', 'Pcs', 'Cycle'], numeric: [5], rows: m.items.map((x) => [x.boardType, x.thickness, x.paper, x.type, x.finish, x.pcs, x.cycleTime]) }],
      };
    }
    case 'plan': {
      const p = doc as ViewByKind['plan'];
      return {
        fields: [
          ['Shift', p.shift],
          ['Planned by', p.planOp],
          ['Target matt weight', p.mattWtKg === null ? null : kg(p.mattWtKg)],
          ['Matts', p.matts ?? p.calc.totalBoards],
          ['Resin per matt', p.resinPerMattKg === null ? null : kg(p.resinPerMattKg)],
          ['Wet wood on floor', p.wetWoodAvailKg === null ? null : kg(p.wetWoodAvailKg)],
        ],
        tables: [
          {
            title: 'Products',
            head: ['Product', 'Size', 'Thickness', 'Priority', 'Boards', 'Sqft', 'Charges'],
            numeric: [4, 5, 6],
            rows: p.products.map((x, i) => [x.product, x.size, `${x.thickness} mm`, x.priority, qtyFmt(x.targetBoards), qtyFmt(p.calc.lines[i]!.sqft), p.calc.lines[i]!.charges]),
            foot: ['Total', '', '', '', qtyFmt(p.calc.totalBoards), qtyFmt(p.calc.totalSqft), p.calc.totalCharges],
          },
          ...PLAN_SECTIONS.map((s) => ({ title: s.title, head: ['Parameter', 'Value'], rows: s.fields.map((f) => [f.label, v(p.process[f.key])] as Cell[]) })).filter((t) => t.rows.some((r) => r[1] !== '—')),
          {
            title: 'Raw material requirement',
            head: ['Material', 'Required (kg)'],
            numeric: [1],
            rows: [
              ['Resin', qtyFmt(p.calc.resinReqKg)],
              ['Dry wood', qtyFmt(p.calc.dryWoodReqKg)],
              ['Wet wood', qtyFmt(p.calc.wetWoodReqKg)],
            ],
          },
        ],
      };
    }
    case 'summary': {
      const s = doc as ViewByKind['summary'];
      return {
        fields: [
          ['Product', `${s.product} · ${s.size}${s.thickness ? ` · ${s.thickness} mm` : ''}`],
          ['Batch', s.batch],
          ['Press pcs', qtyFmt(s.pressPcs)],
          ['Boards produced', qtyFmt(s.boards)],
          ['Board rejects', `${qtyFmt(s.boardRej)} (${s.boardRejPct}%)`],
          ['Matts', qtyFmt(s.mattPcs)],
          ['Matt weight', kg(s.mattWtKg)],
          ['Matt rejects', qtyFmt(s.mattRej)],
          ['Resin', `${kg(s.resinKg)} · ${inr(s.resinPaise)}`],
          ['Dry wood', kg(s.dryWoodKg)],
          ['Wet wood', `${kg(s.wetWoodKg)} · ${inr(s.wetWoodPaise)}`],
          ['Linked', [s.links.planNo, s.links.hotpressNo, s.links.mattNo, ...s.links.resinNos, s.links.cuttingNo].filter(Boolean).join(', ')],
        ],
        tables: s.wip.length ? [{ title: 'WIP Nilgiri used', head: ['WIP batch', 'Qty (kg)'], numeric: [1], rows: s.wip.map((w, i) => [s.links.wipNos[i], qtyFmt(w.qty)]) }] : [],
      };
    }
  }
  return { fields: [], tables: [] };
}

const compareTable = (rows: CompareRow[]): Table => ({
  title: 'Plan vs actual',
  head: ['Metric', 'Plan', 'Actual', 'Variance', 'Status'],
  numeric: [1, 2, 3],
  rows: rows.map((r) => [r.metric, r.plan === null ? '—' : qtyFmt(r.plan), r.actual === null ? '—' : qtyFmt(r.actual), r.variance === null ? '—' : `${r.variance > 0 ? '+' : ''}${qtyFmt(r.variance)}`, r.status]),
});

const DOC_TITLE: Partial<Record<DocKind, string>> = { chipping: 'Chipping report' };
const A4_PAGE_H = 297 - 24 - 2;
const footerLine = (company: CompanyBlock, what: string, generatedAt: string) => `${company.name} — Production · ${what} · Generated ${formatDateTime(generatedAt)} · Page 1 of 1`;
const WF_TONE = { draft: 'neutral', review: 'amber', reviewed: 'purple', approved: 'green' } as const;

/** Prepared / reviewed / approved from the workflow trail, after the machine operator. */
function wfSigners(trail: WfStep[], operator: string | null): Signer[] {
  const last = (a: WfStep['action']) => [...trail].reverse().find((x) => x.action === a);
  const sent = trail.find((x) => x.action === 'send');
  return [
    { role: 'Machine operator', name: operator },
    { role: 'Prepared by', name: sent?.byName, at: sent?.at },
    { role: 'Reviewed by', name: last('review')?.byName, at: last('review')?.at },
    { role: 'Approved by', name: last('approve')?.byName, at: last('approve')?.at },
  ];
}

/** Title block on the right: document no., date and status pill. */
const headRight = (no: string, date: string, status: ReactNode) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2.5mm', marginTop: 4 }}>
    <strong style={{ fontSize: 12 }}>{no}</strong>
    <span style={{ color: MUTED }}>{date}</span>
    {status}
  </div>
);

const toKitTable = (t: Table) => (
  <DocTable
    label={t.title}
    cols={t.head.map((h, i) => ({ header: h, align: t.numeric?.includes(i) ? 'right' : 'left' }))}
    rows={t.rows.map((r) => r.map((c) => v(c)))}
    foot={t.foot?.map((c) => (c === null || c === undefined ? '' : String(c)))}
  />
);

/** Chipping report: details, figure tiles, lots with supplier, product and share, amount in words. */
export function ChippingDocument({ data }: { data: PrintPayload<ViewByKind['chipping']> & { lots?: Record<string, { vendorName: string; product: string | null }> } }) {
  const c = data.doc;
  const lots = data.lots ?? {};
  return (
    <Sheet minHeightMm={A4_PAGE_H} bottom={<Signatures signers={wfSigners(c.wfTrail, c.operator)} />} footer={footerLine(data.company, 'Chipping', data.generatedAt)}>
      <DocHeader company={data.company} title="Chipping report" right={headRight(c.docNo, d(c.date), <Pill tone={WF_TONE[c.wfState]}>{wfLabel(c.wfState)}</Pill>)} />
      <Grid cols="1fr 1fr">
        <Box title="Report details">
          <KV rows={[['Report no.', c.docNo, true], ['Date', d(c.date)], ['Shift', c.shift, true], ['Status', wfLabel(c.wfState)]]} />
        </Box>
        <Box title="Machine & output">
          <KV rows={[['Machine', c.machine ?? <WriteBlank />], ['Operator', c.operator ?? <WriteBlank />], ['Output WIP batch', c.wipNo, true], ['Lots consumed', String(c.lots.length)]]} />
        </Box>
      </Grid>
      <Grid cols="1fr 1fr 1fr">
        <Tile label="Total chipped" value={kg(c.totalKg)} />
        <Tile label="Material value" value={`Rs. ${formatAmount(c.totalPaise / 100)}`} />
        <Tile label="Average rate" value={`Rs. ${formatAmount(c.avgRatePaise / 100_000)} / kg`} />
      </Grid>
      <DocTable
        label="Lots consumed"
        cols={[{ header: '#', width: '7mm' }, { header: 'Lot', width: '16mm' }, { header: 'Supplier' }, { header: 'Product' }, { header: 'Qty (kg)', align: 'right', width: '20mm' }, { header: 'Share', width: '26mm' }, { header: 'Rate (Rs./kg)', align: 'right', width: '24mm' }, { header: 'Amount (Rs.)', align: 'right', width: '28mm' }]}
        rows={c.lots.map((l, i) => {
          const share = c.totalKg ? (l.qty / c.totalKg) * 100 : 0;
          return [
            i + 1,
            <strong key="l">{l.lotNo}</strong>,
            lots[l.purchaseEntryId]?.vendorName ?? '—',
            lots[l.purchaseEntryId]?.product ?? '—',
            qtyFmt(l.qty),
            <span key="s">
              {share.toFixed(1)}%
              <span style={{ display: 'block', height: '1.2mm', background: '#E6E8EC', borderRadius: 2, marginTop: '0.8mm', width: '20mm' }}>
                <span style={{ display: 'block', height: '100%', width: `${share}%`, background: '#667085', borderRadius: 2 }} />
              </span>
            </span>,
            formatAmount(l.ratePaise / 100_000),
            formatAmount(l.amountPaise / 100),
          ];
        })}
        foot={['', 'Total', '', '', qtyFmt(c.totalKg), '100%', `${formatAmount(c.avgRatePaise / 100_000)} avg.`, formatAmount(c.totalPaise / 100)]}
      />
      <Box style={{ marginBottom: '4mm' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6mm' }}>
          <div>
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: MUTED }}>AMOUNT IN WORDS</div>
            <div style={{ fontWeight: 700 }}>{amountInWords(c.totalPaise)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: MUTED }}>AVERAGE RATE</div>
            <div>
              Rs. {formatAmount(c.totalPaise / 100)} ÷ {qtyFmt(c.totalKg)} kg = <strong>Rs. {formatAmount(c.avgRatePaise / 100_000)} / kg</strong>
            </div>
          </div>
        </div>
      </Box>
      <Box title="Remarks">
        <div style={{ minHeight: '6mm' }}>{c.remarks}</div>
      </Box>
    </Sheet>
  );
}

/** Any other production document: details card, its tables, plan vs actual, the sign-off row. */
function GenericDocument<K extends DocKind>({ kind, data }: { kind: K; data: PrintPayload<ViewByKind[K]> }) {
  const doc = data.doc as ViewByKind[K] & { docNo: string; date: string; wfState: ViewByKind['plan']['wfState']; wfTrail: WfStep[]; remarks: string | null; operator?: string | null };
  const s = sections(kind, doc);
  const tables = [...s.tables, ...(data.compare.length ? [compareTable(data.compare)] : [])];
  const half = Math.ceil(s.fields.length / 2);
  const kv = (fs: [string, Cell][]) => fs.map(([k, x]) => [k, v(x)] as [string, ReactNode]);
  return (
    <Sheet minHeightMm={A4_PAGE_H} bottom={<Signatures signers={wfSigners(doc.wfTrail, doc.operator ?? null)} />} footer={footerLine(data.company, DOC_KINDS[kind].label, data.generatedAt)}>
      <DocHeader company={data.company} title={DOC_TITLE[kind] ?? DOC_KINDS[kind].label} right={headRight(doc.docNo, d(doc.date), <Pill tone={WF_TONE[doc.wfState]}>{wfLabel(doc.wfState)}</Pill>)} />
      <Grid cols="1fr 1fr">
        <Box title="Report details">
          <KV rows={[['Report no.', doc.docNo, true], ['Date', d(doc.date)], ...kv(s.fields.slice(0, Math.max(0, half - 2)))]} />
        </Box>
        <Box title="Details">
          <KV rows={kv(s.fields.slice(Math.max(0, half - 2)))} />
        </Box>
      </Grid>
      {tables.map((t, i) => (
        <div key={i}>{toKitTable(t)}</div>
      ))}
      <Box title="Remarks">
        <div style={{ minHeight: '6mm' }}>{doc.remarks}</div>
      </Box>
    </Sheet>
  );
}

const A4 = { page: PAGES.requestSlip, marginMm: 12, css: KIT_CSS };

export async function printDoc<K extends DocKind>(kind: K, id: string) {
  const data = await fetchDocPrint(kind, id);
  const no = (data.doc as { docNo: string }).docNo;
  const body = kind === 'chipping' ? <ChippingDocument data={data as unknown as PrintPayload<ViewByKind['chipping']>} /> : <GenericDocument kind={kind} data={data} />;
  await printHtml({ ...A4, title: no, bodyHtml: renderToStaticMarkup(body) });
}

const STATUS_TONE = { pass: 'green', warn: 'amber', fail: 'red' } as const;
const STATUS_LABEL = { pass: 'Pass', warn: 'Warn', fail: 'Reject' } as const;
const kg1 = (n: number) => `${qtyFmt(Math.round(n * 1000) / 1000)} kg`;
const signed = (n: number, digits = 3) => `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;
const shortStamp = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso));
const shortTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso));

/** Matt weight report: batch and setpoint, figure tiles, each matt with its deviation and status. */
export function MattDocument({ data }: { data: PrintPayload<MattBatchView> }) {
  const b = data.doc;
  const st = b.stats;
  const n = b.weights.length;
  const over = st.total - b.setpoint * n;
  const avgDev = n ? st.avg - b.setpoint : 0;
  const times = b.weights.map((w) => w.at).sort();
  return (
    <Sheet
      minHeightMm={A4_PAGE_H}
      bottom={<Signatures signers={[{ role: 'Machine operator', name: b.operator }, { role: 'Prepared by', name: b.createdByName, at: b.createdAt }, { role: 'Reviewed by' }, { role: 'Approved by' }]} />}
      footer={footerLine(data.company, 'Matt weight', data.generatedAt)}
    >
      <DocHeader company={data.company} title="Matt weight report" right={headRight(b.docNo, d(b.date), <Pill tone={b.status === 'open' ? 'amber' : 'neutral'}>{b.status === 'open' ? 'Open' : 'Closed'}</Pill>)} />
      <Grid cols="1fr 1fr">
        <Box title="Batch details">
          <KV rows={[['Batch no.', b.docNo, true], ['Date', d(b.date)], ['Shift', b.shift, true], ['Status', b.status === 'open' ? 'Open' : 'Closed']]} />
        </Box>
        <Box title="Product & setpoint">
          <KV rows={[['Product', `${b.product} · ${b.size}${b.thickness ? ` · ${b.thickness} mm` : ''}`, true], ['Setpoint', `${b.setpoint} kg ± ${b.band} kg`, true], ['Operator', b.operator ?? <WriteBlank />], ['Matts weighed', `${st.count}${b.targetQty ? ` of ${b.targetQty}` : ''}`]]} />
        </Box>
      </Grid>
      <Grid cols="repeat(5, 1fr)" gap="3mm">
        <Tile label="Total weight" value={kg1(st.total)} sub={`${over >= 0 ? '+' : '−'}${qtyFmt(Math.abs(Math.round(over * 1000) / 1000))} kg ${over >= 0 ? 'over' : 'under'} setpoint`} />
        <Tile label="Average weight" value={kg1(st.avg)} sub={`${avgDev >= 0 ? '+' : '−'}${qtyFmt(Math.abs(Math.round(avgDev * 1000) / 1000))} kg per matt`} />
        <Tile label="Min / max" value={`${qtyFmt(st.min)} / ${qtyFmt(st.max)} kg`} sub={`Range ${qtyFmt(Math.round((st.max - st.min) * 1000) / 1000)} kg`} />
        <Tile label="Std deviation" value={kg1(st.stdDev)} sub={`Across ${st.count} matts`} />
        <Tile label="Pass rate" value={`${st.passRate}%`} sub={`${st.pass} pass · ${st.warn} warn · ${st.fail} rej.`} alert={st.passRate < 80} />
      </Grid>
      <DocTable
        label="Matt readings"
        cols={[{ header: '#', width: '10mm' }, { header: 'Weight (kg)', align: 'right' }, { header: 'Setpoint (kg)', align: 'right' }, { header: 'Deviation (kg)', align: 'right' }, { header: 'Status', width: '22mm' }, { header: 'Date & time' }]}
        rows={b.weights.map((w) => {
          const dev = Math.round((w.weight - b.setpoint) * 1000) / 1000;
          const status = mattStatus(w.weight, b.setpoint, b.band);
          return [
            w.n,
            <strong key="w">{w.weight.toFixed(3)}</strong>,
            <span key="s" style={{ color: MUTED }}>{b.setpoint.toFixed(3)}</span>,
            <span key="d" style={{ color: status === 'fail' ? RED : undefined }}>{signed(dev)}</span>,
            <Pill key="p" tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>,
            shortStamp(w.at),
          ];
        })}
        foot={['Avg.', st.avg.toFixed(3), b.setpoint.toFixed(3), signed(Math.round(avgDev * 1000) / 1000), `${st.pass} / ${st.warn} / ${st.fail}`, times.length ? `${shortTime(times[0]!)} – ${shortTime(times.at(-1)!)}` : '']}
      />
      <Box title="Remarks">
        <div style={{ minHeight: '6mm' }}>{b.remarks}</div>
      </Box>
    </Sheet>
  );
}

export async function printMatt(id: string) {
  const data = await fetchMattPrint(id);
  await printHtml({ ...A4, title: data.doc.docNo, bodyHtml: renderToStaticMarkup(<MattDocument data={data} />) });
}
export type { MattBatchView };

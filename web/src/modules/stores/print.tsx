import { renderToStaticMarkup } from 'react-dom/server';
import { qcOf, storeItemLabel, type GateCondition } from '@contracts/stores';
import { formatDate } from '@/lib/format';
import { printHtml } from '@/lib/print';
import { Box, DocHeader, DocTable, FAINT, Grid, KIT_CSS, KV, MUTED, Pill, Sheet, Signatures, type Tone } from '@/lib/print-kit';
import { fetchGrnPrint, fetchMrnPrint, type GrnPrintPayload, type MrnPrintPayload } from './api';
import { qtyFmt } from './ui';

const A4_LANDSCAPE = { size: 'A4', orientation: 'landscape', widthMm: 297, heightMm: 210 } as const;
const MARGIN = 10;
const PAGE_H = A4_LANDSCAPE.heightMm - MARGIN * 2 - 2;
const d = (iso: string | null | undefined) => (iso ? formatDate(iso) : null);
/** "14:40" → "02:40 pm". */
function clock(hm: string | null | undefined) {
  if (!hm) return null;
  const [h, m] = hm.split(':').map(Number) as [number, number];
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
const timeInOut = (a: string | null | undefined, b: string | null | undefined) => [clock(a) ?? '—', clock(b) ?? '—'].join(' / ');
const CONDITION_TONE: Record<GateCondition, Tone> = { Sealed: 'green', Good: 'green', Damaged: 'red', Leaking: 'red', Wet: 'amber' };
const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((t, x) => t + (x ?? 0), 0);
const packagesCount = (p: string | null) => Number(/^\s*(\d+(?:\.\d+)?)/.exec(p ?? '')?.[1] ?? 0);

/** Material Receipt Note, gate entry security copy (A4 landscape). No amounts at the gate. */
export function MrnDocument({ data }: { data: MrnPrintPayload }) {
  const m = data.mrn;
  const challan = [m.invoiceNo, d(m.challanDate)].filter(Boolean).join(' · ');
  return (
    <Sheet
      minHeightMm={PAGE_H}
      bottom={<Signatures signers={[{ role: 'Security', name: m.securityName }, { role: 'Stores receiver' }, { role: 'Driver', name: m.driverName }]} />}
      footer={`Computer-generated MRN · No amounts shown at gate · Page 1 of 1`}
    >
      <DocHeader
        company={data.company}
        letterhead
        title="Material receipt note"
        right={
          <>
            <div style={{ fontSize: 9.5, color: MUTED, marginTop: 2 }}>Gate entry · security copy</div>
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 3 }}>{m.mrnNo}</div>
          </>
        }
      />
      <Box title="Entry details" style={{ marginBottom: '4mm' }}>
        <Grid cols="1fr 1fr" gap="10mm" style={{ marginBottom: 0 }}>
          <KV
            rows={[
              ['MRN no.', m.mrnNo, true],
              ['Date', d(m.date)],
              ['Time in / out', timeInOut(m.time, m.timeOut)],
              ['Purchase order', m.poNo],
              ['Vendor', m.vendorName, true],
            ]}
          />
          <KV
            labelWidth="34mm"
            rows={[
              ['Challan / invoice', challan || null, true],
              ['Vehicle', m.vehicleNo],
              ['Driver · mobile', [m.driverName, m.driverPhone].filter(Boolean).join(' · ') || null],
              ['Transporter · LR', [m.transporter, m.lrNo && `LR ${m.lrNo}`].filter(Boolean).join(' · ') || null],
              ['E-way bill', m.ewayBill],
            ]}
          />
        </Grid>
      </Box>
      <DocTable
        cols={[{ header: '#', width: '8mm' }, { header: 'Item as per challan' }, { header: 'UOM', width: '18mm' }, { header: 'Packages', align: 'right', width: '24mm' }, { header: 'Challan qty', align: 'right', width: '28mm' }, { header: 'Counted at gate', align: 'right', width: '32mm' }, { header: 'Condition', width: '26mm' }]}
        rows={m.items.map((it, i) => [
          i + 1,
          <strong key="n">{storeItemLabel(it)}</strong>,
          it.unit.toUpperCase(),
          it.packages ?? '—',
          it.challanQty === null ? '—' : qtyFmt(it.challanQty),
          qtyFmt(it.approxQty),
          it.condition ? <Pill tone={CONDITION_TONE[it.condition]}>{it.condition}</Pill> : '—',
        ])}
        foot={['', 'Total', '', qtyFmt(sum(m.items.map((it) => packagesCount(it.packages)))), qtyFmt(sum(m.items.map((it) => it.challanQty))), qtyFmt(sum(m.items.map((it) => it.approxQty))), '']}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6mm' }}>
        <div>
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: MUTED, marginRight: '3mm' }}>REMARKS</span>
          {m.remarks || <span style={{ color: FAINT }}>None recorded</span>}
        </div>
        {m.status === 'pending_grn' ? <Pill tone="amber">GRN pending</Pill> : <Pill tone="green">GRN {m.grnNo}</Pill>}
      </div>
    </Sheet>
  );
}

const QC_TONE = { Passed: 'green', 'Partly rejected': 'amber', Rejected: 'red' } as const;

/** Goods Receipt Note, store count · store copy (A4 landscape). Quantities only, no amounts. */
export function GrnDocument({ data }: { data: GrnPrintPayload }) {
  const g = data.grn;
  const m = data.mrn;
  const mrnLine = (id: string | null) => (id ? m?.items.find((x) => x.id === id) : undefined);
  const steps: [string, boolean][] = [
    ['Prepared', true],
    ['Reviewed', g.status !== 'draft'],
    [g.status === 'approved' ? 'Approved' : 'Approval pending', g.status === 'approved'],
  ];
  return (
    <Sheet
      minHeightMm={PAGE_H}
      bottom={
        <Signatures
          signers={[
            { role: 'Stores Keeper', name: g.receivedByName, at: g.createdAt },
            { role: 'Quality Inspector' },
            { role: 'Reviewed by', name: g.reviewedByName, at: g.reviewedAt },
            { role: 'Approved by', name: g.approvedByName, at: g.approvedAt },
          ]}
        />
      }
      footer="Computer-generated GRN · Quantities only, no amounts · Page 1 of 1"
    >
      <DocHeader
        company={data.company}
        letterhead
        title="Goods receipt note"
        right={
          <>
            <div style={{ fontSize: 9.5, color: MUTED, marginTop: 2 }}>Store count · store copy</div>
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 3 }}>{g.grnNo}</div>
          </>
        }
      />
      <Grid cols="1.35fr 1fr">
        <Box title="Receipt details">
          <KV
            labelWidth="32mm"
            rows={[
              ['GRN no.', g.grnNo, true],
              ['GRN date', d(g.date)],
              ['Vendor', g.vendorName, true],
              ['Challan / invoice', [g.invoiceNo, d(m?.challanDate ?? null)].filter(Boolean).join(' · ')],
              ['Purchase order', m?.poNo ?? null],
              ['Store / location', g.location],
            ]}
          />
        </Box>
        <Box title="Linked MRN (gate entry)" accent titleRight={<Pill tone="green">Received</Pill>}>
          <KV
            rows={[
              ['MRN no.', g.mrnNo, true],
              ['MRN date', d(m?.date ?? null)],
              ['Time in / out', m ? timeInOut(m.time, m.timeOut) : null],
              ['Vehicle', g.vehicleNo],
              ['Transporter · LR', m ? [m.transporter, m.lrNo && `LR ${m.lrNo}`].filter(Boolean).join(' · ') || null : null],
              ['Packages', m ? qtyFmt(sum(m.items.map((it) => packagesCount(it.packages)))) || null : null],
            ]}
          />
        </Box>
      </Grid>
      <DocTable
        cols={[
          { header: '#', width: '8mm' },
          { header: 'Item' },
          { header: 'UOM', width: '16mm' },
          { header: 'Challan qty', align: 'right', width: '24mm' },
          { header: 'MRN qty', align: 'right', width: '20mm' },
          { header: 'Received', align: 'right', width: '22mm' },
          { header: 'Accepted', align: 'right', width: '22mm' },
          { header: 'Rejected', align: 'right', width: '22mm' },
          { header: 'QC', width: '28mm' },
        ]}
        rows={g.items.map((it, i) => {
          const src = mrnLine(it.mrnItemId);
          const qc = qcOf(it);
          return [
            i + 1,
            <span key="n">
              <strong>{storeItemLabel(it)}</strong>
              {it.itemId && data.itemCodes[it.itemId] && <span style={{ color: FAINT }}> {data.itemCodes[it.itemId]}</span>}
              {!it.mrnItemId && <span style={{ color: FAINT }}> (unlisted)</span>}
            </span>,
            it.unit.toUpperCase(),
            src?.challanQty === null || src?.challanQty === undefined ? '—' : qtyFmt(src.challanQty),
            it.mrnItemId ? qtyFmt(it.approxQty) : '—',
            qtyFmt(it.actualQty),
            qtyFmt(it.actualQty - it.rejectedQty),
            qtyFmt(it.rejectedQty),
            <Pill key="qc" tone={QC_TONE[qc]}>{qc}</Pill>,
          ];
        })}
        foot={[
          '',
          'Total',
          '',
          qtyFmt(sum(g.items.map((it) => mrnLine(it.mrnItemId)?.challanQty))),
          qtyFmt(sum(g.items.map((it) => (it.mrnItemId ? it.approxQty : 0)))),
          qtyFmt(sum(g.items.map((it) => it.actualQty))),
          qtyFmt(sum(g.items.map((it) => it.actualQty - it.rejectedQty))),
          qtyFmt(sum(g.items.map((it) => it.rejectedQty))),
          '',
        ]}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6mm' }}>
        <div>
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: MUTED, marginRight: '3mm' }}>REMARKS</span>
          {g.remarks || <span style={{ color: FAINT }}>None recorded</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5mm', whiteSpace: 'nowrap' }}>
          {steps.map(([label, done], i) => (
            <span key={label}>
              {i > 0 && <span style={{ color: FAINT, margin: '0 1.5mm' }}>›</span>}
              <Pill tone={done ? 'green' : 'amber'}>{label}</Pill>
            </span>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

const sheet = { page: A4_LANDSCAPE, marginMm: MARGIN, css: KIT_CSS };

export async function printMrn(id: string) {
  const data = await fetchMrnPrint(id);
  await printHtml({ ...sheet, title: data.mrn.mrnNo.replace(/\//g, '-'), bodyHtml: renderToStaticMarkup(<MrnDocument data={data} />) });
}

export async function printGrn(id: string) {
  const data = await fetchGrnPrint(id);
  await printHtml({ ...sheet, title: data.grn.grnNo.replace(/\//g, '-'), bodyHtml: renderToStaticMarkup(<GrnDocument data={data} />) });
}

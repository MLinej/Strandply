import { renderToStaticMarkup } from 'react-dom/server';
import type { MtPriority, MtStatus, WorkOrder } from '@contracts/maintenance';
import type { CompanyBlock } from '@contracts/sampletrack';
import { formatDate, formatDateTime } from '@/lib/format';
import { PAGES, printHtml } from '@/lib/print';
import { Box, Checks, DocHeader, DocTable, FAINT, Grid, INK, KIT_CSS, KV, LINE, MUTED, Pill, RED, Sheet, Signatures, WriteLines, type Tone } from '@/lib/print-kit';
import { fetchWorkOrderPrint } from './api';

const COPIES = [
  { dept: 'Maintenance Dept. (file copy)', copy: 'Original' },
  { dept: 'Production Dept.', copy: 'Duplicate' },
  { dept: 'Stores Dept.', copy: 'Triplicate' },
] as const;

const PRIORITY_TONE: Record<MtPriority, Tone> = { Critical: 'red', High: 'red', Medium: 'amber', Low: 'neutral' };
const STATUS_TONE: Record<MtStatus, Tone> = { Open: 'amber', 'In Progress': 'purple', 'On Hold': 'neutral', Completed: 'green' };
const PAGE_H = 297 - 20 - 3;

type Stage = { label: string; by?: string | null; at?: string | null };

/** The job's stages from its timeline; later ones (spares, handover, closing) are filled in by hand. */
function stages(w: WorkOrder): Stage[] {
  const first = (pred: (text: string, type: string) => boolean) => w.timeline.find((e) => pred(e.text, e.type));
  const created = first((_, t) => t === 'created');
  const assigned = first((_, t) => t === 'assigned');
  const started = first((x, t) => t === 'status' && /In Progress/.test(x));
  const done = [...w.timeline].reverse().find((e) => e.type === 'status' && /Completed/.test(e.text));
  return [
    { label: 'Work order created', by: created?.byName, at: created?.at ?? w.createdAt },
    { label: `Assigned to ${w.assignee}`, by: assigned?.byName, at: assigned?.at },
    { label: 'Work started', by: started?.byName, at: started?.at },
    { label: 'Spares issued from stores' },
    { label: 'Work completed', by: done?.byName, at: w.status === 'Completed' ? done?.at : null },
    { label: 'Handed over to production' },
    { label: 'Approved & closed' },
  ];
}

function Dot({ state }: { state: 'done' | 'current' | 'todo' }) {
  const style = state === 'done' ? { background: '#16A34A', border: '2px solid #16A34A' } : state === 'current' ? { background: '#fff', border: '2px solid #EA580C' } : { background: '#fff', border: `1.3px solid ${FAINT}` };
  return <span style={{ display: 'inline-block', width: '3mm', height: '3mm', borderRadius: 99, verticalAlign: '-0.4mm', ...style }} />;
}

/** One copy of the maintenance job card (A4). */
export function JobCard({ company, w, dept, copy, page, pages }: { company: CompanyBlock; w: WorkOrder; dept: string; copy: string; page: number; pages: number }) {
  const raisedBy = w.timeline.find((e) => e.type === 'created')?.byName ?? null;
  const st = stages(w);
  const current = st.findIndex((s) => !s.at);
  const label = (t: string) => <span style={{ color: RED }}>{t}</span>;
  return (
    <Sheet
      minHeightMm={PAGE_H}
      fontSize={9.5}
      bottom={<Signatures marginTopMm={4} signers={[{ role: 'Raised by' }, { role: 'Assigned technician' }, { role: 'Production handover' }, { role: 'Approved by' }]} />}
      footer={`${company.name} — Maintenance work tracker · ${copy} copy · Page ${page} of ${pages}`}
    >
      <DocHeader
        company={company}
        title="Maintenance job card"
        rule={RED}
        right={
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2.5mm', marginTop: 4, fontSize: 9.5, color: MUTED }}>
              {dept} <Pill tone="red" outline>{copy.toUpperCase()}</Pill>
            </div>
            <div style={{ marginTop: 4, fontSize: 9.5, color: MUTED }}>
              Raised {formatDate(w.createdAt.slice(0, 10))} · <strong style={{ color: RED, fontSize: 13 }}>{w.woNo}</strong>
            </div>
          </>
        }
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5mm' }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{w.title}</div>
        <div style={{ display: 'flex', gap: '1.5mm' }}>
          <Pill tone={PRIORITY_TONE[w.priority]}>{w.priority}</Pill>
          <Pill tone={STATUS_TONE[w.status]}>{w.status}</Pill>
          <Pill>{w.category}</Pill>
        </div>
      </div>
      <Grid cols="1fr 1fr" style={{ marginBottom: '3mm' }}>
        <Box title={label('Work order details')}>
          <KV
            dense
            rows={[
              ['WO no.', w.woNo, true],
              ['Raised', formatDateTime(w.createdAt)],
              ['Raised by', raisedBy],
              ['Due date', formatDate(w.dueDate), true],
              ['Assigned to', w.assignee, true],
              ['Category', w.category],
            ]}
          />
        </Box>
        <Box title={label('Equipment & location')}>
          <KV
            dense
            rows={[
              ['Plant area', w.area, true],
              ['Equipment', w.equipment],
              ['Station', w.station],
              ['Breakdown', <Checks key="b" options={['Yes', 'No']} />],
              ['Machine stopped', <Checks key="m" options={['Yes', 'No']} />],
              ['Safety lock-out', <Checks key="s" options={['Done', 'Not needed']} />],
            ]}
          />
        </Box>
      </Grid>
      <Box title={label('Problem reported')} style={{ marginBottom: '3mm' }}>
        <div style={{ whiteSpace: 'pre-wrap' }}>{w.description || '—'}</div>
      </Box>
      <Box style={{ marginBottom: '3mm' }}>
        <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: RED }}>ROOT CAUSE FOUND</div>
        <WriteLines count={3} heightMm={4.6} />
        <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: RED, marginTop: '3mm' }}>WORK DONE</div>
        {w.notes ? <div style={{ whiteSpace: 'pre-wrap', padding: '1.5mm 0' }}>{w.notes}</div> : null}
        <WriteLines count={w.notes ? 2 : 3} heightMm={4.6} />
        <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: RED, marginTop: '3mm' }}>FURTHER ACTION / RECOMMENDATION</div>
        <WriteLines count={2} heightMm={4.6} />
      </Box>
      <Grid cols="1.6fr 1fr" style={{ marginBottom: '1mm' }}>
        <div>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: RED, marginBottom: '1.5mm' }}>SPARES USED</div>
          <DocTable cols={[{ header: '#', width: '7mm' }, { header: 'Item' }, { header: 'Item code' }, { header: 'UOM' }, { header: 'Issued' }, { header: 'Used' }, { header: 'Returned' }]} rows={[]} minRows={4} compact />
        </div>
        <div>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: RED, marginBottom: '1.5mm' }}>TIME & DOWNTIME</div>
          <DocTable cols={[{ header: '' }, { header: 'Date', align: 'right' }, { header: 'Time', align: 'right' }]} rows={['Work started', 'Work completed', 'Downtime (hrs)', 'Man-hours'].map((x) => [x, '', ''])} compact />
        </div>
      </Grid>
      <Box
        title={label('Timeline')}
        titleRight={
          <span style={{ fontSize: 9, color: MUTED, display: 'flex', gap: '3mm' }}>
            <span>
              <Dot state="done" /> Done
            </span>
            <span>
              <Dot state="current" /> Current
            </span>
            <span>
              <Dot state="todo" /> To come
            </span>
          </span>
        }
        style={{ marginBottom: '3mm' }}
      >
        <table style={{ width: '100%' }}>
          <thead>
            <tr style={{ color: MUTED, fontSize: 9 }}>
              <th style={{ width: '6mm' }} />
              <th style={{ textAlign: 'left', fontWeight: 500, paddingBottom: '1mm' }}>Stage</th>
              <th style={{ textAlign: 'left', fontWeight: 500, width: '45mm' }}>By</th>
              <th style={{ textAlign: 'left', fontWeight: 500, width: '45mm' }}>Date & time</th>
            </tr>
          </thead>
          <tbody>
            {st.map((s, i) => {
              const state = s.at ? 'done' : i === current ? 'current' : 'todo';
              const blank = <span style={{ display: 'block', borderBottom: `1px solid ${LINE}`, width: '38mm', height: '3.5mm' }} />;
              return (
                <tr key={s.label} style={{ borderBottom: `1px solid ${LINE}` }}>
                  <td style={{ padding: '0.5mm 0' }}>
                    <Dot state={state} />
                  </td>
                  <td style={{ fontWeight: state === 'todo' ? 400 : 700, color: state === 'todo' ? MUTED : INK }}>{s.label}</td>
                  <td>{s.at ? (s.by ?? '—') : blank}</td>
                  <td>{s.at ? formatDateTime(s.at) : blank}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Box>
      <div>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: RED, marginRight: '4mm' }}>STATUS AFTER JOB</span>
        <Checks options={['Closed', 'Pending spares', 'Re-work']} />
      </div>
    </Sheet>
  );
}

/** The job card in three copies: Original (Maintenance), Duplicate (Production), Triplicate (Stores). */
export async function printWorkOrder(id: string) {
  const { company, workOrder: w } = await fetchWorkOrderPrint(id);
  await printHtml({
    page: PAGES.requestSlip,
    marginMm: 10,
    css: KIT_CSS,
    title: `Job card ${w.woNo}`,
    bodyHtml: renderToStaticMarkup(
      <>
        {COPIES.map((c, i) => (
          <JobCard key={c.copy} company={company} w={w} dept={c.dept} copy={c.copy} page={i + 1} pages={COPIES.length} />
        ))}
      </>,
    ),
  });
}

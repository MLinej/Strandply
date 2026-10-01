import type { Status } from '@/lib/status';

/** GRN rows lifted from design-reference/project/GoodsReceipt.dc.html (demo data only). */
export interface GrnRow {
  no: string;
  date: string; // ISO
  mrn: string;
  vendor: string;
  invoice: string | null;
  lines: number;
  taxable: number;
  gst: number;
  status: Extract<Status, 'Draft' | 'Reviewed' | 'Approved' | 'Accounted' | 'Rejected'>;
  bill: string | null;
}

const raw: [string, string, string, string, string | null, number, number, number, GrnRow['status'], string | null][] = [
  ['0043', '2026-09-22', '0041', 'Ahmedabad Industrial Stores', 'MBS1345698', 1, 84000, 15120, 'Approved', null],
  ['0042', '2026-09-16', '0040', 'Rajkot Bearing Centre', 'S001/26-27/440', 1, 20900, 3762, 'Approved', null],
  ['0041', '2026-09-15', '0039', 'Ahmedabad Industrial Stores', null, 1, 6720, 1209.6, 'Reviewed', null],
  ['0040', '2026-09-14', '0038', 'Ahmedabad Industrial Stores', 'S002/26-27/438', 1, 1650, 297, 'Approved', null],
  ['0039', '2026-09-12', '0036', 'Mumbai Hydraulics & Lubes', 'S003/26-27/436', 3, 206340, 37141.2, 'Reviewed', null],
  ['0038', '2026-09-10', '0035', 'Mumbai Hydraulics & Lubes', null, 2, 97440, 17539.2, 'Accounted', 'VB/26-27/0107'],
  ['0037', '2026-09-08', '0034', 'Surat Packaging Materials', 'S004/26-27/434', 3, 43300, 7794, 'Accounted', 'VB/26-27/0106'],
  ['0036', '2026-09-06', '0033', 'Surat Packaging Materials', 'S004/26-27/433', 2, 44200, 7956, 'Accounted', 'VB/26-27/0105'],
  ['0035', '2026-09-04', '0032', 'Ahmedabad Industrial Stores', null, 3, 28600, 5148, 'Accounted', 'VB/26-27/0104'],
  ['0034', '2026-08-30', '0031', 'Rajkot Bearing Centre', null, 3, 198600, 35748, 'Accounted', 'VB/26-27/0103'],
  ['0033', '2026-08-25', '0030', 'Rajkot Bearing Centre', 'S001/26-27/430', 2, 34440, 6199.2, 'Accounted', 'VB/26-27/0102'],
  ['0032', '2026-08-20', '0029', 'Rajkot Bearing Centre', 'S001/26-27/429', 3, 55000, 9900, 'Accounted', 'VB/26-27/0101'],
  ['0031', '2026-08-16', '0028', 'Rajkot Bearing Centre', 'S001/26-27/428', 2, 84060, 15130.8, 'Accounted', 'VB/26-27/0100'],
  ['0030', '2026-08-15', '0028', 'Rajkot Bearing Centre', 'S001/26-27/428', 2, 112080, 20174.4, 'Rejected', null],
  ['0029', '2026-08-10', '0027', 'Surat Packaging Materials', 'S004/26-27/427', 1, 7200, 1296, 'Accounted', 'VB/26-27/0099'],
  ['0028', '2026-08-06', '0026', 'Jay Ambe Paper Mills', 'JAPM/26-27/101', 2, 51782.25, 9320.8, 'Accounted', 'VB/26-27/0098'],
  ['0027', '2026-08-02', '0025', 'Saurashtra Wood Suppliers', 'SWS/26-27/104', 4, 126212.5, 22718.26, 'Accounted', 'VB/26-27/0097'],
  ['0026', '2026-07-29', '0024', 'Mumbai Hydraulics & Lubes', 'S003/26-27/420', 1, 18400, 3312, 'Accounted', 'VB/26-27/0096'],
];

export const GRN_ROWS: GrnRow[] = raw.map(([n, date, mrn, vendor, invoice, lines, taxable, gst, status, bill]) => ({
  no: `GRN/26-27/${n}`,
  date,
  mrn: `MRN/26-27/${mrn}`,
  vendor,
  invoice,
  lines,
  taxable,
  gst,
  status,
  bill,
}));

export const VENDORS = [...new Set(GRN_ROWS.map((r) => r.vendor))].sort().map((v) => ({ value: v, label: v }));

import type { Context } from 'hono';
import * as XLSX from 'xlsx';
import { validationFailed } from './errors';

// SheetJS 0.20.x (from cdn.sheetjs.com; the npm "xlsx" 0.18.5 has known CVEs). Pure JS: runs on Node and Workers.

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface Column<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

export interface SheetSpec<T> {
  name: string;
  columns: Column<T>[];
  rows: T[];
}

/** Builds an .xlsx workbook. Each sheet gets a header row and then one row per item. Null/undefined values become blank cells. */
export function writeXlsx(sheets: SheetSpec<any>[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa = [s.columns.map((c) => c.header), ...s.rows.map((r) => s.columns.map((c) => c.value(r) ?? null))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = s.columns.map((c) => ({ wch: Math.min(40, Math.max(10, c.header.length + 2)) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

/** Sends `bytes` as a download. `baseName` gets "-YYYY-MM-DD.xlsx" appended. */
export function xlsxResponse(c: Context, bytes: Uint8Array, baseName: string, date: Date) {
  const file = `${baseName}-${date.toISOString().slice(0, 10)}.xlsx`;
  return c.body(bytes as Uint8Array<ArrayBuffer>, 200, {
    'Content-Type': XLSX_MIME,
    'Content-Disposition': `attachment; filename="${file}"`,
    'Cache-Control': 'no-store',
  });
}

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export interface ParsedSheet {
  /** Header cells as written in the file. */
  headers: string[];
  /** Data rows keyed by header, with the 1-based spreadsheet row number. */
  rows: { row: number; cells: Record<string, unknown> }[];
}

/** Reads the first sheet of an .xlsx, .xls or .csv file. */
export function readFirstSheet(bytes: Uint8Array): ParsedSheet {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, {
      type: 'array',
      sheetRows: MAX_IMPORT_ROWS + 2, // header row + one extra row to detect "too many"
      cellFormula: false,
      cellHTML: false,
      cellDates: false,
    });
  } catch {
    throw validationFailed('Could not read the file. Upload .xlsx, .xls or .csv.');
  }
  const first = wb.SheetNames[0];
  const ws = first ? wb.Sheets[first] : undefined;
  if (!ws) throw validationFailed('The file has no sheets');

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', blankrows: true, raw: true });
  const headerRow = (aoa[0] ?? []).map((h) => String(h ?? '').trim());
  if (!headerRow.some(Boolean)) throw validationFailed('The first row must contain column headers');

  const body = aoa.slice(1);
  // Trailing blank lines are common in CSV exports. Drop them before the row-count check.
  while (body.length && (body[body.length - 1] ?? []).every((v) => String(v ?? '').trim() === '')) body.pop();
  if (body.length > MAX_IMPORT_ROWS) throw validationFailed(`Too many rows: the limit is ${MAX_IMPORT_ROWS} per file`);

  return {
    headers: headerRow,
    rows: body.map((cells, i) => ({
      row: i + 2,
      cells: Object.fromEntries(headerRow.map((h, j) => [h, (cells ?? [])[j] ?? ''])),
    })),
  };
}

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, DataTable, StatusPill, type Column } from '@/components/ui';
import { pageList } from '@/components/ui/Pagination';
import { PrimaryScope } from '@/lib/primary-scope';
import { nextSort, sortRows } from '@/lib/sort';
import { STATUS_TONE, toneFor } from '@/lib/status';

afterEach(cleanup);

describe('status tones', () => {
  it('follows the GRN workflow colours from the design notes', () => {
    expect(STATUS_TONE.Draft).toBe('neutral');
    expect(STATUS_TONE.Reviewed).toBe('amber');
    expect(STATUS_TONE.Approved).toBe('purple');
    expect(STATUS_TONE.Accounted).toBe('green');
    expect(STATUS_TONE.Rejected).toBe('red');
    expect(STATUS_TONE.Cancelled).toBe('neutral');
    expect(STATUS_TONE.Partial).toBe('purple');
  });
  it('falls back to neutral for unknown statuses', () => {
    expect(toneFor('Something new')).toBe('neutral');
  });
  it('renders pill colours from the map', () => {
    render(<StatusPill status="Approved" />);
    expect(screen.getByText('Approved').className).toContain('text-purple');
  });
});

describe('sorting', () => {
  const rows = [{ v: 'GRN/26-27/0010' }, { v: null }, { v: 'GRN/26-27/0002' }, { v: 'GRN/26-27/0100' }];
  it('sorts numerically inside strings and keeps nulls last both ways', () => {
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual(['GRN/26-27/0002', 'GRN/26-27/0010', 'GRN/26-27/0100', null]);
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.v)).toEqual(['GRN/26-27/0100', 'GRN/26-27/0010', 'GRN/26-27/0002', null]);
  });
  it('cycles none → asc → desc → none', () => {
    const a = nextSort(null, 'x');
    const b = nextSort(a, 'x');
    expect([a?.direction, b?.direction, nextSort(b, 'x')]).toEqual(['asc', 'desc', null]);
  });
});

describe('pagination', () => {
  it('collapses long page lists with ellipses', () => {
    expect(pageList(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageList(6, 12)).toEqual([1, '…', 5, 6, 7, '…', 12]);
  });
});

describe('one primary per scope', () => {
  it('logs an error when a scope has two primary buttons, and not across scopes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <PrimaryScope name="page">
        <Button variant="primary">Save</Button>
        <PrimaryScope name="bulk">
          <Button variant="primary">Approve</Button>
        </PrimaryScope>
      </PrimaryScope>,
    );
    expect(spy).not.toHaveBeenCalled();
    cleanup();
    render(
      <PrimaryScope name="page">
        <Button variant="primary">Save</Button>
        <Button variant="primary">Submit</Button>
      </PrimaryScope>,
    );
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"Save", "Submit"'));
    spy.mockRestore();
  });
});

describe('DataTable', () => {
  type Row = { id: string; amount: number };
  const cols: Column<Row>[] = [
    { id: 'id', header: 'No.', cell: (r) => r.id, sortValue: (r) => r.id },
    { id: 'amount', header: 'Amount', align: 'right', cell: (r) => r.amount, sortValue: (r) => r.amount },
  ];
  const rows: Row[] = [
    { id: 'A', amount: 30 },
    { id: 'B', amount: 10 },
    { id: 'C', amount: 20 },
  ];

  it('sorts client-side when a header is clicked', () => {
    render(<DataTable label="t" columns={cols} rows={rows} getRowId={(r) => r.id} />);
    fireEvent.click(screen.getByRole('button', { name: /amount/i }));
    const firstCells = screen.getAllByRole('row').slice(1).map((r) => r.querySelectorAll('td')[0].textContent);
    expect(firstCells).toEqual(['B', 'C', 'A']);
    expect(screen.getByRole('columnheader', { name: /amount/i }).getAttribute('aria-sort')).toBe('ascending');
  });

  it('selects all, tints selected rows and shows the bulk bar', () => {
    render(
      <DataTable
        label="t"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        selectable
        selectionLabel={(n) => `${n} GRNs selected`}
        bulkActions={() => <Button variant="primary">Approve</Button>}
      />,
    );
    expect(screen.queryByRole('toolbar')).toBeNull();
    fireEvent.click(screen.getByLabelText('Select all rows'));
    expect(screen.getByText('3 GRNs selected')).toBeTruthy();
    expect(screen.getAllByRole('row')[1].className).toContain('bg-primary-tint');
    fireEvent.click(screen.getByText('Clear'));
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});

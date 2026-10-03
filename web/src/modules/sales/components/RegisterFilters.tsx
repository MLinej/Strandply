import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select } from '@/components/ui';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { useFirmFilter, useSalesOptions, type DocQuery } from '../api';

export const FILTER_KEYS = ['status', 'billTo', 'state', 'city', 'from', 'to', 'new', 'so'] as const;
export type RegisterUrl = ReturnType<typeof useUrlState<(typeof FILTER_KEYS)[number]>>;

/** URL-backed list state for a document register; the firm comes from the shell's firm switcher. */
export function useRegister(pageSize: number) {
  const url = useUrlState(FILTER_KEYS);
  const firm = useFirmFilter();
  const v = url.values;
  const query: DocQuery = {
    q: url.q || undefined,
    page: url.page,
    pageSize,
    sort: url.sort || undefined,
    filters: { firm, status: v.status || undefined, billTo: v.billTo || undefined, state: v.state || undefined, city: v.city || undefined, from: v.from || undefined, to: v.to || undefined },
  };
  return { url, query, firm };
}

/**
 * Search, bill-to party, state, city, date range and sort (legacy SO / invoice / PI filter bars).
 * `sorts` are the register's sort choices, e.g. [['-date', 'Newest first'], …].
 */
export function RegisterFilters({ url, placeholder, sorts }: { url: RegisterUrl; placeholder: string; sorts: [string, string][] }) {
  const [search, setSearch] = useSearchParam(url);
  const customers = useSalesOptions().data?.customers ?? [];
  const states = useMemo(() => [...new Set(customers.map((c) => c.state).filter((s): s is string => !!s))].sort(), [customers]);
  const cities = useMemo(() => [...new Set(customers.filter((c) => !url.values.state || c.state === url.values.state).map((c) => c.city).filter((s): s is string => !!s))].sort(), [customers, url.values.state]);
  const v = url.values;
  const any = !!(url.q || v.billTo || v.state || v.city || v.from || v.to || url.sort);
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Input aria-label="Search" icon={Search} placeholder={placeholder} value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[230px]" />
      <PartyFilter value={v.billTo} names={customers.map((c) => c.name)} onChange={(name) => url.set({ billTo: name || null })} />
      <Select aria-label="State" placeholder="All states" options={states.map((s) => ({ value: s, label: s }))} value={v.state} onChange={(e) => url.set({ state: e.target.value, city: null })} containerClassName="w-[150px]" />
      <Select aria-label="City" placeholder="All cities" options={cities.map((s) => ({ value: s, label: s }))} value={v.city} onChange={(e) => url.set({ city: e.target.value })} containerClassName="w-[150px]" />
      <Input aria-label="From date" type="date" value={v.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[145px]" />
      <span className="text-sm text-muted">to</span>
      <Input aria-label="To date" type="date" value={v.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[145px]" />
      <Select aria-label="Sort" options={sorts.map(([value, label]) => ({ value, label }))} value={url.sort || sorts[0]![0]} onChange={(e) => url.set({ sort: e.target.value === sorts[0]![0] ? null : e.target.value })} containerClassName="w-[170px]" />
      {any && (
        <Button variant="ghost" size="sm" icon={X} onClick={() => url.set({ q: null, billTo: null, state: null, city: null, from: null, to: null, sort: null })}>
          Clear
        </Button>
      )}
    </div>
  );
}

/** Bill-to filter: free typing, applied once the text is a party name (or cleared). */
function PartyFilter({ value, names, onChange }: { value: string; names: string[]; onChange: (name: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <>
      <Input
        aria-label="Bill-to party"
        list="sales-party-list"
        placeholder="Bill-to party"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value || names.includes(e.target.value)) onChange(e.target.value);
        }}
        containerClassName="w-[200px]"
      />
      <datalist id="sales-party-list">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </>
  );
}

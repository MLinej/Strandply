import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { HubAnalytics, HubElectricity, HubMaintenance, HubOverview, HubPeriod, HubProduction, HubPurchase, HubSales, HubSource, HubStock } from '@contracts/hub';
import { api, downloadFile } from '@/api/client';

const HB = '/hub';
export type Range = { from?: string; to?: string; fy?: string };
const q = <T,>(path: string, query: Record<string, string | undefined>) => ({
  queryKey: ['hub', path, query] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => api<T>(`${HB}/${path}`, { query, signal }),
  placeholderData: keepPreviousData,
});

export const useYears = () => useQuery({ queryKey: ['hub', 'years'], queryFn: ({ signal }) => api<string[]>(`${HB}/years`, { signal }), staleTime: 60_000 });
export const useOverview = (r: Range) => useQuery(q<HubOverview>('overview', r));
export const usePurchase = (r: Range & { material?: string }) => useQuery(q<HubPurchase>('purchase', r));
export const useProduction = (r: Range) => useQuery(q<HubProduction>('production', r));
export const useStock = (fy?: string) => useQuery(q<HubStock>('stock', { fy }));
export const useElectricity = (r: Range) => useQuery(q<HubElectricity & { readings: number }>('electricity', r));
export const useSales = (r: Range & { firm?: string }) => useQuery(q<HubSales>('sales', r));
export const useMaintenance = (r: Range) => useQuery(q<HubMaintenance>('maintenance', r));
export const useAnalytics = (r: Range) => useQuery(q<HubAnalytics>('analytics', r));
export const usePeriod = (r: Range, enabled = true) => useQuery({ ...q<HubPeriod>('period', r), enabled });
export const useSources = () => useQuery({ queryKey: ['hub', 'sources'], queryFn: ({ signal }) => api<HubSource[]>(`${HB}/sources`, { signal }) });
export const exportHub = (r: Range) => downloadFile(`${HB}/export`, r);

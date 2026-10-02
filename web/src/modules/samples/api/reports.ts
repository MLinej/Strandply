import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DashboardData, Report, ReportFilters, ReportKey, ReportPrint } from '@contracts/sampletrack';
import { api, downloadFile } from '@/api/client';
import { stKeys } from './keys';

/** Role-aware dashboard: only the widgets/panels/charts this user may see are present. Refreshes every 2 minutes. */
export function useDashboard() {
  return useQuery({
    queryKey: stKeys.dashboard,
    queryFn: ({ signal }) => api<DashboardData>('/sampletrack/dashboard', { signal }),
    refetchInterval: 120_000,
  });
}

/** One report as JSON. Money cells are paise, percent cells 0–100. */
export function useReport(key: ReportKey | undefined, filters: ReportFilters = {}) {
  return useQuery({
    queryKey: stKeys.reports.one(key ?? '', filters),
    queryFn: ({ signal }) => api<Report>(`/sampletrack/reports/${key}`, { query: { ...filters }, signal }),
    enabled: !!key,
    placeholderData: keepPreviousData,
  });
}

/** Downloads the report: xlsx (all tables + summary) or csv (one table; defaults to the first). Needs export. */
export function exportReport(key: ReportKey, filters: ReportFilters = {}, format: 'xlsx' | 'csv' = 'xlsx', table?: string) {
  return downloadFile(`/sampletrack/reports/${key}/export`, { ...filters, format, table });
}

/** Print payload (A4 landscape + company block). Needs print; each fetch is logged. */
export function fetchReportPrint(key: ReportKey, filters: ReportFilters = {}) {
  return api<ReportPrint>(`/sampletrack/reports/${key}/print`, { query: { ...filters } });
}

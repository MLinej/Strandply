import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CityFilters, CityOption, CityView, ListQuery, ListResult, State } from '@contracts/sampletrack';
import { api, downloadFile } from '@/api/client';
import { stKeys } from './keys';

const ST = '/sampletrack';

/** The 36 states/UTs. They never change at runtime, so they stay cached for good. */
export function useStates() {
  return useQuery({
    queryKey: stKeys.geo.states,
    queryFn: ({ signal }) => api<State[]>(`${ST}/states`, { signal }),
    staleTime: Infinity,
  });
}

/** Party form city dropdown: built-in + custom + cities already used on parties. */
export function useCityOptions() {
  return useQuery({
    queryKey: stKeys.geo.cityOptions,
    queryFn: ({ signal }) => api<CityOption[]>(`${ST}/cities/options`, { signal }),
    staleTime: 5 * 60_000,
  });
}

/**
 * The state to fill in when `city` is picked: its state when exactly one state is known for
 * that name (ignoring case), otherwise null so the user picks one.
 */
export function stateForCity(options: CityOption[] | undefined, city: string): string | null {
  const key = city.trim().toLowerCase();
  if (!key || !options) return null;
  const states = new Set(options.filter((o) => o.city.toLowerCase() === key && o.state).map((o) => o.state!));
  return states.size === 1 ? [...states][0]! : null;
}

/** City master (Settings). */
export function useCities(query: ListQuery<CityFilters>) {
  return useQuery({
    queryKey: stKeys.geo.cityList(query),
    queryFn: ({ signal }) => api<ListResult<CityView>>(`${ST}/cities`, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

function useInvalidateCities() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: stKeys.geo.cities });
}

/** A city already in that state fails with ApiError 'city_exists'. */
export function useAddCity() {
  const invalidate = useInvalidateCities();
  return useMutation({
    mutationFn: (input: { city: string; stateId: string }) => api<CityView>(`${ST}/cities`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

/** Built-in cities fail with ApiError 'builtin_city'. Only custom ones can be removed. */
export function useRemoveCity() {
  const invalidate = useInvalidateCities();
  return useMutation({
    mutationFn: (id: string) => api<void>(`${ST}/cities/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function exportCities() {
  return downloadFile(`${ST}/cities/export`);
}

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssigneeOption,
  DuplicatePartyDetails,
  InUseDetails,
  ListQuery,
  ListResult,
  PartyFilters,
  PartyInput,
  PartyView,
} from '@contracts/sampletrack';
import { api, downloadFile, isApiError } from '@/api/client';
import { stKeys } from './keys';

const BASE = '/sampletrack/parties';

export type PartyQuery = ListQuery<PartyFilters>;

export function useParties(query: PartyQuery, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    enabled,
    queryKey: stKeys.parties.list(query),
    queryFn: ({ signal }) => api<ListResult<PartyView>>(BASE, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useParty(id: string | undefined) {
  return useQuery({
    queryKey: stKeys.parties.detail(id ?? ''),
    queryFn: ({ signal }) => api<PartyView>(`${BASE}/${id}`, { signal }),
    enabled: !!id,
  });
}

/** Active marketing/admin/superadmin users, for the "Assigned to" dropdown. */
export function usePartyAssignees() {
  return useQuery({
    queryKey: stKeys.parties.assignees,
    queryFn: ({ signal }) => api<AssigneeOption[]>(`${BASE}/assignees`, { signal }),
    staleTime: 5 * 60_000,
  });
}

function useInvalidateParties() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: stKeys.parties.all });
    // Cities used on parties feed the city dropdown.
    void qc.invalidateQueries({ queryKey: stKeys.geo.cityOptions });
  };
}

/**
 * Create a party. A similar existing name fails with ApiError 'possible_duplicate'.
 * Read it with duplicateOf(err), confirm with the user, then call again with force: true.
 */
export function useCreateParty() {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: ({ input, force = false }: { input: PartyInput; force?: boolean }) =>
      api<PartyView>(BASE, { method: 'POST', body: input, query: force ? { force: true } : undefined }),
    onSuccess: invalidate,
  });
}

/** Update a party. Send only the changed fields; null clears a field. Renames get the same duplicate check as create. */
export function useUpdateParty() {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: ({ id, input, force = false }: { id: string; input: Partial<PartyInput>; force?: boolean }) =>
      api<PartyView>(`${BASE}/${id}`, { method: 'PATCH', body: input, query: force ? { force: true } : undefined }),
    onSuccess: invalidate,
  });
}

/** Delete a party. Fails with ApiError 'in_use' (see inUseOf) while requests or dispatches use it. */
export function useDeleteParty() {
  const invalidate = useInvalidateParties();
  return useMutation({
    mutationFn: (id: string) => api<void>(`${BASE}/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

/** Downloads every party matching the filters (paging ignored) as xlsx. Needs the export permission. */
export function exportParties(query: Omit<PartyQuery, 'page' | 'pageSize'> = {}) {
  return downloadFile(`${BASE}/export`, query);
}

/** The similar parties from a 409 'possible_duplicate', or null. */
export function duplicateOf(err: unknown): DuplicatePartyDetails | null {
  return isApiError(err, 'possible_duplicate') ? (err.details as DuplicatePartyDetails) : null;
}

/** The blocking request/dispatch counts from a 409 'in_use', or null. Shared by every master delete. */
export function inUseOf(err: unknown): InUseDetails | null {
  return isApiError(err, 'in_use') ? (err.details as InUseDetails) : null;
}

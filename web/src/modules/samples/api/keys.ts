/** TanStack Query keys for SampleTrack. Invalidate a prefix (e.g. stKeys.parties.all) after a write. */
export const stKeys = {
  parties: {
    all: ['st', 'parties'] as const,
    list: (q: object) => ['st', 'parties', 'list', q] as const,
    detail: (id: string) => ['st', 'parties', 'detail', id] as const,
    assignees: ['st', 'parties', 'assignees'] as const,
  },
  couriers: {
    all: ['st', 'couriers'] as const,
    list: (q: object) => ['st', 'couriers', 'list', q] as const,
    detail: (id: string) => ['st', 'couriers', 'detail', id] as const,
    options: (mode: string) => ['st', 'couriers', 'options', mode] as const,
  },
  products: {
    all: ['st', 'products'] as const,
    list: (q: object) => ['st', 'products', 'list', q] as const,
    detail: (id: string) => ['st', 'products', 'detail', id] as const,
    summary: ['st', 'products', 'summary'] as const,
  },
  requests: {
    all: ['st', 'requests'] as const,
    list: (q: object) => ['st', 'requests', 'list', q] as const,
    detail: (id: string) => ['st', 'requests', 'detail', id] as const,
    pendingCount: ['st', 'requests', 'pending-count'] as const,
  },
  dispatches: {
    all: ['st', 'dispatches'] as const,
    list: (q: object) => ['st', 'dispatches', 'list', q] as const,
    detail: (id: string) => ['st', 'dispatches', 'detail', id] as const,
    partyOptions: (q: string) => ['st', 'dispatches', 'party-options', q] as const,
    requestOptions: (partyId: string) => ['st', 'dispatches', 'request-options', partyId] as const,
  },
  tracking: {
    all: ['st', 'tracking'] as const,
    list: (q: object) => ['st', 'tracking', 'list', q] as const,
    detail: (id: string) => ['st', 'tracking', 'detail', id] as const,
  },
  dashboard: ['st', 'dashboard'] as const,
  reports: {
    all: ['st', 'reports'] as const,
    one: (key: string, filters: object) => ['st', 'reports', key, filters] as const,
  },
  notifications: {
    all: ['st', 'notifications'] as const,
    feed: (q: object) => ['st', 'notifications', 'feed', q] as const,
  },
  badges: ['st', 'notifications', 'badges'] as const,
  company: ['st', 'settings', 'company'] as const,
  geo: {
    states: ['st', 'geo', 'states'] as const,
    cities: ['st', 'geo', 'cities'] as const,
    cityList: (q: object) => ['st', 'geo', 'cities', 'list', q] as const,
    cityOptions: ['st', 'geo', 'cities', 'options'] as const,
  },
};

import type { DataLayer } from './repos';
import { memoryDataLayerFrom, type MemoryData } from './repos/memory';

export type DataBackend = 'memory' | 'd1';

export interface ContainerOptions {
  /** Initial data for the memory backend (seed, or a dev.json snapshot). */
  memoryData: MemoryData;
  /** Called with the full dump after each committed change (memory backend only). */
  onMemoryChange?: (data: MemoryData) => void;
}

/** The only place that picks a repo implementation. */
export function createDataLayer(env: Record<string, string | undefined>, opts: ContainerOptions): DataLayer {
  const backend = (env.DATA_BACKEND ?? 'memory') as DataBackend;
  switch (backend) {
    case 'memory':
      return memoryDataLayerFrom(opts.memoryData, opts.onMemoryChange);
    case 'd1':
      // TODO(d1): implement the D1 repos and uow (docs/DB-CONNECT-LATER.md).
      throw new Error('DATA_BACKEND=d1 is not implemented yet');
    default:
      throw new Error(`Unknown DATA_BACKEND "${backend}" (expected memory | d1)`);
  }
}

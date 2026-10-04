import { describe, expect, it } from 'vitest';
import { emptyMemoryData, MemoryStore, memoryDataLayerFrom, createMemoryDataLayer } from '../src/repos/memory';
import { runMasterRepoContract, runRepoContract, runProductionRepoContract, runPurchaseRepoContract, runSalesRepoContract, runCrmRepoContract, runTransportRepoContract, runMaintenanceRepoContract, runElectricityRepoContract, runStockRepoContract, runStoresRepoContract, runVendorRepoContract, runWorkflowRepoContract } from './repo-contract';

runRepoContract('memory', async () => memoryDataLayerFrom(emptyMemoryData()));
runMasterRepoContract('memory', async (seed) => memoryDataLayerFrom({ ...emptyMemoryData(), ...seed }));
runWorkflowRepoContract('memory', async () => memoryDataLayerFrom(emptyMemoryData()));
runVendorRepoContract('memory', async () => memoryDataLayerFrom(emptyMemoryData()));
runPurchaseRepoContract('memory', async () => memoryDataLayerFrom(emptyMemoryData()));
runStoresRepoContract('memory', async () => memoryDataLayerFrom(emptyMemoryData()));
runStockRepoContract('memory', async () => memoryDataLayerFrom(emptyMemoryData()));
runProductionRepoContract('memory', async () => memoryDataLayerFrom(emptyMemoryData()));
runSalesRepoContract('memory', async () => memoryDataLayerFrom(emptyMemoryData()));
runCrmRepoContract('memory', async () => memoryDataLayerFrom(emptyMemoryData()));

describe('memory backend: snapshot hook', () => {
  it('fires onChange after writes, once per committed unit of work, never for a rollback', async () => {
    const dumps: number[] = [];
    const store = new MemoryStore(emptyMemoryData(), (d) => dumps.push(d.users.length));
    const { repos, uow } = createMemoryDataLayer(store);
    const u = (id: string) => ({
      id,
      username: id,
      name: id,
      email: null,
      phone: null,
      department: null,
      role: 'admin' as const,
      status: 'Active' as const,
      passwordHash: null,
      createdBy: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });

    await repos.users.create(u('a'));
    await uow.run(async (tx) => {
      await tx.users.create(u('b'));
      await tx.users.create(u('c'));
    });
    await uow.run(async (tx) => {
      await tx.users.create(u('d'));
      throw new Error('no');
    }).catch(() => undefined);

    expect(dumps).toEqual([1, 3]);
  });
});
runTransportRepoContract('memory', async () => memoryDataLayerFrom(emptyMemoryData()));
runMaintenanceRepoContract('memory', async () => memoryDataLayerFrom(emptyMemoryData()));
runElectricityRepoContract('memory', async () => memoryDataLayerFrom(emptyMemoryData()));

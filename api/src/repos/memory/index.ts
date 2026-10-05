import { AsyncLocalStorage } from 'node:async_hooks';
import type { DataLayer, Repos, UnitOfWork } from '../index';
import { MemoryActivityRepo } from './activity';
import {
  MemoryCityRepo,
  MemoryCourierRepo,
  MemoryPartyRepo,
  MemoryProductRepo,
  MemoryStateRepo,
  MemoryUsageRepo,
} from './masters';
import { MemoryRolePermissionRepo } from './role-permissions';
import { MemorySessionRepo } from './sessions';
import { MemorySettingsRepo } from './settings';
import { MemoryStore, type MemoryData } from './store';
import { MemoryUserRepo } from './users';
import { MemoryConsumptionRepo, MemoryOpeningStockRepo, MemoryPurchaseDocumentRepo, MemoryPurchaseEntryRepo, MemoryPurchaseOrderRepo, MemoryPurchaseReturnRepo, MemoryPurchaseTypeRepo } from './purchase';
import { MemoryGrnRepo, MemoryMrnRepo } from './stores';
import { MemoryDocRepo, MemoryMattBatchRepo, MemoryWipAdjustmentRepo, MemoryWipBatchRepo } from './production';
import type { Chipping, Cutting, HotPress, Mdo, Plan, ResinUse, Summary } from '../../contracts/production';
import { MemoryCustomerRepo, MemoryFgStockRepo, MemoryIntercompanyRepo, MemoryPriceEntryRepo, MemorySalesDocRepo, MemorySalesItemRepo, MemoryWeightEntryRepo } from './sales';
import type { Proforma, SalesInvoice, SalesOrder } from '../../contracts/sales';
import { crmRepos } from './crm';
import { transportRepos } from './transport';
import { maintenanceRepos } from './maintenance';
import { electricityRepos } from './electricity';
import { complaintsRepos } from './complaints';
import { dwpasRepos } from './dwpas';
import { MemoryReclassRepo, MemorySkuGroupRepo, MemoryStockOpeningRepo, MemoryStockSlipRepo } from './stock';
import { MemoryTncRepo, MemoryVendorCategoryRepo, MemoryVendorProductRepo, MemoryVendorRepo } from './vendors';
import { MemoryCounterRepo, MemoryDispatchRepo, MemoryNotificationRepo, MemoryRequestRepo } from './workflow';

export { MemoryStore, emptyMemoryData, withMissingTables, type MemoryData } from './store';

/**
 * Snapshot-and-rollback unit of work.
 * Runs are serialised so one rollback can't undo another request's writes.
 * A run started inside another run joins it.
 * Writes made outside any run apply right away, the same as autocommit statements in D1.
 */
class MemoryUnitOfWork implements UnitOfWork {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly inside = new AsyncLocalStorage<true>();

  constructor(
    private readonly store: MemoryStore,
    private readonly repos: Repos,
  ) {}

  run<T>(fn: (tx: Repos) => Promise<T>): Promise<T> {
    if (this.inside.getStore()) return fn(this.repos);
    const next = this.queue.then(() => this.inside.run(true, () => this.runOnce(fn)));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async runOnce<T>(fn: (tx: Repos) => Promise<T>): Promise<T> {
    const snapshot = this.store.dump();
    this.store.hold();
    try {
      const result = await fn(this.repos);
      this.store.release(true);
      return result;
    } catch (err) {
      this.store.load(snapshot);
      this.store.release(false);
      throw err;
    }
  }
}

export function createMemoryDataLayer(store: MemoryStore): DataLayer {
  const repos: Repos = {
    users: new MemoryUserRepo(store),
    sessions: new MemorySessionRepo(store),
    rolePermissions: new MemoryRolePermissionRepo(store),
    activity: new MemoryActivityRepo(store),
    parties: new MemoryPartyRepo(store),
    couriers: new MemoryCourierRepo(store),
    products: new MemoryProductRepo(store),
    states: new MemoryStateRepo(store),
    cities: new MemoryCityRepo(store),
    usage: new MemoryUsageRepo(store),
    counters: new MemoryCounterRepo(store),
    requests: new MemoryRequestRepo(store),
    notifications: new MemoryNotificationRepo(store),
    dispatches: new MemoryDispatchRepo(store),
    settings: new MemorySettingsRepo(store),
    vendorCategories: new MemoryVendorCategoryRepo(store),
    vendorProducts: new MemoryVendorProductRepo(store),
    vendors: new MemoryVendorRepo(store),
    tnc: new MemoryTncRepo(store),
    purchaseTypes: new MemoryPurchaseTypeRepo(store),
    purchaseEntries: new MemoryPurchaseEntryRepo(store),
    purchaseOrders: new MemoryPurchaseOrderRepo(store),
    purchaseReturns: new MemoryPurchaseReturnRepo(store),
    openingStock: new MemoryOpeningStockRepo(store),
    consumption: new MemoryConsumptionRepo(store),
    purchaseDocuments: new MemoryPurchaseDocumentRepo(store),
    mrns: new MemoryMrnRepo(store),
    grns: new MemoryGrnRepo(store),
    skuGroups: new MemorySkuGroupRepo(store),
    stockSlips: new MemoryStockSlipRepo(store),
    stockOpening: new MemoryStockOpeningRepo(store),
    reclasses: new MemoryReclassRepo(store),
    prodPlans: new MemoryDocRepo<Plan>(store, 'prPlans', 'production_plans', ['planOp']),
    prodHotpress: new MemoryDocRepo<HotPress>(store, 'prHotpress', 'hotpress_reports', ['product', 'size', 'operator']),
    prodChipping: new MemoryDocRepo<Chipping>(store, 'prChipping', 'chipping_reports', ['operator', 'machine']),
    prodResin: new MemoryDocRepo<ResinUse>(store, 'prResin', 'resin_consumption', ['product', 'operator']),
    prodCutting: new MemoryDocRepo<Cutting>(store, 'prCutting', 'board_cutting', ['operator']),
    prodSummary: new MemoryDocRepo<Summary>(store, 'prSummary', 'production_summaries', ['product', 'size', 'batch']),
    prodMdo: new MemoryDocRepo<Mdo>(store, 'prMdo', 'mdo_reports', ['operator']),
    mattBatches: new MemoryMattBatchRepo(store),
    wipBatches: new MemoryWipBatchRepo(store),
    wipAdjustments: new MemoryWipAdjustmentRepo(store),
    salesCustomers: new MemoryCustomerRepo(store),
    salesItems: new MemorySalesItemRepo(store),
    salesPrices: new MemoryPriceEntryRepo(store),
    salesWeights: new MemoryWeightEntryRepo(store),
    proformas: new MemorySalesDocRepo<Proforma>(store, 'slProformas', 'sales_proformas', 'piNo', 'status', ['poRef', 'soNo']),
    salesOrders: new MemorySalesDocRepo<SalesOrder>(store, 'slOrders', 'sales_orders', 'soNo', 'status', ['poNo', 'piNo']),
    salesInvoices: new MemorySalesDocRepo<SalesInvoice>(store, 'slInvoices', 'sales_invoices', 'invNo', 'approval', ['soNo', 'poNo', 'ewayBill']),
    fgStock: new MemoryFgStockRepo(store),
    intercompany: new MemoryIntercompanyRepo(store),
    ...crmRepos(store),
    ...transportRepos(store),
    ...maintenanceRepos(store),
    ...electricityRepos(store),
    ...complaintsRepos(store),
    ...dwpasRepos(store),
  };
  return { repos, uow: new MemoryUnitOfWork(store, repos) };
}

export function memoryDataLayerFrom(data: MemoryData, onChange?: (data: MemoryData) => void): DataLayer {
  return createMemoryDataLayer(new MemoryStore(data, onChange));
}

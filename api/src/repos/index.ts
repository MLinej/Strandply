import type { ActivityRepo } from './activity';
import type { RolePermissionRepo } from './role-permissions';
import type { SessionRepo } from './sessions';
import type { CityRepo, CourierRepo, PartyRepo, ProductRepo, StateRepo, UsageRepo } from './masters';
import type { SettingsRepo } from './settings';
import type { UserRepo } from './users';
import type { CounterRepo, DispatchRepo, NotificationRepo, RequestRepo } from './workflow';

export * from './types';
export * from './users';
export * from './sessions';
export * from './role-permissions';
export * from './activity';
export * from './masters';
export * from './workflow';
export * from './settings';

/** Every repo the app uses. Routes and services receive this, never a concrete implementation. */
export interface Repos {
  users: UserRepo;
  sessions: SessionRepo;
  rolePermissions: RolePermissionRepo;
  activity: ActivityRepo;
  parties: PartyRepo;
  couriers: CourierRepo;
  products: ProductRepo;
  states: StateRepo;
  cities: CityRepo;
  usage: UsageRepo;
  counters: CounterRepo;
  requests: RequestRepo;
  notifications: NotificationRepo;
  dispatches: DispatchRepo;
  settings: SettingsRepo;
}

/**
 * Unit of work. Everything `fn` does through `tx` commits together or not at all.
 * Use it wherever the spec says "atomic".
 * - memory: snapshot and roll back, serialised. A nested run joins the outer one.
 * - d1: one batch(). TODO(d1)
 */
export interface UnitOfWork {
  run<T>(fn: (tx: Repos) => Promise<T>): Promise<T>;
}

export interface DataLayer {
  repos: Repos;
  uow: UnitOfWork;
}

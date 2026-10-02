// Repo interfaces for the SampleTrack masters: parties, couriers, products, states, cities.
// Every read ignores soft-deleted rows. Rows are returned as copies.
import type {
  City,
  CityFilters,
  Courier,
  CourierFilters,
  CourierType,
  Party,
  PartyFilters,
  Product,
  ProductFilters,
  State,
} from '../contracts/sampletrack';
import type { ListQuery, ListResult } from './types';

export type NewRow<T> = Omit<T, 'deletedAt'>;
export type Patch<T, K extends keyof T> = Partial<Pick<T, K>> & { updatedAt: string };

// ── Parties (st_parties) ─────────────────────────────────────────────

export type PartyPatch = Patch<
  Party,
  | 'name'
  | 'contact'
  | 'mobile'
  | 'email'
  | 'gst'
  | 'address'
  | 'city'
  | 'state'
  | 'pin'
  | 'industry'
  | 'type'
  | 'assignedUserId'
  | 'remarks'
>;

export interface PartyRepo {
  getById(id: string): Promise<Party | null>;
  /** Searches name, contact, mobile, email, gst, city and state. Sortable: name (default), city, state, type, createdAt. */
  list(query: ListQuery<PartyFilters>): Promise<ListResult<Party>>;
  /** Live parties whose name equals `name` ignoring case and repeated spaces. */
  findByName(name: string, excludeId?: string): Promise<Party[]>;
  create(row: NewRow<Party>): Promise<Party>;
  update(id: string, patch: PartyPatch): Promise<Party | null>;
  softDelete(id: string, at: string): Promise<boolean>;
  /** Distinct (city, state) pairs used by live parties, for the city dropdown. */
  usedCities(): Promise<{ city: string; state: string | null }[]>;
}

// ── Couriers (st_couriers) ───────────────────────────────────────────

export type CourierPatch = Patch<
  Courier,
  'name' | 'type' | 'contact' | 'mobile' | 'email' | 'coverage' | 'trackingUrlTemplate' | 'rating' | 'status' | 'remarks'
>;

export interface CourierRepo {
  getById(id: string): Promise<Courier | null>;
  /** Searches name, contact, mobile, email and coverage. Sortable: name (default), type, rating, status, createdAt. */
  list(query: ListQuery<CourierFilters>): Promise<ListResult<Courier>>;
  /** Every active courier, by name. Filtered to one type when `type` is given. Not paginated (a small table). */
  listActive(type?: CourierType): Promise<Courier[]>;
  create(row: NewRow<Courier>): Promise<Courier>;
  update(id: string, patch: CourierPatch): Promise<Courier | null>;
  softDelete(id: string, at: string): Promise<boolean>;
}

// ── Products (st_products) ───────────────────────────────────────────

export type ProductPatch = Patch<
  Product,
  'code' | 'name' | 'boardType' | 'thicknessMm' | 'size' | 'category' | 'unitPricePaise' | 'stockStatus' | 'description'
>;

export interface ProductKey {
  id: string;
  code: string;
  name: string;
}

export interface ProductRepo {
  getById(id: string): Promise<Product | null>;
  /** Case-insensitive, live rows only. */
  getByCode(code: string): Promise<Product | null>;
  /** Searches code, name, size, category and description. Sortable: name (default), code, boardType, thicknessMm, unitPricePaise, stockStatus, createdAt. */
  list(query: ListQuery<ProductFilters>): Promise<ListResult<Product>>;
  /** id/code/name of every live product. Lets an import check duplicates in one read. */
  listKeys(): Promise<ProductKey[]>;
  /** @throws UniqueViolationError('products', 'code') */
  create(row: NewRow<Product>): Promise<Product>;
  /** @throws UniqueViolationError('products', 'code') */
  update(id: string, patch: ProductPatch): Promise<Product | null>;
  softDelete(id: string, at: string): Promise<boolean>;
  countByBoardType(): Promise<{ boardType: Product['boardType']; count: number }[]>;
}

// ── States and cities (st_states, st_city_master) ────────────────────

export interface StateRepo {
  /** Ordered by name. */
  listAll(): Promise<State[]>;
  getById(id: string): Promise<State | null>;
  /** Case-insensitive. */
  getByName(name: string): Promise<State | null>;
}

export type CityPatch = Patch<City, 'city' | 'stateId' | 'pincodes'>;

export interface CityRepo {
  getById(id: string): Promise<City | null>;
  /** Searches city; a query of digits matches the start of any pincode instead. Sortable: city (default), createdAt. */
  list(query: ListQuery<CityFilters>): Promise<ListResult<City>>;
  /** Every live city. Small table. */
  listAll(): Promise<City[]>;
  /** Case-insensitive on city. */
  find(city: string, stateId: string): Promise<City | null>;
  /** The live city that lists `pincode`, if any. */
  findByPincode(pincode: string): Promise<City | null>;
  /** @throws UniqueViolationError('cities', 'city') */
  create(row: NewRow<City>): Promise<City>;
  /** @throws UniqueViolationError('cities', 'city') */
  update(id: string, patch: CityPatch): Promise<City | null>;
  softDelete(id: string, at: string): Promise<boolean>;
}

// ── Reference checks ─────────────────────────────────────────────────

export interface UsageCount {
  requests: number;
  dispatches: number;
}

/**
 * How many live requests/dispatches point at a master record. Deletes are blocked
 * while this is non-zero, so no request or dispatch is ever left pointing at a deleted row.
 */
export interface UsageRepo {
  party(id: string): Promise<UsageCount>;
  courier(id: string): Promise<UsageCount>;
  /** Requests: through st_request_items.product_id. Dispatches: always 0 (a dispatch has no product link). */
  product(id: string): Promise<UsageCount>;
  /** Live dispatches whose linked_request_id is this request. */
  requestDispatches(requestId: string): Promise<number>;
}

import type { Role } from '../domain/access';
import type { ListQuery, ListResult } from './types';

export const USER_STATUSES = ['Active', 'Inactive'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Table `users` (db/migrations/0001_users.sql). */
export interface User {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  role: Role;
  status: UserStatus;
  /** PHC-encoded argon2id. Never leaves the API. */
  passwordHash: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type NewUser = Omit<User, 'deletedAt'>;

export type UserPatch = Partial<
  Pick<User, 'username' | 'name' | 'email' | 'phone' | 'department' | 'role' | 'status' | 'passwordHash'>
> & { updatedAt: string };

export interface UserFilters {
  role: Role;
  status: UserStatus;
}

export interface UserRoleStatusCount {
  role: Role;
  status: UserStatus;
  count: number;
}

/** Every read ignores soft-deleted rows. */
export interface UserRepo {
  getById(id: string): Promise<User | null>;
  /** Live users among `ids`, in no particular order. For joining names onto lists in one read. */
  getByIds(ids: string[]): Promise<User[]>;
  /** Active users in any of `roles`, by name. Used for pickers (small result). */
  listActiveByRoles(roles: Role[]): Promise<User[]>;
  /** Case-insensitive. */
  getByUsername(username: string): Promise<User | null>;
  /** Searches username, name, email, phone and department. Sortable by username, name, role, status, createdAt (default: name). */
  list(query: ListQuery<UserFilters>): Promise<ListResult<User>>;
  /** @throws UniqueViolationError('users', 'username') */
  create(user: NewUser): Promise<User>;
  /** Returns null if the user is missing or deleted. @throws UniqueViolationError('users', 'username') */
  update(id: string, patch: UserPatch): Promise<User | null>;
  /** Returns false if the user is missing or already deleted. The username becomes free again. */
  softDelete(id: string, at: string): Promise<boolean>;
  countByRoleAndStatus(): Promise<UserRoleStatusCount[]>;
}

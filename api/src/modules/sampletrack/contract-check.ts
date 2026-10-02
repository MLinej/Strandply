// Compile-time guard: the wire types in src/contracts must match what the services return.
// If a service type changes and the contract doesn't, typecheck fails here.
import type * as C from '../../contracts/admin';
import { ACTION_KEYS, PAGE_KEYS, ROLES, WIDGET_KEYS } from '../../domain/access';
import { ACTIVITY_ACTIONS, type ActivityEntry } from '../../repos';
import type { RolePermissionsView } from './permission-service';
import type { PublicUser, UserStats } from './user-service';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const ok = <T extends true>() => undefined as unknown as T;

ok<Same<PublicUser, C.PublicUser>>();
ok<Same<UserStats, C.UserStats>>();
ok<Same<ActivityEntry, C.ActivityEntryView>>();
ok<Same<RolePermissionsView['role'], C.RolePermissionsView['role']>>();
ok<Same<(typeof ROLES)[number], C.RoleKey>>();
ok<Same<(typeof PAGE_KEYS)[number], (typeof C.PAGE_KEYS)[number]>>();
ok<Same<(typeof ACTION_KEYS)[number], (typeof C.ACTION_KEYS)[number]>>();
ok<Same<(typeof WIDGET_KEYS)[number], (typeof C.WIDGET_KEYS)[number]>>();
ok<Same<(typeof ACTIVITY_ACTIONS)[number], (typeof C.ACTIVITY_ACTION_KEYS)[number]>>();

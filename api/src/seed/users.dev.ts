// ════════════════════════════════════════════════════════════════════
// DEV ONLY. Never loaded when NODE_ENV=production (see seed/index.ts),
// and never written to any SQL migration.
// One login per SampleTrack role, for local development:
//
//   username     password
//   superadmin   superadmin-dev
//   admin        admin-dev-pass
//   dispatch     dispatch-dev
//   marketing    marketing-dev
//   mgmt         mgmt-dev-pass
//
// The hashes are argon2id with DEFAULT_ARGON2 parameters.
// ════════════════════════════════════════════════════════════════════
import type { User } from '../repos';

const at = '2026-10-01T00:00:00.000Z';

const base = { phone: null, createdBy: null, createdAt: at, updatedAt: at, deletedAt: null, status: 'Active' } as const;

export const DEV_USERS: User[] = [
  {
    ...base,
    id: 'dev-user-superadmin',
    username: 'superadmin',
    name: 'Super Admin',
    email: 'super@strandply.test',
    department: 'IT',
    role: 'superadmin',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$g38Vv0pYjXJf8Rc8APtxgA$oMJSG88+3eW8ietzoL2+LPefF04f2e2cZpYGPu8lo8Y',
  },
  {
    ...base,
    id: 'dev-user-admin',
    username: 'admin',
    name: 'Rahul Admin',
    email: 'admin@strandply.test',
    department: 'Administration',
    role: 'admin',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$kfWRu31BeE/QLoiCzjr5hw$WW8LY1d1D+Hj/hSIi32FRpZucN+fP4gjFi3Ji2Wvr60',
  },
  {
    ...base,
    id: 'dev-user-dispatch',
    username: 'dispatch',
    name: 'Dispatch Mgr',
    email: 'disp@strandply.test',
    department: 'Dispatch',
    role: 'dispatch',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$s+lLhFf4y56eOk2kQC6fKA$FOD75AxiVmAO9eQI73JeZiILs0+EX3UHRpGGqGJUx6I',
  },
  {
    ...base,
    id: 'dev-user-marketing',
    username: 'marketing',
    name: 'Ankit Marketing',
    email: 'mkt@strandply.test',
    department: 'Sales',
    role: 'marketing',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$xD0R6/B2buLqYiQ+wXbcDQ$/4oUMtcFE8mWuFWTviHAlYx5Xm41RoJPANPgVg6Z7Pc',
  },
  {
    ...base,
    id: 'dev-user-mgmt',
    username: 'mgmt',
    name: 'Management View',
    email: 'mgmt@strandply.test',
    department: 'Management',
    role: 'management',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$m8qn+bEPlCSXmHct/Xtk1g$aTjqC2wZFeahgEfkW+vBqcefYwxnE29XqU9hfibxcAA',
  },
];

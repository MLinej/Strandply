import { describe, expect, it } from 'vitest';
import { hashPassword, TEST_ARGON2, verifyPassword } from '../src/auth/password';
import { DEV_USERS } from '../src/seed/users.dev';

describe('argon2id passwords', () => {
  it('hashes to a PHC string with a random salt and verifies', async () => {
    const a = await hashPassword('correct horse', TEST_ARGON2);
    const b = await hashPassword('correct horse', TEST_ARGON2);
    expect(a).toMatch(/^\$argon2id\$v=19\$m=64,t=1,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('correct horsf', a)).toBe(false);
  });

  it('returns false for malformed hashes instead of throwing', async () => {
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'plaintext')).toBe(false);
    expect(await verifyPassword('x', '$argon2i$v=19$m=64,t=1,p=1$aaaa$bbbb')).toBe(false);
  });

  it('the DEV ONLY seed users verify with their documented passwords', async () => {
    const pw: Record<string, string> = {
      superadmin: 'superadmin-dev',
      admin: 'admin-dev-pass',
      dispatch: 'dispatch-dev',
      marketing: 'marketing-dev',
      mgmt: 'mgmt-dev-pass',
    };
    const results = await Promise.all(DEV_USERS.map((u) => verifyPassword(pw[u.username]!, u.passwordHash!)));
    expect(results).toEqual(DEV_USERS.map(() => true));
    for (const u of DEV_USERS) expect(pw[u.username]!.length).toBeGreaterThanOrEqual(8);
  }, 20_000);
});

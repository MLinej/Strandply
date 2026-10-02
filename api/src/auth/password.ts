import { argon2idAsync } from '@noble/hashes/argon2.js';
import { fromBase64, timingSafeEqual, toBase64 } from '../lib/crypto';

// argon2id in pure JS (@noble/hashes), so it runs on Node and Workers alike.
// Hashes are stored as PHC strings: $argon2id$v=19$m=<KiB>,t=<iters>,p=<lanes>$<salt>$<hash>
// The cost parameters are read back from each stored hash, so raising them later doesn't break existing hashes.

export interface Argon2Params {
  /** Memory in KiB. */
  m: number;
  t: number;
  p: number;
}

/** OWASP minimum for argon2id: 19 MiB, 2 iterations, 1 lane. */
export const DEFAULT_ARGON2: Argon2Params = { m: 19456, t: 2, p: 1 };

/** Only for tests. Never use in a running server. */
export const TEST_ARGON2: Argon2Params = { m: 64, t: 1, p: 1 };

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;

const SALT_BYTES = 16;
const HASH_BYTES = 32;
const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

const b64 = (bytes: Uint8Array) => toBase64(bytes, { pad: false });

export async function hashPassword(password: string, params: Argon2Params = DEFAULT_ARGON2): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await argon2idAsync(password, salt, { ...params, dkLen: HASH_BYTES });
  return `$argon2id$v=19$m=${params.m},t=${params.t},p=${params.p}$${b64(salt)}$${b64(hash)}`;
}

/** False for a wrong password and for a malformed hash. Never throws on bad input. */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const match = PHC.exec(encoded);
  if (!match) return false;
  const [, m, t, p, saltB64, hashB64] = match;
  const expected = fromBase64(hashB64!);
  const actual = await argon2idAsync(password, fromBase64(saltB64!), {
    m: Number(m),
    t: Number(t),
    p: Number(p),
    dkLen: expected.length,
  });
  return timingSafeEqual(actual, expected);
}

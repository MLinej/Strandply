// WebCrypto only, so this runs unchanged on Node 20+ and Workers.

export const newId = (): string => crypto.randomUUID();

export function toBase64(bytes: Uint8Array, { url = false, pad = true } = {}): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  let out = btoa(bin);
  if (url) out = out.replace(/\+/g, '-').replace(/\//g, '_');
  if (!pad) out = out.replace(/=+$/, '');
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const std = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = std + '='.repeat((4 - (std.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 256-bit random session token, base64url. */
export function newSessionToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)), { url: true, pad: false });
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

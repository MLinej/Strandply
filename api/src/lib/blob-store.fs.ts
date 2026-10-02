// Node-only BlobStore for local development: one file per key, plus a .mime sidecar.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { BlobStore } from './blob-store';

export class FsBlobStore implements BlobStore {
  constructor(private readonly root: string) {}

  private path(key: string) {
    const p = resolve(this.root, key);
    if (!p.startsWith(resolve(this.root))) throw new Error('Invalid blob key');
    return p;
  }

  async put(key: string, bytes: Uint8Array, mime: string) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, bytes);
    await writeFile(`${p}.mime`, mime);
  }

  async get(key: string) {
    const p = this.path(key);
    try {
      const [bytes, mime] = await Promise.all([readFile(p), readFile(`${p}.mime`, 'utf8')]);
      return { bytes: new Uint8Array(bytes), mime };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    const p = this.path(key);
    await rm(p, { force: true });
    await rm(`${p}.mime`, { force: true });
  }
}

export const devBlobRoot = (apiDir: string) => join(apiDir, '.data', 'files');

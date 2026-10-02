// Where uploaded files (purchase documents) live. Metadata stays in the repos; the bytes go here.
// memory: tests. fs (blob-store.fs.ts): local dev under api/.data/files. TODO(r2): an R2 bucket on Workers.

export interface StoredBlob {
  bytes: Uint8Array;
  mime: string;
}

export interface BlobStore {
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<StoredBlob | null>;
  delete(key: string): Promise<void>;
}

export class MemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, StoredBlob>();

  async put(key: string, bytes: Uint8Array, mime: string) {
    this.blobs.set(key, { bytes: bytes.slice(), mime });
  }

  async get(key: string) {
    const b = this.blobs.get(key);
    return b ? { bytes: b.bytes.slice(), mime: b.mime } : null;
  }

  async delete(key: string) {
    this.blobs.delete(key);
  }
}

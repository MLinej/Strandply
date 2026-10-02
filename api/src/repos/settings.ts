import type { Setting } from '../contracts/sampletrack';

/** st_settings: one JSON value per key. */
export interface SettingsRepo {
  /** Values for the keys that exist (missing keys are left out). */
  getMany(keys: string[]): Promise<Record<string, unknown>>;
  /** Insert or replace. A replace keeps the original createdAt and createdBy. */
  set(key: string, value: unknown, by: string | null, at: string): Promise<Setting>;
}

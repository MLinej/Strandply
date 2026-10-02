import { serve } from '@hono/node-server';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { loadConfig } from './config';
import { createDataLayer } from './container';
import { withMissingTables, type MemoryData } from './repos/memory';
import { buildSeed } from './seed';
import { upgradeSnapshot } from './seed/upgrades';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

// Memory backend only: optional JSON snapshot so dev data survives a restart.
// Turn it off with DATA_SNAPSHOT=0.
const snapshotPath = resolve(dirname(fileURLToPath(import.meta.url)), '../.data/dev.json');
const useSnapshot = !isProd && env.DATA_SNAPSHOT !== '0';

function loadSnapshot(): Partial<MemoryData> | null {
  if (!useSnapshot) return null;
  try {
    return JSON.parse(readFileSync(snapshotPath, 'utf8')) as Partial<MemoryData>;
  } catch {
    return null;
  }
}

let writeTimer: NodeJS.Timeout | undefined;
function saveSnapshot(data: MemoryData) {
  if (!useSnapshot) return;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    mkdirSync(dirname(snapshotPath), { recursive: true });
    const tmp = `${snapshotPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 1));
    renameSync(tmp, snapshotPath);
  }, 200);
}

const seed = buildSeed({ devUsers: !isProd }); // DEV ONLY users/demo data are never seeded in production
const snapshot = loadSnapshot();
const data = createDataLayer(env, {
  // An older snapshot is upgraded first; tables it predates then come from the seed.
  memoryData: snapshot ? withMissingTables(upgradeSnapshot(snapshot, seed, new Date().toISOString()), seed) : seed,
  onMemoryChange: saveSnapshot,
});

const { app } = createApp({ data, config: loadConfig(env) });
const port = Number(env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`api listening on http://localhost:${port} (DATA_BACKEND=${env.DATA_BACKEND ?? 'memory'})`);
});

import type { Kysely } from 'kysely';
import type { Config } from './config.js';
import type { DB } from './db/types.js';
import type { Storage } from './lib/storage.js';
import type { CatalogStore } from './modules/catalog/store.js';
import type { AiClient } from './modules/jobs/aiClient.js';
import type { Notifier } from './modules/notify/notifier.js';

/** Everything a route or job needs; built once in server.ts / worker.ts, swapped in tests. */
export interface Deps {
  db: Kysely<DB>;
  /** read-only furniture catalog, loaded from its own database */
  catalog: CatalogStore;
  config: Config;
  storage: Storage;
  ai: AiClient;
  notifier: Notifier;
}

import { config } from './config.js';
import { createCatalogDb } from './db/catalog/index.js';
import { db } from './db/index.js';
import type { Deps } from './deps.js';
import { Storage } from './lib/storage.js';
import { CatalogStore } from './modules/catalog/store.js';
import { HttpAiClient } from './modules/jobs/aiClient.js';
import { createFcmSender, LogSender, PushNotifier } from './modules/notify/notifier.js';

/** Production wiring shared by server.ts and worker.ts. */
export async function createDeps(): Promise<Deps> {
  const sender = config.FIREBASE_SERVICE_ACCOUNT ? await createFcmSender(config.FIREBASE_SERVICE_ACCOUNT) : new LogSender();
  const catalog = await new CatalogStore(createCatalogDb()).reload();
  return {
    db,
    catalog,
    config,
    storage: new Storage(config.STORAGE_DIR, config.FILE_SIGNING_SECRET),
    ai: new HttpAiClient(config.AI_URL),
    notifier: new PushNotifier(db, sender),
  };
}

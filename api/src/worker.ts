import { setTimeout as sleep } from 'node:timers/promises';
import { createDeps } from './bootstrap.js';
import { runCleanup } from './modules/cleanup/cleanup.js';
import { processNextJob, requeueStaleJobs } from './modules/jobs/queue.js';

const deps = await createDeps();
const { config } = deps;
let stopping = false;

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => (stopping = true));

await requeueStaleJobs(deps.db);
console.log('[worker] started');

let nextCleanup = 0;
while (!stopping) {
  try {
    if (Date.now() >= nextCleanup) {
      nextCleanup = Date.now() + config.CLEANUP_INTERVAL_MS;
      const r = await runCleanup(deps);
      if (r.drafts_deleted || r.moves_photos_purged) console.log('[worker] cleanup', r);
    }
    const didWork = await processNextJob(deps);
    if (!didWork) await sleep(config.WORKER_POLL_MS);
  } catch (e) {
    console.error('[worker] error', e);
    await sleep(config.WORKER_POLL_MS);
  }
}
await deps.db.destroy();
console.log('[worker] stopped');

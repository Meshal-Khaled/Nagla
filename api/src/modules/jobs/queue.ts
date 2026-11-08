import { sql, type Kysely } from 'kysely';
import type { DB } from '../../db/types.js';
import type { Deps } from '../../deps.js';
import { runDetection } from './detection.js';

/** Atomically take the oldest queued job; safe with several workers. */
export async function claimJob(db: Kysely<DB>) {
  const res = await sql<{ id: string; move_id: string; type: 'detection' }>`
    UPDATE jobs SET status = 'running', started_at = now()
    WHERE id = (
      SELECT id FROM jobs WHERE status = 'queued'
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id, move_id, type
  `.execute(db);
  return res.rows[0];
}

/** Claim and run one job. Returns false when the queue is empty. */
export async function processNextJob(deps: Pick<Deps, 'db' | 'storage' | 'ai' | 'catalog'>) {
  const job = await claimJob(deps.db);
  if (!job) return false;
  try {
    if (job.type === 'detection') await runDetection(deps, job.move_id);
    await deps.db.updateTable('jobs').set({ status: 'done', finished_at: new Date(), error: null })
      .where('id', '=', job.id).execute();
  } catch (e) {
    await deps.db.updateTable('jobs').set({ status: 'failed', finished_at: new Date(), error: (e as Error).message })
      .where('id', '=', job.id).execute();
  }
  return true;
}

/** Jobs left `running` by a crashed worker go back to the queue on start-up. */
export async function requeueStaleJobs(db: Kysely<DB>) {
  await db.updateTable('jobs').set({ status: 'queued', started_at: null })
    .where('status', '=', 'running').execute();
}

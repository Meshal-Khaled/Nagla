import { sql } from 'kysely';
import type { Deps } from '../../deps.js';
import { loadSettings } from '../quotes/inputs.js';

/**
 * Privacy cleanup (plan risk 7):
 * - unsaved drafts are deleted after `unsaved_draft_ttl_hours`, saved drafts `draft_ttl_hours` after their last change
 * - photos of finished moves are deleted `photo_retention_days` after the last event
 */
export async function runCleanup({ db, storage }: Pick<Deps, 'db' | 'storage'>, now = new Date()) {
  const s = await loadSettings(db);

  // unsaved drafts go quickly; drafts the customer saved (or archived) last `draft_ttl_hours` since their last change
  const unsavedCutoff = new Date(now.getTime() - s.unsaved_draft_ttl_hours * 3600_000);
  const draftCutoff = new Date(now.getTime() - s.draft_ttl_hours * 3600_000);
  const drafts = await db.deleteFrom('moves')
    .where('status', '=', 'draft')
    .where((eb) => eb.or([
      eb.and([eb('draft_saved', '=', false), eb('created_at', '<', unsavedCutoff)]),
      eb.and([eb('draft_saved', '=', true), eb('updated_at', '<', draftCutoff)]),
    ]))
    .returning('id').execute();
  // files after the rows are gone (cascade removed photos/items/detections/jobs)
  for (const d of drafts) await storage.removeMoveDir(d.id);

  const retentionCutoff = new Date(now.getTime() - s.photo_retention_days * 86400_000);
  const finished = await db.selectFrom('moves').select('id')
    .where('current_stage', 'in', ['completed', 'cancelled', 'rejected'])
    .where(sql<boolean>`(SELECT max(created_at) FROM move_events e WHERE e.move_id = moves.id) < ${retentionCutoff}`)
    .where((eb) => eb.or([
      eb.exists(eb.selectFrom('photos').select('photos.id').whereRef('photos.move_id', '=', 'moves.id')),
      eb.exists(eb.selectFrom('move_events').select('move_events.id')
        .whereRef('move_events.move_id', '=', 'moves.id').where('move_events.photo_path', 'is not', null)),
    ]))
    .execute();
  for (const m of finished) {
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom('photos').where('move_id', '=', m.id).execute();
      await trx.updateTable('move_events').set({ photo_path: null }).where('move_id', '=', m.id).execute();
    });
    await storage.removeMoveDir(m.id);
  }

  return { drafts_deleted: drafts.length, moves_photos_purged: finished.length };
}

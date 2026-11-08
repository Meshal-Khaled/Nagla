import type { Kysely } from 'kysely';
import type { DB } from '../../db/types.js';
import type { Deps } from '../../deps.js';
import { sha256 } from '../../lib/crypto.js';
import { conflict, forbidden, isUniqueViolation } from '../../lib/errors.js';
import { type Actor, END_STAGES, MAIN_STAGES, planTransition, progress, type Stage } from './stages.js';

export interface StageEventInput {
  moveId: string;
  stage: Stage;
  actor: Actor;
  actorId: string | null;
  idempotencyKey: string;
  photo?: Buffer;
}

export type StageEventResult = 'created' | 'duplicate' | 'noop';

/** Move for a valid (matching, unexpired) agent token, or undefined. */
export async function findMoveByAgentToken(db: Kysely<DB>, token: string) {
  return db.selectFrom('moves').selectAll()
    .where('agent_token_hash', '=', sha256(token))
    .where('agent_token_expires_at', '>', new Date())
    .executeTakeFirst();
}

/**
 * The stage-event handler (plan Step 6): idempotency → same-stage no-op → forward-only with
 * skipped stages logged → actor check → event + stage in one transaction → notify after commit.
 */
export async function applyStageEvent(deps: Pick<Deps, 'db' | 'storage' | 'notifier'>, input: StageEventInput) {
  const { db, storage } = deps;
  const dup = await db.selectFrom('move_events').select('id')
    .where('move_id', '=', input.moveId).where('idempotency_key', '=', input.idempotencyKey).executeTakeFirst();
  if (dup) return 'duplicate' as const;

  const eventId = crypto.randomUUID();
  const photoPath = input.photo ? `${input.moveId}/events/${eventId}.jpg` : null;
  if (input.photo && photoPath) await storage.saveImage(photoPath, input.photo);

  let result: StageEventResult;
  try {
    result = await db.transaction().execute(async (trx) => {
      const move = await trx.selectFrom('moves').select(['status', 'current_stage'])
        .where('id', '=', input.moveId).forUpdate().executeTakeFirstOrThrow();
      const current = move.current_stage as Stage | null;

      let skipped: Stage[] = [];
      if (move.status === 'draft') {
        // a draft can only be cancelled, by its customer
        if (input.stage !== 'cancelled') throw conflict('not_confirmed', 'The move is not confirmed yet');
        if (input.actor !== 'customer') throw forbidden();
      } else {
        if (current === input.stage) return 'noop' as const; // double tap
        skipped = planTransition(input.actor, current, input.stage).skipped;
      }

      const base = Date.now();
      const rows = [...skipped, input.stage].map((stage, i) => {
        const isTarget = i === skipped.length;
        return {
          id: isTarget ? eventId : crypto.randomUUID(),
          move_id: input.moveId,
          stage,
          actor_type: input.actor,
          actor_id: input.actorId,
          skipped: !isTarget,
          idempotency_key: isTarget ? input.idempotencyKey : null,
          photo_path: isTarget ? photoPath : null,
          created_at: new Date(base + i), // keeps timeline order for skipped stages
        };
      });
      await trx.insertInto('move_events').values(rows).execute();

      const ended = END_STAGES.includes(input.stage);
      await trx.updateTable('moves').set({
        current_stage: input.stage,
        ...(input.stage === 'cancelled' ? { status: 'cancelled' as const } : {}),
        // the agent link stops working once the move is over
        ...(ended ? { agent_token_expires_at: new Date() } : {}),
        updated_at: new Date(),
      }).where('id', '=', input.moveId).execute();
      return 'created' as const;
    });
  } catch (e) {
    if (photoPath) await storage.remove(photoPath);
    if (isUniqueViolation(e)) return 'duplicate' as const; // same key raced in
    throw e;
  }
  if (result !== 'created' && photoPath) await storage.remove(photoPath);

  if (result === 'created') deps.notifier.stageChanged(input.moveId, input.stage);
  return result;
}

export async function trackingView({ db, storage }: Pick<Deps, 'db' | 'storage'>, moveId: string) {
  const move = await db.selectFrom('moves').select(['id', 'status', 'current_stage', 'company_id'])
    .where('id', '=', moveId).executeTakeFirstOrThrow();
  const events = await db.selectFrom('move_events')
    .select(['id', 'stage', 'actor_type', 'skipped', 'photo_path', 'created_at'])
    .where('move_id', '=', moveId).orderBy('created_at').orderBy('id').execute();
  return {
    move_id: move.id,
    status: move.status,
    current_stage: move.current_stage,
    stages: MAIN_STAGES,
    progress: progress(move.current_stage as Stage | null),
    events: events.map(({ photo_path, ...e }) => ({
      ...e,
      photo_url: photo_path ? storage.signedUrl('event', e.id) : null,
    })),
  };
}

import { conflict, forbidden } from '../../lib/errors.js';

export const MAIN_STAGES = [
  'confirmed', 'accepted', 'crew_assigned', 'on_the_way', 'arrived_pickup',
  'loading', 'loaded', 'in_transit', 'arrived_destination', 'unloading', 'completed',
] as const;

export type MainStage = (typeof MAIN_STAGES)[number];
export type Stage = MainStage | 'rejected' | 'cancelled';
export type Actor = 'company_admin' | 'agent' | 'customer' | 'system';

export const ALL_STAGES: Stage[] = [...MAIN_STAGES, 'rejected', 'cancelled'];
export const END_STAGES: Stage[] = ['completed', 'rejected', 'cancelled'];

const ADMIN_STAGES: Stage[] = ['accepted', 'rejected', 'crew_assigned'];
export const AGENT_STAGES: Stage[] = MAIN_STAGES.slice(MAIN_STAGES.indexOf('on_the_way'));

const idx = (s: Stage) => MAIN_STAGES.indexOf(s as MainStage);

export function canActorSet(actor: Actor, stage: Stage) {
  if (stage === 'cancelled') return actor === 'customer' || actor === 'company_admin';
  if (ADMIN_STAGES.includes(stage)) return actor === 'company_admin';
  if (AGENT_STAGES.includes(stage)) return actor === 'agent';
  return false;
}

/** Stages a given actor could set next from `current` (used by the agent page and dev UI). */
export function nextStagesFor(actor: Actor, current: Stage | null) {
  return ALL_STAGES.filter((s) => {
    try {
      planTransition(actor, current, s);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Validate a stage change and return the skipped main stages to log before it.
 * Throws 409 for illegal transitions and 403 when the actor may not set the stage.
 */
export function planTransition(actor: Actor, current: Stage | null, target: Stage): { skipped: MainStage[] } {
  if (!current) throw conflict('not_confirmed', 'The move is not confirmed yet');
  if (END_STAGES.includes(current)) throw conflict('move_closed', `The move is already ${current}`);

  if (target === 'cancelled') {
    if (idx(current) >= idx('on_the_way')) throw conflict('too_late_to_cancel', 'Cannot cancel once the crew is on the way');
  } else if (target === 'rejected') {
    if (current !== 'confirmed') throw conflict('cannot_reject', 'Only a newly confirmed move can be rejected');
  } else {
    if (idx(target) <= idx(current)) throw conflict('backward_stage', `Cannot go from ${current} back to ${target}`);
    if (actor === 'agent' && AGENT_STAGES.includes(target) && idx(current) < idx('accepted')) {
      throw conflict('not_accepted', 'The company has not accepted this move yet');
    }
  }
  if (!canActorSet(actor, target)) throw forbidden(`${actor} cannot set ${target}`);

  const skipped =
    target === 'cancelled' || target === 'rejected' ? [] : MAIN_STAGES.slice(idx(current) + 1, idx(target));
  return { skipped };
}

/** Progress for the bar: null when the move is off the main line. */
export function progress(current: Stage | null) {
  if (!current || current === 'rejected' || current === 'cancelled') return null;
  const index = idx(current);
  const total = MAIN_STAGES.length - 1;
  return { index, total, percent: Math.round((index / total) * 100) };
}

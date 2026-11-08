import type { Kysely } from 'kysely';
import type { AuthUser } from '../../auth/tokens.js';
import type { DB } from '../../db/types.js';
import { notFound } from '../../lib/errors.js';
import { AGENT_STAGES, MAIN_STAGES, type Stage } from '../tracking/stages.js';

/** Technician task buckets (the "Assigned / In progress / Completed" tabs). */
export const BUCKETS = {
  assigned: ['accepted', 'crew_assigned'] as Stage[],
  in_progress: MAIN_STAGES.slice(MAIN_STAGES.indexOf('on_the_way'), MAIN_STAGES.indexOf('completed')) as Stage[],
  completed: ['completed'] as Stage[],
};
export type Bucket = keyof typeof BUCKETS;

export function bucketOf(stage: Stage | null): Bucket | 'closed' {
  for (const [name, stages] of Object.entries(BUCKETS)) if (stage && stages.includes(stage)) return name as Bucket;
  return 'closed'; // rejected / cancelled
}

/** The stages the technician app shows as its status checklist, with friendly labels. */
export const TECH_STATUS_LABELS: Record<string, string> = {
  on_the_way: 'On the way',
  arrived_pickup: 'Arrived at pickup',
  loading: 'Loading items',
  loaded: 'Loaded',
  in_transit: 'In transit',
  arrived_destination: 'Arrived at delivery',
  unloading: 'Unloading',
  completed: 'Completed',
};
export const TECH_STAGES = AGENT_STAGES;

/** A move assigned to this technician (404 otherwise, so other moves are not even revealed). */
export async function loadTask(db: Kysely<DB>, id: string, user: AuthUser) {
  const move = await db.selectFrom('moves').selectAll().where('id', '=', id).executeTakeFirst();
  if (!move || move.assigned_agent_id !== user.id || move.status === 'draft') throw notFound('Task');
  return move;
}

export function navigationUrl(lat: number | null, lng: number | null, address: string | null) {
  const dest = lat != null && lng != null ? `${lat},${lng}` : address;
  return dest ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}` : null;
}

/** Minutes from the first "on_the_way" event to "completed", per move. */
export function jobMinutes(events: { move_id: string; stage: string; created_at: Date | string }[]) {
  const start = new Map<string, number>();
  const end = new Map<string, number>();
  for (const e of events) {
    const t = new Date(e.created_at).getTime();
    if (e.stage === 'on_the_way' && !start.has(e.move_id)) start.set(e.move_id, t);
    if (e.stage === 'completed') end.set(e.move_id, t);
  }
  const out = new Map<string, number>();
  for (const [id, s] of start) {
    const e = end.get(id);
    if (e != null && e >= s) out.set(id, Math.round((e - s) / 60000));
  }
  return out;
}

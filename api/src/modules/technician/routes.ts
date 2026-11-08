import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../auth/guards.js';
import type { Deps } from '../../deps.js';
import { conflict, isUniqueViolation } from '../../lib/errors.js';
import { loadJobSheet } from '../jobSheet/service.js';
import { IdParam } from '../moves/access.js';
import { nextStagesFor, progress, type Stage } from '../tracking/stages.js';
import { applyStageEvent, trackingView } from '../tracking/service.js';
import { readEventBody } from '../tracking/routes.js';
import {
  BUCKETS, type Bucket, bucketOf, jobMinutes, loadTask, navigationUrl, TECH_STAGES, TECH_STATUS_LABELS,
} from './service.js';

const Scope = z.enum(['assigned', 'in_progress', 'completed', 'all']).default('all');
const Rating = z.object({ stars: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() });

/** Technician (role `agent`) journey: tasks assigned by the company admin, worked from the app. */
export async function technicianRoutes(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tech = requireAuth(config.JWT_SECRET, 'agent');

  const taskList = (agentId: string) => db.selectFrom('moves')
    .innerJoin('users as cu', 'cu.id', 'moves.customer_id')
    .select(['moves.id', 'moves.move_no', 'moves.status', 'moves.current_stage', 'moves.pickup_address', 'moves.dropoff_address',
      'moves.date_from', 'moves.date_to', 'moves.preferred_time', 'moves.assigned_at', 'cu.name as customer_name'])
    .where('moves.assigned_agent_id', '=', agentId)
    .where('moves.status', '<>', 'draft');

  const listRow = <T extends { move_no: string; current_stage: string | null }>(r: T) => ({
    ...r,
    move_no: Number(r.move_no),
    bucket: bucketOf(r.current_stage as Stage | null),
    progress: progress(r.current_stage as Stage | null),
  });

  // Home: "Today's summary" counts and the next task
  app.get('/tech/summary', { preHandler: tech }, async (req) => {
    const user = currentUser(req);
    const me = await db.selectFrom('users').select(['name']).where('id', '=', user.id).executeTakeFirstOrThrow();
    const rows = (await taskList(user.id).execute()).map(listRow);
    const counts = { assigned: 0, in_progress: 0, completed: 0 };
    for (const r of rows) if (r.bucket in counts) counts[r.bucket as Bucket]++;
    const open = rows
      .filter((r) => r.bucket === 'in_progress' || r.bucket === 'assigned')
      .sort((a, b) => (a.bucket === b.bucket ? 0 : a.bucket === 'in_progress' ? -1 : 1)
        || String(a.date_from).localeCompare(String(b.date_from))
        || String(a.preferred_time ?? '').localeCompare(String(b.preferred_time ?? '')));
    return { name: me.name, counts, next_task: open[0] ?? null };
  });

  // "My tasks" with Assigned / In progress / Completed tabs
  app.get('/tech/tasks', { preHandler: tech }, async (req) => {
    const { scope } = z.object({ scope: Scope }).parse(req.query);
    let q = taskList(currentUser(req).id);
    if (scope !== 'all') q = q.where('moves.current_stage', 'in', BUCKETS[scope]);
    const rows = await q.orderBy('moves.date_from').orderBy('moves.preferred_time').orderBy('moves.move_no').execute();
    return rows.map(listRow);
  });

  // Task details: move info, addresses + navigation, services, schedule, job sheet, status checklist
  app.get('/tech/tasks/:id', { preHandler: tech }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const user = currentUser(req);
    const m = await loadTask(db, id, user);
    const [customer, sheet, tracking, myRating, events] = await Promise.all([
      db.selectFrom('users').select(['id', 'name']).where('id', '=', m.customer_id).executeTakeFirstOrThrow(),
      loadJobSheet(db, deps.catalog, id),
      trackingView(deps, id),
      db.selectFrom('move_ratings').select(['stars', 'comment', 'created_at'])
        .where('move_id', '=', id).where('rater_role', '=', 'agent').executeTakeFirst(),
      db.selectFrom('move_events').select(['move_id', 'stage', 'created_at']).where('move_id', '=', id).orderBy('created_at').execute(),
    ]);
    const current = m.current_stage as Stage | null;
    const next = nextStagesFor('agent', current).filter((s) => TECH_STAGES.includes(s));
    const currentIdx = current ? TECH_STAGES.indexOf(current) : -1;
    const done = new Set(tracking.events.map((e) => e.stage));

    const services = ['moving'];
    if (sheet.totals.dismantle_minutes > 0) services.push('disassembly', 'assembly');
    if (sheet.load_order.some((i) => i.fragile)) services.push('fragile_packing');

    return {
      id: m.id,
      move_no: Number(m.move_no),
      status: m.status,
      current_stage: current,
      bucket: bucketOf(current),
      progress: progress(current),
      customer,
      pickup: {
        address: m.pickup_address, lat: m.pickup_lat, lng: m.pickup_lng, floor: m.pickup_floor,
        has_elevator: m.pickup_has_elevator, navigation_url: navigationUrl(m.pickup_lat, m.pickup_lng, m.pickup_address),
      },
      dropoff: {
        address: m.dropoff_address, lat: m.dropoff_lat, lng: m.dropoff_lng, floor: m.dropoff_floor,
        has_elevator: m.dropoff_has_elevator, navigation_url: navigationUrl(m.dropoff_lat, m.dropoff_lng, m.dropoff_address),
      },
      schedule: { date_from: m.date_from, date_to: m.date_to, preferred_time: m.preferred_time },
      notes: m.notes,
      services,
      quote: sheet.quote,
      job_sheet: { totals: sheet.totals, load_order: sheet.load_order },
      // checklist for the "Update status" screen
      statuses: TECH_STAGES.map((s, i) => ({
        stage: s, label: TECH_STATUS_LABELS[s] ?? s, done: done.has(s) || (currentIdx >= 0 && i <= currentIdx),
      })),
      next_stages: next,
      recommended_next: next[0] ?? null,
      duration_minutes: jobMinutes(events).get(id) ?? null,
      client_rating: myRating ?? null,
      events: tracking.events,
    };
  });

  app.get('/tech/tasks/:id/job-sheet', { preHandler: tech }, async (req) => {
    const { id } = IdParam.parse(req.params);
    await loadTask(db, id, currentUser(req));
    return loadJobSheet(db, deps.catalog, id);
  });

  // "Update status": JSON {stage, idempotency_key} or multipart with an optional `photo`
  app.post('/tech/tasks/:id/status', { preHandler: tech }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const user = currentUser(req);
    await loadTask(db, id, user);
    const body = await readEventBody(req);
    if (!TECH_STAGES.includes(body.stage)) throw conflict('not_a_technician_stage', `A technician cannot set ${body.stage}`);
    const result = await applyStageEvent(deps, {
      moveId: id, stage: body.stage, actor: 'agent', actorId: user.id, idempotencyKey: body.idempotency_key, photo: body.photo,
    });
    return { result, tracking: await trackingView(deps, id) };
  });

  // "Rate the client and close the task"
  app.post('/tech/tasks/:id/rate-client', { preHandler: tech }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const user = currentUser(req);
    const m = await loadTask(db, id, user);
    if (m.current_stage !== 'completed') throw conflict('not_completed', 'Rate the client after the move is completed');
    const body = Rating.parse(req.body);
    try {
      const row = await db.insertInto('move_ratings').values({
        move_id: id, rater_id: user.id, rater_role: 'agent', ratee_id: m.customer_id, stars: body.stars, comment: body.comment || null,
      }).returning(['stars', 'comment', 'created_at']).executeTakeFirstOrThrow();
      reply.code(201);
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('already_rated', 'You already rated this client');
      throw e;
    }
  });

  // Profile: completed moves, rating from customers, performance
  app.get('/tech/profile', { preHandler: tech }, async (req) => {
    const user = currentUser(req);
    const me = await db.selectFrom('users').leftJoin('companies', 'companies.id', 'users.company_id')
      .select(['users.id', 'users.name', 'users.email', 'users.created_at', 'companies.name_en as company_name'])
      .where('users.id', '=', user.id).executeTakeFirstOrThrow();
    const tasks = await taskList(user.id).execute();
    const completedIds = tasks.filter((t) => t.current_stage === 'completed').map((t) => t.id);

    const [rating, reviews, events] = await Promise.all([
      db.selectFrom('move_ratings')
        .select([sql<string | null>`round(avg(stars)::numeric, 1)`.as('average'), sql<string>`count(*)`.as('count')])
        .where('ratee_id', '=', user.id).where('rater_role', '=', 'customer').executeTakeFirstOrThrow(),
      db.selectFrom('move_ratings').innerJoin('moves', 'moves.id', 'move_ratings.move_id')
        .select(['moves.move_no', 'move_ratings.stars', 'move_ratings.comment', 'move_ratings.created_at'])
        .where('ratee_id', '=', user.id).where('rater_role', '=', 'customer')
        .orderBy('move_ratings.created_at', 'desc').limit(5).execute(),
      completedIds.length
        ? db.selectFrom('move_events').select(['move_id', 'stage', 'created_at']).where('move_id', 'in', completedIds).orderBy('created_at').execute()
        : Promise.resolve([]),
    ]);

    const minutes = [...jobMinutes(events).values()];
    const monthAgo = Date.now() - 30 * 86400_000;
    const completedAt = events.filter((e) => e.stage === 'completed').map((e) => new Date(e.created_at).getTime());
    return {
      ...me,
      role: 'technician',
      completed_moves: completedIds.length,
      rating: { average: rating.average == null ? null : Number(rating.average), count: Number(rating.count) },
      performance: {
        assigned: tasks.filter((t) => bucketOf(t.current_stage as Stage) === 'assigned').length,
        in_progress: tasks.filter((t) => bucketOf(t.current_stage as Stage) === 'in_progress').length,
        completed_last_30_days: completedAt.filter((t) => t >= monthAgo).length,
        avg_job_minutes: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null,
      },
      recent_reviews: reviews.map((r) => ({ ...r, move_no: Number(r.move_no) })),
    };
  });
}

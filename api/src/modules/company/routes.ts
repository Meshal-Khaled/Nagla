import { hash } from '@node-rs/argon2';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../auth/guards.js';
import type { Deps } from '../../deps.js';
import { badRequest, conflict, isUniqueViolation } from '../../lib/errors.js';
import { IdParam, loadMove } from '../moves/access.js';
import { issueAgentToken } from '../moves/confirm.js';
import { applyStageEvent, trackingView } from '../tracking/service.js';
import { END_STAGES, MAIN_STAGES, progress, type Stage } from '../tracking/stages.js';

const Scope = z.enum(['incoming', 'active', 'closed', 'all']).default('all');

export async function companyRoutes(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const companyUser = requireAuth(config.JWT_SECRET, 'company_admin', 'agent');
  const admin = requireAuth(config.JWT_SECRET, 'company_admin');

  // incoming = waiting for accept/reject; active = accepted, not finished; closed = completed/rejected/cancelled
  app.get('/company/moves', { preHandler: companyUser }, async (req) => {
    const { scope } = z.object({ scope: Scope }).parse(req.query);
    let q = db.selectFrom('moves')
      .innerJoin('users as cu', 'cu.id', 'moves.customer_id')
      .leftJoin('quotes', (j) => j.onRef('quotes.move_id', '=', 'moves.id').on('quotes.is_locked', '=', true))
      .leftJoin('truck_sizes as t', 't.id', 'quotes.truck_size_id')
      .leftJoin('users as ag', 'ag.id', 'moves.assigned_agent_id')
      .select(['moves.id', 'moves.move_no', 'moves.assigned_agent_id', 'ag.name as assigned_agent_name', 'moves.status', 'moves.current_stage', 'moves.date_from', 'moves.date_to', 'moves.preferred_time',
        'moves.pickup_address', 'moves.dropoff_address', 'moves.confirmed_at', 'cu.name as customer_name',
        'quotes.price_halalas', 'quotes.trips', 'quotes.crew_size', 'quotes.volume_m3', 't.name as truck_name'])
      .where('moves.company_id', '=', currentUser(req).company_id)
      .where('moves.status', '<>', 'draft')
      .orderBy('moves.date_from').orderBy('moves.confirmed_at');
    if (scope === 'incoming') q = q.where('moves.current_stage', '=', 'confirmed');
    if (scope === 'active') q = q.where('moves.current_stage', 'not in', ['confirmed', ...END_STAGES]);
    if (scope === 'closed') q = q.where('moves.current_stage', 'in', END_STAGES);
    const rows = await q.execute();
    return rows.map((r) => ({ ...r, move_no: Number(r.move_no), progress: progress(r.current_stage as Stage | null) }));
  });

  // New agent link for a move (the old one stops working). Shown only in this response.
  app.post('/company/moves/:id/agent-link', { preHandler: admin }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const move = await loadMove(db, id, currentUser(req));
    if (END_STAGES.includes(move.current_stage as Stage)) throw conflict('move_closed', 'The move is already over');
    return { agent_link: await issueAgentToken(deps, id, move.date_to ?? move.date_from!) };
  });

  // Assign (or re-assign) a technician. After "accepted" this also sets the crew_assigned stage.
  app.post('/company/moves/:id/assign', { preHandler: admin }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const user = currentUser(req);
    const { agent_id } = z.object({ agent_id: z.uuid() }).parse(req.body);
    const move = await loadMove(db, id, user);
    const stage = move.current_stage as Stage | null;
    if (stage === 'confirmed') throw conflict('not_accepted', 'Accept the move before assigning a technician');
    if (!stage || END_STAGES.includes(stage) || MAIN_STAGES.indexOf(stage as never) >= MAIN_STAGES.indexOf('on_the_way')) {
      throw conflict('too_late_to_assign', 'The technician can only change before the crew is on the way');
    }
    const agent = await db.selectFrom('users').select(['id', 'name'])
      .where('id', '=', agent_id).where('role', '=', 'agent').where('company_id', '=', user.company_id).executeTakeFirst();
    if (!agent) throw badRequest('unknown_agent', 'No technician with that id in your company');

    await db.updateTable('moves').set({ assigned_agent_id: agent.id, assigned_at: new Date(), updated_at: new Date() })
      .where('id', '=', id).execute();
    if (stage === 'accepted') {
      await applyStageEvent(deps, {
        moveId: id, stage: 'crew_assigned', actor: 'company_admin', actorId: user.id, idempotencyKey: `crew_assigned:${id}`,
      });
    }
    return { assigned_agent: agent, tracking: await trackingView(deps, id) };
  });

  app.get('/company/agents', { preHandler: admin }, async (req) => {
    return db.selectFrom('users').select(['id', 'name', 'email', 'created_at'])
      .where('company_id', '=', currentUser(req).company_id).where('role', '=', 'agent').orderBy('name').execute();
  });

  app.post('/company/agents', { preHandler: admin }, async (req, reply) => {
    const body = z.object({
      name: z.string().trim().min(1).max(100),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(8).max(200),
    }).parse(req.body);
    try {
      const agent = await db.insertInto('users').values({
        role: 'agent', company_id: currentUser(req).company_id, name: body.name, email: body.email,
        password_hash: await hash(body.password),
      }).returning(['id', 'name', 'email', 'role']).executeTakeFirstOrThrow();
      reply.code(201);
      return agent;
    } catch (e) {
      if (isUniqueViolation(e, 'users_email_key')) throw conflict('email_taken', 'Email already registered');
      throw e;
    }
  });
}

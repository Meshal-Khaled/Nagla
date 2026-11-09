import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { bearer, currentUser, requireAuth } from '../../auth/guards.js';
import { verifyAccess } from '../../auth/tokens.js';
import type { Deps } from '../../deps.js';
import { forbidden, unauthorized } from '../../lib/errors.js';
import { loadJobSheet } from '../jobSheet/service.js';
import { IdParam, loadMove } from '../moves/access.js';
import { type Actor, ALL_STAGES, type Stage } from './stages.js';
import { applyStageEvent, findMoveByAgentToken, trackingView } from './service.js';

const EventBody = z.object({
  stage: z.enum(ALL_STAGES as [Stage, ...Stage[]]),
  idempotency_key: z.string().min(8).max(100),
});

/** Who is posting: agent token link (X-Agent-Token) or a signed-in user. */
async function resolveActor(deps: Deps, req: FastifyRequest, moveId: string): Promise<{ actor: Actor; actorId: string | null }> {
  const agentToken = req.headers['x-agent-token'];
  if (typeof agentToken === 'string' && agentToken) {
    const move = await findMoveByAgentToken(deps.db, agentToken);
    if (!move || move.id !== moveId) throw unauthorized('Invalid or expired agent link');
    return { actor: 'agent', actorId: null };
  }
  const token = bearer(req);
  if (!token) throw unauthorized();
  const user = await verifyAccess(deps.config.JWT_SECRET, token);
  const move = await loadMove(deps.db, moveId, user); // 404 unless the user may see this move
  // a signed-in technician may only work the moves assigned to them
  if (user.role === 'agent' && move.assigned_agent_id !== user.id) throw forbidden('This move is not assigned to you');
  return { actor: user.role, actorId: user.id };
}

/** JSON body, or multipart with fields + optional `photo` file (agent "Loaded" + photo). */
export const CANCEL_REASONS = ['changed_plans', 'other', 'found_another_company', 'price_too_high', 'wrong_date', 'booked_by_mistake'] as const;
const CancelBody = z.object({
  idempotency_key: z.string().min(8).max(100).optional(),
  reason: z.enum(CANCEL_REASONS).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function readEventBody(req: FastifyRequest) {
  if (!req.isMultipart()) return { ...EventBody.parse(req.body), photo: undefined };
  const fields: Record<string, string> = {};
  let photo: Buffer | undefined;
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      if (part.fieldname === 'photo' && part.mimetype.startsWith('image/')) photo = await part.toBuffer();
      else await part.toBuffer();
    } else fields[part.fieldname] = String(part.value);
  }
  return { ...EventBody.parse(fields), photo: photo?.length ? photo : undefined };
}

export async function trackingRoutes(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;

  app.post('/moves/:id/events', async (req) => {
    const { id } = IdParam.parse(req.params);
    const { actor, actorId } = await resolveActor(deps, req, id);
    const body = await readEventBody(req);
    const result = await applyStageEvent(deps, {
      moveId: id, stage: body.stage, actor, actorId, idempotencyKey: body.idempotency_key, photo: body.photo,
    });
    return { result, tracking: await trackingView(deps, id) };
  });

  app.post('/moves/:id/cancel', { preHandler: requireAuth(config.JWT_SECRET, 'customer', 'company_admin') }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const user = currentUser(req);
    await loadMove(db, id, user);
    const body = CancelBody.parse(req.body ?? {});
    const result = await applyStageEvent(deps, {
      moveId: id, stage: 'cancelled', actor: user.role as Actor, actorId: user.id, idempotencyKey: body.idempotency_key ?? `cancel:${id}`,
      cancel: { reason: body.reason, note: body.note },
    });
    return { result, tracking: await trackingView(deps, id) };
  });

  app.get('/moves/:id/tracking', { preHandler: requireAuth(config.JWT_SECRET) }, async (req) => {
    const { id } = IdParam.parse(req.params);
    await loadMove(db, id, currentUser(req));
    return trackingView(deps, id);
  });

  app.get('/moves/:id/job-sheet', { preHandler: requireAuth(config.JWT_SECRET) }, async (req) => {
    const { id } = IdParam.parse(req.params);
    await loadMove(db, id, currentUser(req));
    return loadJobSheet(db, deps.catalog, id);
  });

  // read-only tracking for the agent page
  app.get('/agent/:token/tracking', async (req) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.params);
    const move = await findMoveByAgentToken(db, token);
    if (!move) throw forbidden('Invalid or expired agent link');
    return trackingView(deps, move.id);
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../auth/guards.js';
import type { AuthUser } from '../../auth/tokens.js';
import type { Deps } from '../../deps.js';
import { conflict, isUniqueViolation, notFound } from '../../lib/errors.js';
import { IdParam, loadMove } from '../moves/access.js';

const Message = z.object({ body: z.string().trim().min(1).max(2000) });
const Rating = z.object({ stars: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() });

/**
 * Who may chat on a move: its customer, the company admin, and the assigned technician.
 * Drafts have no chat (no company yet).
 */
async function loadChatMove(deps: Deps, id: string, user: AuthUser) {
  const move = await loadMove(deps.db, id, user);
  if (move.status === 'draft') throw conflict('not_confirmed', 'Chat opens after confirmation');
  if (user.role === 'agent' && move.assigned_agent_id !== user.id) throw notFound('Move');
  return move;
}

/** Customer ↔ technician (and company) chat, plus the customer's rating of the technician. */
export async function collabRoutes(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const signedIn = requireAuth(config.JWT_SECRET);

  app.get('/moves/:id/messages', { preHandler: signedIn }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const { after } = z.object({ after: z.iso.datetime({ offset: true }).optional() }).parse(req.query);
    await loadChatMove(deps, id, currentUser(req));
    let q = db.selectFrom('move_messages').innerJoin('users', 'users.id', 'move_messages.sender_id')
      .select(['move_messages.id', 'move_messages.sender_id', 'move_messages.sender_role', 'users.name as sender_name',
        'move_messages.body', 'move_messages.created_at'])
      .where('move_messages.move_id', '=', id);
    if (after) q = q.where('move_messages.created_at', '>', new Date(after));
    return q.orderBy('move_messages.created_at').orderBy('move_messages.id').limit(200).execute();
  });

  app.post('/moves/:id/messages', { preHandler: signedIn }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const user = currentUser(req);
    await loadChatMove(deps, id, user);
    const { body } = Message.parse(req.body);
    const row = await db.insertInto('move_messages')
      .values({ move_id: id, sender_id: user.id, sender_role: user.role, body })
      .returning(['id', 'sender_id', 'sender_role', 'body', 'created_at']).executeTakeFirstOrThrow();
    reply.code(201);
    return row;
  });

  // "Rate and review the service": the customer rates the technician once the move is completed
  app.post('/moves/:id/rating', { preHandler: requireAuth(config.JWT_SECRET, 'customer') }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const user = currentUser(req);
    const move = await loadMove(db, id, user);
    if (move.current_stage !== 'completed') throw conflict('not_completed', 'Rate the service after the move is completed');
    if (!move.assigned_agent_id) throw conflict('no_technician', 'No technician was assigned to this move');
    const body = Rating.parse(req.body);
    try {
      const row = await db.insertInto('move_ratings').values({
        move_id: id, rater_id: user.id, rater_role: 'customer', ratee_id: move.assigned_agent_id,
        stars: body.stars, comment: body.comment || null,
      }).returning(['stars', 'comment', 'created_at']).executeTakeFirstOrThrow();
      reply.code(201);
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('already_rated', 'You already rated this move');
      throw e;
    }
  });

  // both sides' ratings, visible to the move's participants
  app.get('/moves/:id/ratings', { preHandler: signedIn }, async (req) => {
    const { id } = IdParam.parse(req.params);
    await loadChatMove(deps, id, currentUser(req));
    return db.selectFrom('move_ratings').select(['rater_role', 'stars', 'comment', 'created_at'])
      .where('move_id', '=', id).orderBy('created_at').execute();
  });
}

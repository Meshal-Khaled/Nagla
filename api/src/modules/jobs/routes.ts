import type { FastifyInstance } from 'fastify';
import { currentUser, requireAuth } from '../../auth/guards.js';
import type { Deps } from '../../deps.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { assertDraft, IdParam, loadMove } from '../moves/access.js';

export async function jobRoutes(app: FastifyInstance, { db, config }: Deps) {
  const auth = requireAuth(config.JWT_SECRET, 'customer');

  app.post('/moves/:id/plan', { preHandler: auth }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const job = await db.transaction().execute(async (trx) => {
      const move = await loadMove(trx, id, currentUser(req), { ownerOnly: true, lock: true });
      assertDraft(move);
      const photo = await trx.selectFrom('photos').select('id').where('move_id', '=', id).executeTakeFirst();
      if (!photo) throw badRequest('no_photos', 'Upload room photos first');
      // one active detection job per move
      const active = await trx.selectFrom('jobs').select(['id', 'status'])
        .where('move_id', '=', id).where('status', 'in', ['queued', 'running']).executeTakeFirst();
      return active ?? trx.insertInto('jobs').values({ move_id: id, type: 'detection' })
        .returning(['id', 'status']).executeTakeFirstOrThrow();
    });
    reply.code(202);
    return { job_id: job.id, status: job.status };
  });

  app.get('/jobs/:id', { preHandler: auth }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const job = await db.selectFrom('jobs').selectAll().where('id', '=', id).executeTakeFirst();
    if (!job) throw notFound('Job');
    await loadMove(db, job.move_id, currentUser(req), { ownerOnly: true });
    return job;
  });
}

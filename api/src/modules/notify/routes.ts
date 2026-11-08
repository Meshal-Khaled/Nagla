import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../auth/guards.js';
import type { Deps } from '../../deps.js';

export async function deviceRoutes(app: FastifyInstance, { db, config }: Deps) {
  const auth = requireAuth(config.JWT_SECRET);

  // register / move an FCM token to the signed-in user
  app.post('/devices', { preHandler: auth }, async (req, reply) => {
    const body = z.object({ token: z.string().min(10).max(4096), platform: z.enum(['android', 'ios', 'web']) }).parse(req.body);
    await db.insertInto('device_tokens').values({ user_id: currentUser(req).id, ...body })
      .onConflict((oc) => oc.column('token').doUpdateSet({ user_id: currentUser(req).id, platform: body.platform }))
      .execute();
    reply.code(204);
  });

  app.delete('/devices', { preHandler: auth }, async (req, reply) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    await db.deleteFrom('device_tokens').where('token', '=', token).where('user_id', '=', currentUser(req).id).execute();
    reply.code(204);
  });
}

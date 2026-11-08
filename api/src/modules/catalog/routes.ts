import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../auth/guards.js';
import type { Deps } from '../../deps.js';

export async function catalogRoutes(app: FastifyInstance, { catalog, config }: Deps) {
  app.get('/catalog', { preHandler: requireAuth(config.JWT_SECRET) }, async (req) => {
    const { q } = z.object({ q: z.string().trim().max(100).optional() }).parse(req.query);
    return catalog.list(q).map(({ retired: _r, ...row }) => row);
  });
}

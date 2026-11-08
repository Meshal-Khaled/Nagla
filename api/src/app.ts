import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { authRoutes } from './auth/routes.js';
import type { Deps } from './deps.js';
import { HttpError } from './lib/errors.js';
import { catalogRoutes } from './modules/catalog/routes.js';
import { companyRoutes } from './modules/company/routes.js';
import { itemRoutes } from './modules/items/routes.js';
import { jobRoutes } from './modules/jobs/routes.js';
import { moveRoutes } from './modules/moves/routes.js';
import { deviceRoutes } from './modules/notify/routes.js';
import { photoRoutes } from './modules/photos/routes.js';
import { quoteRoutes } from './modules/quotes/routes.js';
import { agentPageRoutes } from './modules/tracking/agentPage.js';
import { trackingRoutes } from './modules/tracking/routes.js';
import { collabRoutes } from './modules/technician/collab.js';
import { technicianRoutes } from './modules/technician/routes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const devUiDir = path.join(root, 'devui');
// the phone app UI (also loaded by the Android shell)
const appDir = path.join(root, 'app');

export async function buildApp(deps: Deps) {
  const app = Fastify({
    logger: deps.config.NODE_ENV === 'test' ? false : { level: 'info' },
    bodyLimit: 1024 * 1024,
  });

  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 20 } });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.code, message: (err as Error).message });
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'validation', message: 'Invalid request', issues: err.issues });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.code(status).send({ error: (err as { code?: string }).code ?? 'bad_request', message: (err as Error).message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'internal', message: 'Something went wrong' });
  });

  app.get('/health', async () => ({ ok: true }));

  for (const routes of [
    authRoutes, moveRoutes, photoRoutes, jobRoutes, itemRoutes, catalogRoutes, quoteRoutes,
    trackingRoutes, agentPageRoutes, companyRoutes, deviceRoutes, technicianRoutes, collabRoutes,
  ]) {
    await routes(app, deps);
  }

  await app.register(fastifyStatic, { root: appDir, prefix: '/app/' });
  app.get('/', (_req, reply) => reply.redirect('/app/'));

  // Temporary test UI, never served in production.
  if (deps.config.NODE_ENV !== 'production') {
    await app.register(fastifyStatic, { root: devUiDir, prefix: '/dev/', decorateReply: false });
  }

  return app;
}

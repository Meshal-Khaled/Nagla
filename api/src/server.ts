import { buildApp } from './app.js';
import { createDeps } from './bootstrap.js';

const deps = await createDeps();
const app = await buildApp(deps);
await app.listen({ port: deps.config.PORT, host: '0.0.0.0' });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, async () => {
    await app.close();
    await deps.db.destroy();
    process.exit(0);
  });
}

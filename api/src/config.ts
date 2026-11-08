import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().url(),
  TEST_DATABASE_URL: z.string().url().optional(),
  // furniture catalog: its own database, hardcoded reference data seeded from catalog.json
  CATALOG_DATABASE_URL: z.string().url(),
  TEST_CATALOG_DATABASE_URL: z.string().url().optional(),
  SEED_PASSWORD: z.string().min(8).default('nagla-dev-pass'),

  JWT_SECRET: z.string().min(32).default('dev-only-jwt-secret-change-me-0000000000'),
  FILE_SIGNING_SECRET: z.string().min(32).default('dev-only-file-secret-change-me-000000000'),
  STORAGE_DIR: z.string().default(path.resolve(process.cwd(), '..', 'storage')),
  AI_URL: z.string().url().default('http://localhost:8000'),

  // Web OAuth client ID: audience of Google ID tokens (native app) and the client of the web redirect flow
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // where /auth/google/callback is reachable (must match the Google console)
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  // where the web dev UI lands after Google sign-in, with ?code= to exchange
  APP_REDIRECT_URL: z.string().default('http://localhost:3000/dev/index.html'),

  // path to a Firebase service account JSON; push is logged only when unset
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
  WORKER_POLL_MS: z.coerce.number().int().default(1000),
  CLEANUP_INTERVAL_MS: z.coerce.number().int().default(15 * 60 * 1000),
});

export type Config = z.infer<typeof Env>;

export const config: Config = Env.parse(process.env);

if (config.NODE_ENV === 'production' && config.JWT_SECRET.startsWith('dev-only')) {
  throw new Error('Set JWT_SECRET and FILE_SIGNING_SECRET in production');
}

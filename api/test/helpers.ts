import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { sql, type Kysely } from 'kysely';
import sharp from 'sharp';
import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';
import type { CatalogDB } from '../src/db/catalog/index.js';
import { seedCatalog } from '../src/db/catalog/seed.js';
import type { DB } from '../src/db/types.js';
import { CUSTOMER_EMAIL, seed } from '../src/db/seed/index.js';
import type { Deps } from '../src/deps.js';
import { Storage } from '../src/lib/storage.js';
import { CatalogStore } from '../src/modules/catalog/store.js';
import type { AiClient } from '../src/modules/jobs/aiClient.js';
import type { DetectRoomRequest, DetectRoomResponse } from '../src/modules/jobs/contract.js';
import type { Notifier } from '../src/modules/notify/notifier.js';
import { createTestCatalogDb, createTestDb } from './db.js';

export const SAQR_ADMIN = 'admin@saqr.test';
export const FAST_ADMIN = 'admin@fastmove.test';
export { CUSTOMER_EMAIL };

/** Empty every table in both databases and re-seed. */
export async function resetData(db: Kysely<DB>, catalogDb?: Kysely<CatalogDB>) {
  await sql`
    TRUNCATE device_tokens, auth_codes, refresh_tokens, move_events, jobs, quotes, detections, move_items,
      photos, moves, company_trucks, truck_sizes, users, companies, settings CASCADE
  `.execute(db);
  await seed(db);
  if (catalogDb) {
    await sql`TRUNCATE furniture_catalog`.execute(catalogDb);
    await seedCatalog(catalogDb);
  }
}

/** Deterministic in-process AI: items per room from a table, like the FastAPI fake. */
export class StubAi implements AiClient {
  calls: DetectRoomRequest[] = [];
  constructor(public handler: (req: DetectRoomRequest) => DetectRoomResponse | Promise<DetectRoomResponse> = defaultDetect) {}
  async detectRoom(req: DetectRoomRequest) {
    this.calls.push(req);
    return this.handler(req);
  }
}

export function defaultDetect(req: DetectRoomRequest): DetectRoomResponse {
  const ids = req.photos.map((p) => p.id);
  const table: Record<string, [string, 'small' | 'medium' | 'large'][]> = {
    bedroom: [['bed_frame', 'large'], ['wardrobe', 'medium'], ['bedside_table', 'small'], ['bedside_table', 'small']],
    living: [['couch', 'medium'], ['television', 'large'], ['coffee_table', 'medium']],
  };
  const key = Object.keys(table).find((k) => req.room.includes(k));
  const items = (key ? table[key] : [['moving_box', 'medium']]) as [string, 'small' | 'medium' | 'large'][];
  return {
    room: req.room,
    items: items.map(([category, size_class], n) => ({
      category,
      size_class,
      confidence: 0.9,
      sightings: [{ photo_id: ids[n % ids.length], box: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 } }],
    })),
  };
}

export class RecordingNotifier implements Notifier {
  stages: [string, string][] = [];
  confirmed: string[] = [];
  stageChanged(moveId: string, stage: string) {
    this.stages.push([moveId, stage]);
  }
  moveConfirmed(moveId: string) {
    this.confirmed.push(moveId);
  }
}

export interface TestCtx {
  app: FastifyInstance;
  deps: Deps & { ai: StubAi; notifier: RecordingNotifier };
  db: Kysely<DB>;
  catalogDb: Kysely<CatalogDB>;
  close(): Promise<void>;
}

export async function setup(overrides: Partial<Deps['config']> = {}): Promise<TestCtx> {
  const db = createTestDb();
  const catalogDb = createTestCatalogDb();
  await resetData(db, catalogDb);
  const testConfig = {
    ...config,
    NODE_ENV: 'test' as const,
    STORAGE_DIR: mkdtempSync(path.join(os.tmpdir(), 'nagla-test-')),
    // Google is off in tests unless a test turns it on (api/.env may have real values)
    GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, GOOGLE_REDIRECT_URI: undefined,
    ...overrides,
  };
  const deps = {
    db,
    catalog: await new CatalogStore(catalogDb).reload(),
    config: testConfig,
    storage: new Storage(testConfig.STORAGE_DIR, testConfig.FILE_SIGNING_SECRET),
    ai: new StubAi(),
    notifier: new RecordingNotifier(),
  };
  const app = await buildApp(deps);
  return {
    app, deps, db, catalogDb,
    close: async () => { await app.close(); await db.destroy(); await catalogDb.destroy(); },
  };
}

export async function login(app: FastifyInstance, email: string, password = config.SEED_PASSWORD) {
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login ${email} failed: ${res.body}`);
  return res.json().access_token as string;
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** A small JPEG; with `gps` it carries EXIF GPS tags like a phone photo. */
export async function jpeg(opts: { gps?: boolean; color?: string } = {}) {
  let img = sharp({ create: { width: 64, height: 48, channels: 3, background: opts.color ?? '#88aacc' } }).jpeg();
  if (opts.gps) {
    img = img.withExif({
      IFD0: { Make: 'TestPhone', Model: 'X1' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '24/1 42/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '46/1 40/1 0/1' },
    });
  }
  return img.toBuffer();
}

/** Build a multipart body by hand (app.inject has no FormData support). */
export function multipart(fields: Record<string, string>, files: { name: string; data: Buffer; filename?: string; type?: string }[]) {
  const boundary = `----nagla${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  for (const f of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"; filename="${f.filename ?? 'photo.jpg'}"\r\n` +
      `Content-Type: ${f.type ?? 'image/jpeg'}\r\n\r\n`,
    ));
    chunks.push(f.data, Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

export async function createMove(app: FastifyInstance, token: string) {
  const res = await app.inject({ method: 'POST', url: '/moves', headers: bearer(token) });
  return res.json().id as string;
}

export async function uploadPhotos(app: FastifyInstance, token: string, moveId: string, room: string, count = 1) {
  const files = await Promise.all(Array.from({ length: count }, async (_, i) => ({ name: 'file', data: await jpeg({ color: i ? '#ccaa88' : '#88aacc' }) })));
  const mp = multipart({ room }, files);
  const res = await app.inject({ method: 'POST', url: `/moves/${moveId}/photos`, headers: { ...bearer(token), ...mp.headers }, payload: mp.payload });
  if (res.statusCode !== 201) throw new Error(`upload failed: ${res.body}`);
  return res.json().photos as { id: string; url: string }[];
}

export const DETAILS = {
  pickup_address: 'Al Olaya, Riyadh', pickup_floor: 3, pickup_has_elevator: false,
  dropoff_address: 'Al Malqa, Riyadh', dropoff_floor: 1, dropoff_has_elevator: true,
  date_from: '2026-12-01', date_to: '2026-12-02', preferred_time: '09:00', notes: 'Gate code 1234',
};

/** customer → move → photos → detection (stub AI) → details. Returns ids and the token. */
export async function draftWithItems(ctx: TestCtx) {
  const { processNextJob } = await import('../src/modules/jobs/queue.js');
  const token = await login(ctx.app, CUSTOMER_EMAIL);
  const moveId = await createMove(ctx.app, token);
  await uploadPhotos(ctx.app, token, moveId, 'bedroom_1', 2);
  await uploadPhotos(ctx.app, token, moveId, 'living_room', 1);
  await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/plan`, headers: bearer(token) });
  await processNextJob(ctx.deps);
  await ctx.app.inject({ method: 'PATCH', url: `/moves/${moveId}`, headers: bearer(token), payload: DETAILS });
  return { token, moveId };
}

export async function companyId(db: Kysely<DB>, name: string) {
  return (await db.selectFrom('companies').select('id').where('name_en', '=', name).executeTakeFirstOrThrow()).id;
}

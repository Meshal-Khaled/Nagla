import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { CATEGORY_LIST } from '../src/db/catalog/rows.js';
import { seedCatalog } from '../src/db/catalog/seed.js';
import { COMPANIES, seed, TRUCK_SIZES } from '../src/db/seed/index.js';
import { createTestCatalogDb, createTestDb, testDbUrl } from './db.js';
import { resetData } from './helpers.js';

const db = createTestDb();
const catalogDb = createTestCatalogDb();

beforeAll(async () => {
  await resetData(db, catalogDb);
});

afterAll(async () => {
  await db.destroy();
  await catalogDb.destroy();
});

async function newMove() {
  const customer = await db.selectFrom('users').select('id').where('role', '=', 'customer').executeTakeFirstOrThrow();
  return db.insertInto('moves').values({ customer_id: customer.id }).returning('id').executeTakeFirstOrThrow();
}

describe('migrations', () => {
  it.each(['main', 'catalog'] as const)('%s: run on an empty database, roll all the way down and back up', async (target) => {
    // a throwaway database so the seeded test databases stay intact
    const name = `nagla_migrate_check_${target}`;
    await sql`DROP DATABASE IF EXISTS ${sql.id(name)}`.execute(db);
    await sql`CREATE DATABASE ${sql.id(name)}`.execute(db);
    const url = new URL(testDbUrl());
    url.pathname = `/${name}`;
    const scratch = createDb(url.toString());
    try {
      await runMigrations(scratch, 'latest', target);
      await runMigrations(scratch, 'reset', target);
      await runMigrations(scratch, 'latest', target);
    } finally {
      await scratch.destroy();
      await sql`DROP DATABASE IF EXISTS ${sql.id(name)}`.execute(db);
    }
  });
});

describe('catalog database', () => {
  it('is separate: the main database has no catalog table', async () => {
    const res = await sql<{ n: number }>`SELECT count(*)::int AS n FROM pg_tables WHERE tablename = 'furniture_catalog'`.execute(db);
    expect(res.rows[0].n).toBe(0);
  });

  it('has volume_m3 computed by the database', async () => {
    const row = await catalogDb.insertInto('furniture_catalog')
      .values({
        category: 'test_item', variant: 'v1', name_en: 'Test', name_ar: 'اختبار', size_class: 'medium',
        w_cm: 200, d_cm: 50, h_cm: 100, weight_kg: 10,
      })
      .returning(['volume_m3'])
      .executeTakeFirstOrThrow();
    expect(row.volume_m3).toBe(1);

    const updated = await catalogDb.updateTable('furniture_catalog').set({ h_cm: 50 })
      .where('category', '=', 'test_item').returning('volume_m3').executeTakeFirstOrThrow();
    expect(updated.volume_m3).toBe(0.5);
  });

  it('rejects writing volume_m3 directly', async () => {
    await expect(
      sql`INSERT INTO furniture_catalog (category, variant, name_en, name_ar, size_class, w_cm, d_cm, h_cm, weight_kg, volume_m3)
          VALUES ('x', 'v', 'x', 'x', 'small', 1, 1, 1, 1, 99)`.execute(catalogDb),
    ).rejects.toThrow(/non-DEFAULT value into column "volume_m3"/);
  });

  it('loads all 300 rows of catalog.json plus the 3 `other` rows', async () => {
    const rows = await catalogDb.selectFrom('furniture_catalog').select(['category', 'variant', 'volume_m3'])
      .where('retired_at', 'is', null).where('category', '<>', 'test_item').execute();
    expect(rows).toHaveLength(303);
    expect(CATEGORY_LIST).toHaveLength(101);
    const couch = rows.find((r) => r.category === 'couch' && r.variant === '2_seater')!;
    expect(couch.volume_m3).toBeCloseTo(1.04544, 6); // 180 × 88 × 66 cm, computed by the DB
  });

  it('retires rows dropped from catalog.json instead of deleting them', async () => {
    const extra = await catalogDb.insertInto('furniture_catalog').values({
      category: 'piano', variant: 'upright', name_en: 'Piano', name_ar: 'بيانو', size_class: 'large',
      w_cm: 150, d_cm: 60, h_cm: 120, weight_kg: 200, is_default: true,
    }).returning('id').executeTakeFirstOrThrow();
    await seedCatalog(catalogDb);
    const row = await catalogDb.selectFrom('furniture_catalog').select(['retired_at', 'is_default'])
      .where('id', '=', extra.id).executeTakeFirstOrThrow();
    expect(row.retired_at).not.toBeNull();
    expect(row.is_default).toBe(false);
  });

  it('has one default row per category and size class, including other', async () => {
    const rows = await catalogDb.selectFrom('furniture_catalog').select(['category', 'size_class'])
      .where('is_default', '=', true).where('category', '<>', 'test_item').execute();
    expect(rows).toHaveLength(CATEGORY_LIST.length * 3);
    expect(CATEGORY_LIST).toContain('other');

    await expect(
      catalogDb.insertInto('furniture_catalog').values({
        category: 'couch', variant: 'another', name_en: 'x', name_ar: 'x', size_class: 'small',
        w_cm: 1, d_cm: 1, h_cm: 1, weight_kg: 1, is_default: true,
      }).execute(),
    ).rejects.toThrow(/furniture_catalog_default_key/);
  });
});

describe('seed', () => {
  it('is idempotent', async () => {
    await seed(db);
    const count = async (t: 'truck_sizes' | 'companies' | 'users' | 'company_trucks' | 'settings') =>
      Number((await db.selectFrom(t).select((eb) => eb.fn.countAll().as('n')).executeTakeFirstOrThrow()).n);

    expect(await count('truck_sizes')).toBe(TRUCK_SIZES.length);
    expect(await count('companies')).toBe(COMPANIES.length);
    expect(await count('users')).toBe(COMPANIES.length * 2 + 1); // admin + technician per company, one customer
    expect(await count('company_trucks')).toBe(5);
    expect(await count('settings')).toBe(5);
  });

  it('gives one company no large truck, so big moves need trips', async () => {
    const rows = await db.selectFrom('company_trucks')
      .innerJoin('companies', 'companies.id', 'company_trucks.company_id')
      .innerJoin('truck_sizes', 'truck_sizes.id', 'company_trucks.truck_size_id')
      .select(['companies.name_en', 'truck_sizes.name'])
      .where('truck_sizes.name', '=', 'large')
      .execute();
    expect(rows.map((r) => r.name_en)).toEqual(['Al-Saqr Movers']);
  });

  it('stores settings as JSON values', async () => {
    const s = await db.selectFrom('settings').select('value').where('key', '=', 'packing_factor').executeTakeFirstOrThrow();
    expect(s.value).toBe(1.25);
  });
});

describe('constraints', () => {
  it('generates item labels and keeps (move, category, seq) unique', async () => {
    const move = await newMove();
    const couch = await catalogDb.selectFrom('furniture_catalog').select('id')
      .where('category', '=', 'couch').where('size_class', '=', 'medium').executeTakeFirstOrThrow();
    const item = { move_id: move.id, catalog_id: couch.id, category: 'couch', source: 'ai' as const };

    const first = await db.insertInto('move_items').values({ ...item, seq: 1 }).returning('label').executeTakeFirstOrThrow();
    expect(first.label).toBe('couch_1');
    await expect(db.insertInto('move_items').values({ ...item, seq: 1 }).execute()).rejects.toThrow(/unique/i);
  });

  it('requires company_id for company roles and forbids it for customers', async () => {
    const company = await db.selectFrom('companies').select('id').executeTakeFirstOrThrow();
    await expect(
      db.insertInto('users').values({ role: 'company_admin', name: 'x', email: 'x1@test' }).execute(),
    ).rejects.toThrow(/users_company_matches_role/);
    await expect(
      db.insertInto('users').values({ role: 'customer', company_id: company.id, name: 'x', email: 'x2@test' }).execute(),
    ).rejects.toThrow(/users_company_matches_role/);
  });

  it('treats emails case-insensitively', async () => {
    await expect(
      db.insertInto('users').values({ role: 'customer', name: 'x', email: 'CUSTOMER@nagla.test' }).execute(),
    ).rejects.toThrow(/users_email_key/);
  });

  it('keeps idempotency keys unique per move', async () => {
    const move = await newMove();
    await db.updateTable('moves').set({ status: 'confirmed', current_stage: 'confirmed' }).where('id', '=', move.id).execute();
    const ev = { move_id: move.id, stage: 'accepted' as const, actor_type: 'company_admin' as const, idempotency_key: 'k1' };
    await db.insertInto('move_events').values(ev).execute();
    await expect(db.insertInto('move_events').values(ev).execute()).rejects.toThrow(/unique/i);
  });

  it('forbids a stage on a draft move', async () => {
    const move = await newMove();
    await expect(
      db.updateTable('moves').set({ current_stage: 'accepted' }).where('id', '=', move.id).execute(),
    ).rejects.toThrow(/moves_no_stage_in_draft/);
  });

  it('deletes photos, items, detections, jobs and events with their move', async () => {
    const move = await newMove();
    const photo = await db.insertInto('photos').values({ move_id: move.id, room: 'kitchen', file_path: 'x.jpg' })
      .returning('id').executeTakeFirstOrThrow();
    await db.insertInto('detections').values({ photo_id: photo.id, category: 'tv', size_class: 'small' }).execute();
    await db.insertInto('jobs').values({ move_id: move.id, type: 'detection' }).execute();

    await db.deleteFrom('moves').where('id', '=', move.id).execute();
    const left = await db.selectFrom('photos').select('id').where('move_id', '=', move.id).execute();
    const dets = await db.selectFrom('detections').select('id').where('photo_id', '=', photo.id).execute();
    expect(left).toHaveLength(0);
    expect(dets).toHaveLength(0);
  });
});

import { fileURLToPath } from 'node:url';
import { hash } from '@node-rs/argon2';
import type { Kysely } from 'kysely';
import { config } from '../../config.js';
import { createDb } from '../index.js';
import type { DB } from '../types.js';
import { createCatalogDb } from '../catalog/index.js';
import { seedCatalog } from '../catalog/seed.js';

export const TRUCK_SIZES = [
  { name: 'small', capacity_m3: 10 },
  { name: 'medium', capacity_m3: 20 },
  { name: 'large', capacity_m3: 35 },
];

// Prices in halalas (1 SAR = 100). Fast Move has no large truck, so big moves need trips.
export const COMPANIES = [
  {
    name_en: 'Al-Saqr Movers', name_ar: 'الصقر لنقل العفش', admin_email: 'admin@saqr.test',
    technician: { name: 'Ahmed Al-Yousef', email: 'tech@saqr.test' },
    prices: { small: 40000, medium: 70000, large: 110000 },
  },
  {
    name_en: 'Fast Move', name_ar: 'النقل السريع', admin_email: 'admin@fastmove.test',
    technician: { name: 'Khalid Al-Harbi', email: 'tech@fastmove.test' },
    prices: { small: 35000, medium: 60000 },
  },
] as const;

export const CUSTOMER_EMAIL = 'customer@nagla.test';

export const SETTINGS: Record<string, unknown> = {
  packing_factor: 1.25,
  // first tier whose max_m3 covers the packed volume wins; null = no upper bound
  crew_tiers: [
    { max_m3: 15, crew: 2 },
    { max_m3: 35, crew: 3 },
    { max_m3: null, crew: 4 },
  ],
  loading_minutes_per_m3: 4,
  draft_ttl_hours: 48,
  photo_retention_days: 30,
};

/** Main database seed (companies, trucks, users, settings). Idempotent. */
export async function seed(db: Kysely<DB>) {
  const passwordHash = await hash(config.SEED_PASSWORD);

  await db.transaction().execute(async (trx) => {
    await trx.insertInto('truck_sizes').values(TRUCK_SIZES)
      .onConflict((oc) => oc.column('name').doUpdateSet((eb) => ({ capacity_m3: eb.ref('excluded.capacity_m3') })))
      .execute();
    const sizes = await trx.selectFrom('truck_sizes').select(['id', 'name']).execute();
    const sizeId = Object.fromEntries(sizes.map((s) => [s.name, s.id]));

    for (const c of COMPANIES) {
      let company = await trx.selectFrom('companies').select('id').where('name_en', '=', c.name_en).executeTakeFirst();
      company ??= await trx.insertInto('companies').values({ name_en: c.name_en, name_ar: c.name_ar })
        .returning('id').executeTakeFirstOrThrow();

      for (const [size, price] of Object.entries(c.prices)) {
        await trx.insertInto('company_trucks')
          .values({ company_id: company.id, truck_size_id: sizeId[size], price_halalas: price })
          .onConflict((oc) => oc.columns(['company_id', 'truck_size_id']).doUpdateSet({ price_halalas: price }))
          .execute();
      }
      await upsertUser(trx, {
        role: 'company_admin', company_id: company.id, name: `${c.name_en} Admin`,
        email: c.admin_email, password_hash: passwordHash,
      });
      // one technician (agent) per company for the technician journey
      await upsertUser(trx, {
        role: 'agent', company_id: company.id, name: c.technician.name,
        email: c.technician.email, password_hash: passwordHash,
      });
    }

    await upsertUser(trx, {
      role: 'customer', company_id: null, name: 'Test Customer',
      email: CUSTOMER_EMAIL, password_hash: passwordHash,
    });

    for (const [key, value] of Object.entries(SETTINGS)) {
      await trx.insertInto('settings').values({ key, value: JSON.stringify(value) })
        .onConflict((oc) => oc.column('key').doUpdateSet({ value: JSON.stringify(value), updated_at: new Date() }))
        .execute();
    }
  });
}

async function upsertUser(
  trx: Kysely<DB>,
  u: { role: 'customer' | 'company_admin' | 'agent'; company_id: string | null; name: string; email: string; password_hash: string },
) {
  const existing = await trx.selectFrom('users').select('id').where('email', '=', u.email).executeTakeFirst();
  if (!existing) await trx.insertInto('users').values(u).execute();
  // seeded test accounts always use the current SEED_PASSWORD (so rotating it in .env takes effect)
  else await trx.updateTable('users').set({ password_hash: u.password_hash }).where('id', '=', existing.id).execute();
}

// npm run seed: both databases
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = createDb();
  const catalogDb = createCatalogDb();
  (async () => {
    await seed(db);
    console.log(`catalog: ${await seedCatalog(catalogDb)} rows`);
    console.log('seed done');
  })()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => Promise.all([db.destroy(), catalogDb.destroy()]));
}

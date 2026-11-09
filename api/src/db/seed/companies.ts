import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hash } from '@node-rs/argon2';
import type { Kysely } from 'kysely';
import { config } from '../../config.js';
import { createDb } from '../index.js';
import type { DB } from '../types.js';
import { COMPANIES as DEMO_COMPANIES } from './index.js';

/**
 * Imports the moving-company dataset (companies-dataset.json, made from naqla_moving_companies.xlsx on the
 * Abdullah-Malki branch). Idempotent: companies are matched by their number in the sheet.
 *
 * - Each company gets its profile (region, city, phone, website, Google rating) and small / medium / large trucks.
 *   A truck's price is the company's apartment-move price for that size (mock in the sheet: companies don't publish them).
 * - Every price in the sheet (all services, mock or real) is kept in company_service_prices with its kind.
 * - A seeded demo company with the same Arabic name (Fast Move = النقل السريع) is linked instead of duplicated:
 *   it gets the profile, keeps its demo prices and staff accounts.
 * - Every dataset company gets two staff accounts (like the demo companies): an admin `company<no>@nagla.test`
 *   and a technician `tech<no>@nagla.test`, both with the SEED_PASSWORD (reset to it on every run).
 * - With their staff accounts in place, dataset companies are bookable (offered to customers in their region).
 */

/** the staff accounts of dataset company number `no` */
export const staffEmails = (no: number) => ({ admin: `company${no}@nagla.test`, tech: `tech${no}@nagla.test` });
const DEMO_NAMES: Set<string> = new Set(DEMO_COMPANIES.map((c) => c.name_en));
export interface DatasetCompany {
  no: number; name: string; region: string | null; city: string | null; phone: string | null; website: string | null;
  google_rating: number | null; google_reviews: number | null; trucks: ('small' | 'medium' | 'large')[]; source: string | null;
}
export interface DatasetPrice {
  no: number; service: string; truck: 'small' | 'medium' | 'large' | null; price_sar: number; kind: string; note: string | null;
}
export interface Dataset { companies: DatasetCompany[]; prices: DatasetPrice[] }

export function loadDataset(): Dataset {
  return JSON.parse(readFileSync(new URL('./companies-dataset.json', import.meta.url), 'utf-8'));
}

const halalas = (sar: number) => Math.round(sar * 100);

export async function importCompanies(db: Kysely<DB>, data: Dataset = loadDataset()) {
  let created = 0, updated = 0, linked = 0, accounts = 0;
  const passwordHash = await hash(config.SEED_PASSWORD);
  await db.transaction().execute(async (trx) => {
    const sizes = await trx.selectFrom('truck_sizes').select(['id', 'name']).execute();
    const sizeId = Object.fromEntries(sizes.map((s) => [s.name, s.id]));
    for (const need of ['small', 'medium', 'large']) if (!sizeId[need]) throw new Error(`truck size "${need}" is missing: run the seed first`);

    const pricesByNo = new Map<number, DatasetPrice[]>();
    for (const p of data.prices) pricesByNo.set(p.no, [...(pricesByNo.get(p.no) ?? []), p]);

    for (const c of data.companies) {
      const profile = {
        dataset_no: c.no, region: c.region, city: c.city, phone: c.phone, website: c.website,
        google_rating: c.google_rating, google_reviews: c.google_reviews, data_source: c.source,
      };
      let company: { id: string; name_en?: string } | undefined = await trx.selectFrom('companies').select(['id', 'name_en']).where('dataset_no', '=', c.no).executeTakeFirst();
      // a seeded demo company (it already has its own staff and prices)
      let demo = false;
      if (company) {
        demo = DEMO_NAMES.has(company.name_en ?? '');
        await trx.updateTable('companies').set({ ...profile, name_ar: c.name, ...(demo ? {} : { bookable: true }) }).where('id', '=', company.id).execute();
        updated++;
      } else {
        // a demo company with the same Arabic name and no dataset link yet: link it
        const same = await trx.selectFrom('companies').select('id').where('name_ar', '=', c.name).where('dataset_no', 'is', null).executeTakeFirst();
        if (same) {
          await trx.updateTable('companies').set(profile).where('id', '=', same.id).execute();
          company = same; demo = true; linked++;
        } else {
          // the sheet only has Arabic names (or a Latin brand name): use it for both languages
          company = await trx.insertInto('companies').values({ ...profile, name_ar: c.name, name_en: c.name, bookable: true })
            .returning('id').executeTakeFirstOrThrow();
          created++;
        }
      }

      const prices = pricesByNo.get(c.no) ?? [];
      // demo companies keep their own truck prices (the demo and the tests rely on them)
      if (!demo) {
        await trx.deleteFrom('company_trucks').where('company_id', '=', company.id).execute();
        const trucks = c.trucks.map((t) => ({ t, p: prices.find((p) => p.service === 'apartment' && p.truck === t) })).filter((x) => x.p);
        if (trucks.length) {
          await trx.insertInto('company_trucks')
            .values(trucks.map(({ t, p }) => ({ company_id: company!.id, truck_size_id: sizeId[t], price_halalas: halalas(p!.price_sar) })))
            .execute();
        }
      }
      // staff accounts: an admin (accepts moves, assigns the technician) and one technician
      if (!demo) {
        const { admin, tech } = staffEmails(c.no);
        accounts += await upsertStaff(trx, { role: 'company_admin', company_id: company.id, name: `${c.name} · ${'مدير'}`, email: admin, password_hash: passwordHash });
        accounts += await upsertStaff(trx, { role: 'agent', company_id: company.id, name: `${c.name} · ${'فني'}`, email: tech, password_hash: passwordHash });
      }

      await trx.deleteFrom('company_service_prices').where('company_id', '=', company.id).execute();
      if (prices.length) {
        await trx.insertInto('company_service_prices').values(prices.map((p) => ({
          company_id: company!.id, service: p.service, truck_size_id: p.truck ? sizeId[p.truck] : null,
          price_halalas: halalas(p.price_sar), kind: p.kind, note: p.note,
        }))).execute();
      }
    }
  });
  return { created, updated, linked, accounts, companies: data.companies.length, prices: data.prices.length };
}

/** create the account, or reset an existing one to the seed password and this company; returns 1 when created */
async function upsertStaff(
  trx: Kysely<DB>,
  u: { role: 'company_admin' | 'agent'; company_id: string; name: string; email: string; password_hash: string },
) {
  const existing = await trx.selectFrom('users').select('id').where('email', '=', u.email).executeTakeFirst();
  if (existing) {
    await trx.updateTable('users').set({ password_hash: u.password_hash, company_id: u.company_id, role: u.role }).where('id', '=', existing.id).execute();
    return 0;
  }
  await trx.insertInto('users').values(u).execute();
  return 1;
}

// npm run import:companies
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = createDb();
  importCompanies(db)
    .then((r) => console.log(`companies: ${r.companies} in the dataset (${r.created} new, ${r.updated} updated, ${r.linked} linked to a demo company), ${r.prices} prices, ${r.accounts} new staff accounts`))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => db.destroy());
}

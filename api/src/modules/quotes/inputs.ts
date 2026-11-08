import type { Kysely, Transaction } from 'kysely';
import type { DB } from '../../db/types.js';
import { type CatalogStore, itemCatalog } from '../catalog/store.js';
import type { CompanyTrucks, EstimateItem, EstimateSettings } from './estimator.js';

type Db = Kysely<DB> | Transaction<DB>;

export async function loadSettings(db: Db) {
  const rows = await db.selectFrom('settings').select(['key', 'value']).execute();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
  return {
    packing_factor: Number(map.packing_factor),
    crew_tiers: map.crew_tiers as EstimateSettings['crew_tiers'],
    loading_minutes_per_m3: Number(map.loading_minutes_per_m3),
    draft_ttl_hours: Number(map.draft_ttl_hours),
    photo_retention_days: Number(map.photo_retention_days),
  };
}

/** Items with their volume: the confirmation snapshot when present, else the live catalog value. */
export async function loadEstimateItems(db: Db, catalog: CatalogStore, moveId: string): Promise<EstimateItem[]> {
  const rows = await db.selectFrom('move_items')
    .select(['quantity', 'disposition', 'catalog_id', 'volume_m3_snapshot', 'catalog_snapshot'])
    .where('move_id', '=', moveId)
    .orderBy('id')
    .execute();
  return rows.map((r) => {
    const c = itemCatalog(catalog, r);
    return { quantity: r.quantity, disposition: r.disposition, volume_m3: c.volume_m3, dismantle_minutes: c.dismantle_minutes };
  });
}

export async function loadCompanyTrucks(db: Db, companyId?: string): Promise<CompanyTrucks[]> {
  let q = db.selectFrom('companies')
    .innerJoin('company_trucks as ct', 'ct.company_id', 'companies.id')
    .innerJoin('truck_sizes as ts', 'ts.id', 'ct.truck_size_id')
    .select(['companies.id', 'companies.name_en', 'ts.id as truck_size_id', 'ts.name', 'ts.capacity_m3', 'ct.price_halalas']);
  if (companyId) q = q.where('companies.id', '=', companyId);
  const rows = await q.execute();

  const byCompany = new Map<string, CompanyTrucks>();
  for (const r of rows) {
    const c = byCompany.get(r.id) ?? { company_id: r.id, company_name: r.name_en, trucks: [] };
    c.trucks.push({ truck_size_id: r.truck_size_id, truck_name: r.name, capacity_m3: r.capacity_m3, price_halalas: r.price_halalas });
    byCompany.set(r.id, c);
  }
  return [...byCompany.values()];
}

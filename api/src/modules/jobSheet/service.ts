import type { Kysely } from 'kysely';
import type { DB } from '../../db/types.js';
import { type CatalogStore, itemCatalog } from '../catalog/store.js';
import { conflict } from '../../lib/errors.js';
import { buildJobSheet } from './builder.js';

/** Job sheet for a confirmed move, from its snapshotted inventory (keep items only). */
export async function loadJobSheet(db: Kysely<DB>, catalog: CatalogStore, moveId: string) {
  const move = await db.selectFrom('moves')
    .select(['id', 'status', 'pickup_address', 'pickup_floor', 'pickup_has_elevator',
      'dropoff_address', 'dropoff_floor', 'dropoff_has_elevator', 'date_from', 'date_to', 'preferred_time', 'notes'])
    .where('id', '=', moveId).executeTakeFirstOrThrow();
  if (move.status === 'draft') throw conflict('not_confirmed', 'The job sheet exists after confirmation');

  const items = await db.selectFrom('move_items')
    .select(['label', 'quantity', 'catalog_id', 'volume_m3_snapshot', 'catalog_snapshot', 'custom_name'])
    .where('move_id', '=', moveId).where('disposition', '=', 'keep')
    .execute();

  const quote = await db.selectFrom('quotes')
    .innerJoin('truck_sizes as t', 't.id', 'quotes.truck_size_id')
    .select(['t.name as truck_name', 'quotes.truck_capacity_m3', 'quotes.trips', 'quotes.crew_size', 'quotes.estimated_minutes'])
    .where('quotes.move_id', '=', moveId).where('quotes.is_locked', '=', true).executeTakeFirst();

  const sheet = buildJobSheet(items.map((i) => {
    const c = itemCatalog(catalog, i);
    return {
      label: i.label ?? '',
      name_en: i.custom_name ?? c.name_en,
      name_ar: i.custom_name ?? c.name_ar,
      quantity: i.quantity,
      volume_m3: c.volume_m3,
      weight_kg: c.weight_kg,
      fragile: c.fragile,
      dismantle_minutes: c.dismantle_minutes,
    };
  }));
  return { move, quote: quote ?? null, ...sheet };
}

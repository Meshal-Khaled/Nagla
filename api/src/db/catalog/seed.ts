import type { Kysely } from 'kysely';
import type { CatalogDB } from './index.js';
import { catalogRows } from './rows.js';

/**
 * Load catalog.json into the catalog database. Idempotent.
 * Rows no longer in the file are retired, never deleted: moves in the main database keep their ids.
 */
export async function seedCatalog(db: Kysely<CatalogDB>) {
  const rows = catalogRows();
  await db.transaction().execute(async (trx) => {
    const keep = new Set(rows.map((r) => `${r.category}/${r.size_class}/${r.variant}`));
    const existing = await trx.selectFrom('furniture_catalog').select(['id', 'category', 'size_class', 'variant']).execute();
    const stale = existing.filter((r) => !keep.has(`${r.category}/${r.size_class}/${r.variant}`)).map((r) => r.id);
    if (stale.length) {
      await trx.updateTable('furniture_catalog').set({ is_default: false, retired_at: new Date() })
        .where('id', 'in', stale).where('retired_at', 'is', null).execute();
    }
    // clear defaults first so moving the default to another variant never trips the unique index
    await trx.updateTable('furniture_catalog').set({ is_default: false }).where('is_default', '=', true).execute();

    for (const row of rows) {
      const { category, size_class, variant, ...rest } = row;
      await trx.insertInto('furniture_catalog').values(row)
        .onConflict((oc) => oc.columns(['category', 'size_class', 'variant'])
          .doUpdateSet({ ...rest, retired_at: null, updated_at: new Date() }))
        .execute();
    }
  });
  return rows.length;
}

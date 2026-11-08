import { Kysely, sql } from 'kysely';

// Catalog rows removed from catalog.json but still used by existing moves are kept and
// marked retired: hidden from the catalog list, never matched to new detections.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE furniture_catalog ADD COLUMN retired_at TIMESTAMPTZ;
    ALTER TABLE furniture_catalog ADD CONSTRAINT furniture_catalog_retired_not_default
      CHECK (retired_at IS NULL OR NOT is_default);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE furniture_catalog DROP COLUMN retired_at`.execute(db);
}

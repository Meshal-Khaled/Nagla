import { Kysely, sql } from 'kysely';

// The furniture catalog moved to its own database (see db/catalog). move_items keeps the
// catalog id without a foreign key, plus a copy of the catalog row (catalog_snapshot),
// written at confirmation. Existing items get their snapshot now so nothing is lost.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE move_items ADD COLUMN catalog_snapshot JSONB;
    UPDATE move_items mi SET catalog_snapshot = jsonb_build_object(
      'id', c.id, 'category', c.category, 'variant', c.variant, 'name_en', c.name_en, 'name_ar', c.name_ar,
      'size_class', c.size_class, 'w_cm', c.w_cm, 'd_cm', c.d_cm, 'h_cm', c.h_cm, 'volume_m3', c.volume_m3,
      'weight_kg', c.weight_kg, 'fragile', c.fragile, 'dismantle_minutes', c.dismantle_minutes
    )
    FROM furniture_catalog c WHERE c.id = mi.catalog_id;
    ALTER TABLE move_items DROP CONSTRAINT move_items_catalog_id_fkey;
    DROP TABLE furniture_catalog;
  `.execute(db);
}

// Structure only: catalog rows live in the catalog database now.
export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE furniture_catalog (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category          TEXT NOT NULL,
      variant           TEXT NOT NULL,
      name_en           TEXT NOT NULL,
      name_ar           TEXT NOT NULL,
      size_class        size_class NOT NULL,
      w_cm              NUMERIC(6,1) NOT NULL CHECK (w_cm > 0),
      d_cm              NUMERIC(6,1) NOT NULL CHECK (d_cm > 0),
      h_cm              NUMERIC(6,1) NOT NULL CHECK (h_cm > 0),
      volume_m3         NUMERIC GENERATED ALWAYS AS (w_cm * d_cm * h_cm / 1000000.0) STORED,
      weight_kg         NUMERIC(6,1) NOT NULL CHECK (weight_kg >= 0),
      fragile           BOOLEAN NOT NULL DEFAULT false,
      dismantle_minutes INTEGER NOT NULL DEFAULT 0 CHECK (dismantle_minutes >= 0),
      is_default        BOOLEAN NOT NULL DEFAULT false,
      retired_at        TIMESTAMPTZ,
      UNIQUE (category, size_class, variant)
    );
    CREATE UNIQUE INDEX furniture_catalog_default_key ON furniture_catalog (category, size_class) WHERE is_default;
    ALTER TABLE move_items DROP COLUMN catalog_snapshot;
  `.execute(db);
}

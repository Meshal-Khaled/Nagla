import { Kysely, sql } from 'kysely';

// Catalog database: hardcoded reference data looked up after computer vision names an item.
// Rows are never deleted (moves in the main database keep their ids); rows dropped from
// catalog.json are retired instead.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TYPE size_class AS ENUM ('small', 'medium', 'large');

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
      -- the row AI detections map to for its (category, size_class)
      is_default        BOOLEAN NOT NULL DEFAULT false,
      retired_at        TIMESTAMPTZ,
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (category, size_class, variant),
      CONSTRAINT furniture_catalog_retired_not_default CHECK (retired_at IS NULL OR NOT is_default)
    );
    CREATE UNIQUE INDEX furniture_catalog_default_key
      ON furniture_catalog (category, size_class) WHERE is_default;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS furniture_catalog; DROP TYPE IF EXISTS size_class;`.execute(db);
}

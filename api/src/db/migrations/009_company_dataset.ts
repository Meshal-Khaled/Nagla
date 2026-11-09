import { Kysely, sql } from 'kysely';

// Companies from the market dataset (naqla_moving_companies.xlsx, branch Abdullah-Malki): the company profile,
// every service price from the sheet (most are mock), and whether customers can book the company yet.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE companies ADD COLUMN dataset_no     INTEGER UNIQUE;
    ALTER TABLE companies ADD COLUMN region         TEXT;
    ALTER TABLE companies ADD COLUMN city           TEXT;
    ALTER TABLE companies ADD COLUMN phone          TEXT;
    ALTER TABLE companies ADD COLUMN website        TEXT;
    ALTER TABLE companies ADD COLUMN google_rating  NUMERIC(2,1) CHECK (google_rating BETWEEN 0 AND 5);
    ALTER TABLE companies ADD COLUMN google_reviews INTEGER CHECK (google_reviews >= 0);
    ALTER TABLE companies ADD COLUMN data_source    TEXT;
    -- offered to customers; a company needs staff accounts (an admin to accept moves) before it is bookable
    ALTER TABLE companies ADD COLUMN bookable       BOOLEAN NOT NULL DEFAULT true;

    CREATE TABLE company_service_prices (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      service       TEXT NOT NULL CHECK (service IN ('apartment', 'villa', 'assembly', 'packing', 'intercity', 'whole_home')),
      truck_size_id UUID REFERENCES truck_sizes(id) ON DELETE RESTRICT, -- null: the price is not for one truck size
      price_halalas INTEGER NOT NULL CHECK (price_halalas >= 0),
      kind          TEXT NOT NULL CHECK (kind IN ('mock', 'published', 'starting_from', 'market_average', 'customer_review')),
      note          TEXT
    );
    CREATE INDEX company_service_prices_company_idx ON company_service_prices (company_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS company_service_prices;
    ALTER TABLE companies DROP COLUMN IF EXISTS bookable, DROP COLUMN IF EXISTS data_source, DROP COLUMN IF EXISTS google_reviews,
      DROP COLUMN IF EXISTS google_rating, DROP COLUMN IF EXISTS website, DROP COLUMN IF EXISTS phone, DROP COLUMN IF EXISTS city,
      DROP COLUMN IF EXISTS region, DROP COLUMN IF EXISTS dataset_no;
  `.execute(db);
}

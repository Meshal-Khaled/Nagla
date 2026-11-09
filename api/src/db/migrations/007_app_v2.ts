import { Kysely, sql } from 'kysely';

// App v2 (native app feedback):
// - drafts are not kept unless the customer saves them; any finished or draft move can be archived
// - structured addresses (from the map / Hudhud) next to the free-text address
// - the customer can rename a detected item
// - profile: phone number and saved addresses
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE moves ADD COLUMN draft_saved BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE moves ADD COLUMN archived_at TIMESTAMPTZ;
    ALTER TABLE moves ADD COLUMN pickup_details JSONB;
    ALTER TABLE moves ADD COLUMN dropoff_details JSONB;
    -- drafts made before this change were kept on purpose: treat them as saved
    UPDATE moves SET draft_saved = true WHERE status = 'draft';

    ALTER TABLE move_items ADD COLUMN custom_name TEXT CHECK (custom_name IS NULL OR length(custom_name) BETWEEN 1 AND 100);

    ALTER TABLE users ADD COLUMN phone TEXT CHECK (phone IS NULL OR length(phone) BETWEEN 5 AND 20);

    CREATE TABLE user_addresses (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label        TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 60),
      address      TEXT NOT NULL CHECK (length(address) BETWEEN 1 AND 500),
      lat          NUMERIC(9,6),
      lng          NUMERIC(9,6),
      floor        INTEGER CHECK (floor BETWEEN -5 AND 200),
      has_elevator BOOLEAN,
      details      JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX user_addresses_user_idx ON user_addresses (user_id);

    INSERT INTO settings (key, value) VALUES ('unsaved_draft_ttl_hours', '2') ON CONFLICT (key) DO NOTHING;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DELETE FROM settings WHERE key = 'unsaved_draft_ttl_hours';
    DROP TABLE IF EXISTS user_addresses;
    ALTER TABLE users DROP COLUMN IF EXISTS phone;
    ALTER TABLE move_items DROP COLUMN IF EXISTS custom_name;
    ALTER TABLE moves DROP COLUMN IF EXISTS dropoff_details, DROP COLUMN IF EXISTS pickup_details,
      DROP COLUMN IF EXISTS archived_at, DROP COLUMN IF EXISTS draft_saved;
  `.execute(db);
}

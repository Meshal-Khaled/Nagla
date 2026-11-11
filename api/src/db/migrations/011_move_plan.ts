import { Kysely, sql } from 'kysely';

// The moving plan (booking step 5): the draft one the customer is looking at, and the one locked in at confirmation.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE moves ADD COLUMN plan_draft JSONB;
    ALTER TABLE moves ADD COLUMN plan JSONB;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE moves DROP COLUMN IF EXISTS plan;
    ALTER TABLE moves DROP COLUMN IF EXISTS plan_draft;
  `.execute(db);
}

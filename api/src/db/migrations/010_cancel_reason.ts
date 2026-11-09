import { Kysely, sql } from 'kysely';

// Why a move was cancelled: a reason picked from a short list, plus the customer's own words for "other".
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE moves ADD COLUMN cancel_reason TEXT CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 40);
    ALTER TABLE moves ADD COLUMN cancel_note TEXT CHECK (cancel_note IS NULL OR length(cancel_note) <= 500);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE moves DROP COLUMN IF EXISTS cancel_note;
    ALTER TABLE moves DROP COLUMN IF EXISTS cancel_reason;
  `.execute(db);
}

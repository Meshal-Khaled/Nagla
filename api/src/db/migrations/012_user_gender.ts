import { Kysely, sql } from 'kysely';

// Google sign-up now asks for the name, phone and gender before the account is made.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE users ADD COLUMN gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female'))`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS gender`.execute(db);
}

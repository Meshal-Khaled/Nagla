import { Kysely, sql } from 'kysely';

export const STAGES = [
  'confirmed', 'accepted', 'crew_assigned', 'on_the_way', 'arrived_pickup',
  'loading', 'loaded', 'in_transit', 'arrived_destination', 'unloading', 'completed',
  // off the main line (end states)
  'rejected', 'cancelled',
] as const;

const ENUMS: Record<string, readonly string[]> = {
  user_role: ['customer', 'company_admin', 'agent'],
  move_status: ['draft', 'confirmed', 'cancelled'],
  move_stage: STAGES,
  size_class: ['small', 'medium', 'large'],
  disposition: ['keep', 'donate', 'sell'],
  item_source: ['ai', 'manual'],
  job_type: ['detection'],
  job_status: ['queued', 'running', 'done', 'failed'],
  actor_type: ['company_admin', 'agent', 'customer', 'system'],
};

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(db);
  for (const [name, values] of Object.entries(ENUMS)) {
    await db.schema.createType(name).asEnum([...values]).execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const name of Object.keys(ENUMS).reverse()) {
    await db.schema.dropType(name).ifExists().execute();
  }
}

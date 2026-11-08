import { sql } from 'kysely';
import { config } from '../src/config.js';
import { createCatalogDb } from '../src/db/catalog/index.js';
import { createDb } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';

export function testDbUrl() {
  if (!config.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set');
  return config.TEST_DATABASE_URL;
}

export function testCatalogDbUrl() {
  if (!config.TEST_CATALOG_DATABASE_URL) throw new Error('TEST_CATALOG_DATABASE_URL is not set');
  return config.TEST_CATALOG_DATABASE_URL;
}

export const createTestDb = () => createDb(testDbUrl());
export const createTestCatalogDb = () => createCatalogDb(testCatalogDbUrl());

/** Drop everything in both test databases and migrate them from empty. */
export async function resetTestDb() {
  for (const [db, target] of [[createTestDb(), 'main'], [createTestCatalogDb(), 'catalog']] as const) {
    try {
      await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.execute(db);
      await runMigrations(db, 'latest', target);
    } finally {
      await db.destroy();
    }
  }
}

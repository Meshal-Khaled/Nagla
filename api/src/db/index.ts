import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { config } from '../config.js';
import type { DB } from './types.js';

// Return NUMERIC columns as JS numbers (volumes, sizes, coordinates are well within float range).
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
// DATE stays a 'YYYY-MM-DD' string (no timezone shifts).
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export function createDb<T = DB>(connectionString = config.DATABASE_URL) {
  return new Kysely<T>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max: 10 }) }),
  });
}

export const db = createDb();

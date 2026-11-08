import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Kysely } from 'kysely';
import { Migrator, NO_MIGRATIONS, type Migration, type MigrationProvider } from 'kysely/migration';
import { config } from '../config.js';
import { createDb } from './index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Two databases, each with its own migrations.
export const MIGRATIONS = {
  main: path.join(here, 'migrations'),
  catalog: path.join(here, 'catalog', 'migrations'),
} as const;
export type Target = keyof typeof MIGRATIONS;

// Kysely's FileMigrationProvider imports raw paths, which breaks on Windows; import file URLs instead.
function provider(folder: string): MigrationProvider {
  return {
    async getMigrations() {
      const migrations: Record<string, Migration> = {};
      for (const file of (await fs.readdir(folder)).sort()) {
        if (!/\.(ts|js)$/.test(file)) continue;
        migrations[file.replace(/\.(ts|js)$/, '')] = await import(pathToFileURL(path.join(folder, file)).href);
      }
      return migrations;
    },
  };
}

export function createMigrator(db: Kysely<any>, target: Target = 'main') {
  return new Migrator({ db, provider: provider(MIGRATIONS[target]) });
}

export async function runMigrations(db: Kysely<any>, direction: 'latest' | 'down' | 'reset', target: Target = 'main') {
  const migrator = createMigrator(db, target);
  const { error, results } =
    direction === 'latest'
      ? await migrator.migrateToLatest()
      : direction === 'down'
        ? await migrator.migrateDown()
        : await migrator.migrateTo(NO_MIGRATIONS);
  for (const r of results ?? []) {
    console.log(`${r.status === 'Success' ? 'ok ' : 'ERR'} [${target}] ${r.direction} ${r.migrationName}`);
  }
  if (error) throw error;
}

// tsx src/db/migrate.ts <latest|down|reset> [main|catalog|all]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const direction = (process.argv[2] ?? 'latest') as 'latest' | 'down' | 'reset';
  const which = process.argv[3] ?? 'all';
  const targets: Target[] = which === 'all' ? ['main', 'catalog'] : [which as Target];
  (async () => {
    for (const target of targets) {
      const db = createDb(target === 'main' ? config.DATABASE_URL : config.CATALOG_DATABASE_URL);
      try {
        await runMigrations(db, direction, target);
      } finally {
        await db.destroy();
      }
    }
  })().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

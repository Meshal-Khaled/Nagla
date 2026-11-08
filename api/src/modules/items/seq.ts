import type { Transaction } from 'kysely';
import type { DB } from '../../db/types.js';

/**
 * Next label number for a category in a move (`couch_3` after `couch_2`).
 * Call inside a transaction that holds the move row lock (`SELECT … FOR UPDATE`).
 * Gaps left by deletes or merges are never refilled.
 */
export async function nextSeq(trx: Transaction<DB>, moveId: string, category: string) {
  const row = await trx.selectFrom('move_items')
    .select((eb) => eb.fn.max('seq').as('max'))
    .where('move_id', '=', moveId).where('category', '=', category)
    .executeTakeFirst();
  return (row?.max ?? 0) + 1;
}

/** Next seq for every category at once, for bulk inserts. */
export async function seqCounters(trx: Transaction<DB>, moveId: string) {
  const rows = await trx.selectFrom('move_items')
    .select(['category', (eb) => eb.fn.max('seq').as('max')])
    .where('move_id', '=', moveId).groupBy('category').execute();
  const next = new Map(rows.map((r) => [r.category, r.max + 1]));
  return (category: string) => {
    const n = next.get(category) ?? 1;
    next.set(category, n + 1);
    return n;
  };
}

import type { FastifyInstance } from 'fastify';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../auth/guards.js';
import type { AuthUser } from '../../auth/tokens.js';
import type { DB } from '../../db/types.js';
import type { Deps } from '../../deps.js';
import { badRequest, notFound } from '../../lib/errors.js';
import type { CatalogStore } from '../catalog/store.js';
import { assertDraft, IdParam, loadMove } from '../moves/access.js';
import { moveDetails } from '../moves/view.js';
import { nextSeq } from './seq.js';

const Disposition = z.enum(['keep', 'donate', 'sell']);
const AddItem = z.object({
  catalog_id: z.uuid(),
  quantity: z.number().int().min(1).max(500).default(1),
  disposition: Disposition.default('keep'),
});
const PatchItem = z.object({
  catalog_id: z.uuid(),
  quantity: z.number().int().min(1).max(500),
  disposition: Disposition,
}).partial().strict();
const Merge = z.object({
  keep_id: z.uuid(),
  merge_ids: z.array(z.uuid()).min(1),
  // false: the merged items were the same object seen twice; true: add their quantities
  sum_quantities: z.boolean().default(false),
});

function catalogRow(catalog: CatalogStore, id: string) {
  const row = catalog.getActive(id);
  if (!row) throw badRequest('unknown_catalog_item', 'No such catalog item');
  return row;
}

/** Load an item and lock its draft move for editing. */
async function lockItem(trx: Transaction<DB>, itemId: string, user: AuthUser) {
  const item = await trx.selectFrom('move_items').selectAll().where('id', '=', itemId).executeTakeFirst();
  if (!item) throw notFound('Item');
  const move = await loadMove(trx, item.move_id, user, { ownerOnly: true, lock: true });
  assertDraft(move);
  return { item, move };
}

export async function itemRoutes(app: FastifyInstance, deps: Deps) {
  const { db, config, catalog } = deps;
  const auth = requireAuth(config.JWT_SECRET, 'customer');
  const details = async (moveId: string, user: AuthUser) => moveDetails(deps, await loadMove(db, moveId, user));

  // add an item the AI missed
  app.post('/moves/:id/items', { preHandler: auth }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const body = AddItem.parse(req.body);
    const item = await db.transaction().execute(async (trx) => {
      assertDraft(await loadMove(trx, id, currentUser(req), { ownerOnly: true, lock: true }));
      const cat = catalogRow(catalog, body.catalog_id);
      return trx.insertInto('move_items').values({
        move_id: id, catalog_id: cat.id, category: cat.category, seq: await nextSeq(trx, id, cat.category),
        quantity: body.quantity, disposition: body.disposition, source: 'manual',
      }).returning(['id', 'label']).executeTakeFirstOrThrow();
    });
    reply.code(201);
    return { item, move: await details(id, currentUser(req)) };
  });

  app.patch('/items/:id', { preHandler: auth }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const body = PatchItem.parse(req.body);
    const moveId = await db.transaction().execute(async (trx) => {
      const { item } = await lockItem(trx, id, currentUser(req));
      const set: Record<string, unknown> = { quantity: body.quantity, disposition: body.disposition };
      if (body.catalog_id && body.catalog_id !== item.catalog_id) {
        const cat = catalogRow(catalog, body.catalog_id);
        set.catalog_id = cat.id;
        if (cat.category !== item.category) {
          // a new category gets that category's next label (couch_2 → armchair_1)
          set.category = cat.category;
          set.seq = await nextSeq(trx, item.move_id, cat.category);
        }
      }
      await trx.updateTable('move_items').set(set).where('id', '=', id).execute();
      return item.move_id;
    });
    return details(moveId, currentUser(req));
  });

  app.delete('/items/:id', { preHandler: auth }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const moveId = await db.transaction().execute(async (trx) => {
      const { item } = await lockItem(trx, id, currentUser(req));
      await trx.deleteFrom('move_items').where('id', '=', id).execute();
      return item.move_id;
    });
    return details(moveId, currentUser(req));
  });

  // merge duplicates: point all detections at keep_id, delete the others
  app.post('/moves/:id/items/merge', { preHandler: auth }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const body = Merge.parse(req.body);
    const mergeIds = [...new Set(body.merge_ids)].filter((m) => m !== body.keep_id);
    if (!mergeIds.length) throw badRequest('nothing_to_merge', 'merge_ids must contain other items');

    await db.transaction().execute(async (trx) => {
      assertDraft(await loadMove(trx, id, currentUser(req), { ownerOnly: true, lock: true }));
      const rows = await trx.selectFrom('move_items').select(['id', 'quantity'])
        .where('move_id', '=', id).where('id', 'in', [body.keep_id, ...mergeIds]).execute();
      if (rows.length !== mergeIds.length + 1) throw badRequest('unknown_items', 'All items must belong to this move');

      await trx.updateTable('detections').set({ item_id: body.keep_id }).where('item_id', 'in', mergeIds).execute();
      if (body.sum_quantities) {
        const total = rows.reduce((s, r) => s + r.quantity, 0);
        await trx.updateTable('move_items').set({ quantity: total }).where('id', '=', body.keep_id).execute();
      }
      await trx.deleteFrom('move_items').where('id', 'in', mergeIds).execute();
    });
    return details(id, currentUser(req));
  });
}

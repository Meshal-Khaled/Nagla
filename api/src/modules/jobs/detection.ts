import type { Deps } from '../../deps.js';
import { seqCounters } from '../items/seq.js';
import { type DetectRoomResponse, SIZE_CLASSES } from './contract.js';

/**
 * Run detection for a move: one AI call per room, then write items + detections in one
 * transaction. Throws (and writes nothing) if any room fails.
 */
export async function runDetection({ db, storage, ai, catalog }: Pick<Deps, 'db' | 'storage' | 'ai' | 'catalog'>, moveId: string) {
  const photos = await db.selectFrom('photos').select(['id', 'room', 'file_path'])
    .where('move_id', '=', moveId).orderBy('created_at').orderBy('id').execute();
  if (!photos.length) throw new Error('The move has no photos');

  const categories = catalog.categories();
  const rooms = [...new Set(photos.map((p) => p.room))].sort();

  const results: DetectRoomResponse[] = [];
  for (const room of rooms) {
    const roomPhotos = photos.filter((p) => p.room === room);
    const res = await ai.detectRoom({
      move_id: moveId,
      room,
      photos: await Promise.all(roomPhotos.map(async (p) => ({ id: p.id, data: await storage.read(p.file_path) }))),
      categories,
      size_classes: SIZE_CLASSES,
    });
    const ids = new Set(roomPhotos.map((p) => p.id));
    // keep only sightings on this room's photos; drop items left with none
    res.items = res.items
      .map((it) => ({ ...it, sightings: it.sightings.filter((s) => ids.has(s.photo_id)) }))
      .filter((it) => it.sightings.length);
    results.push({ ...res, room });
  }

  await db.transaction().execute(async (trx) => {
    const move = await trx.selectFrom('moves').select(['status']).where('id', '=', moveId).forUpdate().executeTakeFirstOrThrow();
    if (move.status !== 'draft') throw new Error('The move is no longer a draft');

    // Re-running detection replaces earlier AI results; manual items stay.
    const photoIds = photos.map((p) => p.id);
    await trx.deleteFrom('detections').where('photo_id', 'in', photoIds).execute();
    await trx.deleteFrom('move_items').where('move_id', '=', moveId).where('source', '=', 'ai').execute();

    const next = await seqCounters(trx, moveId);
    for (const room of results) {
      for (const it of room.items) {
        const row = catalog.resolve(categories.includes(it.category) ? it.category : 'other', it.size_class);
        const item = await trx.insertInto('move_items')
          .values({ move_id: moveId, catalog_id: row.id, category: row.category, seq: next(row.category), source: 'ai' })
          .returning('id').executeTakeFirstOrThrow();
        await trx.insertInto('detections').values(it.sightings.map((s) => ({
          photo_id: s.photo_id,
          item_id: item.id,
          category: row.category,
          size_class: it.size_class,
          confidence: it.confidence ?? null,
          box_x: s.box?.x ?? null,
          box_y: s.box?.y ?? null,
          box_w: s.box?.w ?? null,
          box_h: s.box?.h ?? null,
        }))).execute();
      }
    }
    await trx.updateTable('moves').set({ updated_at: new Date() }).where('id', '=', moveId).execute();
  });
}

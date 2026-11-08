import type { Deps } from '../../deps.js';
import { itemCatalog } from '../catalog/store.js';
import { progress, type Stage } from '../tracking/stages.js';
import type { MoveRow } from './access.js';

/** Full move as the API returns it (never includes the agent token hash). */
export async function moveDetails({ db, storage, catalog }: Pick<Deps, 'db' | 'storage' | 'catalog'>, move: MoveRow) {
  const { agent_token_hash: _hash, ...fields } = move;

  const [items, photos, detections, quote, company, people] = await Promise.all([
    db.selectFrom('move_items')
      .select(['id', 'label', 'category', 'seq', 'quantity', 'disposition', 'source', 'catalog_id',
        'volume_m3_snapshot', 'catalog_snapshot'])
      .where('move_id', '=', move.id)
      .orderBy('category').orderBy('seq').execute(),
    db.selectFrom('photos').select(['id', 'room', 'width', 'height', 'created_at'])
      .where('move_id', '=', move.id).orderBy('room').orderBy('created_at').execute(),
    db.selectFrom('detections').innerJoin('photos', 'photos.id', 'detections.photo_id')
      .select(['detections.id', 'detections.photo_id', 'detections.item_id', 'detections.category', 'detections.size_class',
        'detections.confidence', 'detections.box_x', 'detections.box_y', 'detections.box_w', 'detections.box_h'])
      .where('photos.move_id', '=', move.id).execute(),
    db.selectFrom('quotes').innerJoin('truck_sizes as t', 't.id', 'quotes.truck_size_id')
      .selectAll('quotes').select('t.name as truck_name')
      .where('quotes.move_id', '=', move.id).where('quotes.is_locked', '=', true).executeTakeFirst(),
    move.company_id
      ? db.selectFrom('companies').select(['id', 'name_en', 'name_ar']).where('id', '=', move.company_id).executeTakeFirst()
      : undefined,
    // the customer and the assigned technician, by name (for the tracking and company screens)
    db.selectFrom('users').select(['id', 'name', 'role'])
      .where('id', 'in', [move.customer_id, ...(move.assigned_agent_id ? [move.assigned_agent_id] : [])]).execute(),
  ]);
  const person = (id: string | null) => {
    const u = id ? people.find((p) => p.id === id) : undefined;
    return u ? { id: u.id, name: u.name } : null;
  };

  return {
    ...fields,
    move_no: Number(move.move_no),
    customer: person(move.customer_id),
    technician: person(move.assigned_agent_id),
    company: company ?? null,
    progress: progress(move.current_stage as Stage | null),
    items: items.map(({ catalog_snapshot, ...i }) => {
      const c = itemCatalog(catalog, { ...i, catalog_snapshot });
      return {
        ...i, name_en: c.name_en, name_ar: c.name_ar, size_class: c.size_class, variant: c.variant,
        volume_m3: c.volume_m3, weight_kg: c.weight_kg, fragile: c.fragile, dismantle_minutes: c.dismantle_minutes,
      };
    }),
    photos: photos.map((p) => ({
      ...p,
      url: storage.signedUrl('photo', p.id),
      detections: detections.filter((d) => d.photo_id === p.id).map((d) => ({
        id: d.id,
        item_id: d.item_id,
        category: d.category,
        size_class: d.size_class,
        confidence: d.confidence,
        box: d.box_x === null ? null : { x: d.box_x, y: d.box_y, w: d.box_w, h: d.box_h },
      })),
    })),
    quote: quote ?? null,
  };
}

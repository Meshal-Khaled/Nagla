import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../auth/guards.js';
import type { Deps } from '../../deps.js';
import { badRequest } from '../../lib/errors.js';
import { assertDraft, IdParam, loadMove } from './access.js';
import { confirmMove } from './confirm.js';
import { moveDetails } from './view.js';

const Coord = z.number().min(-180).max(180).nullable();
const PatchMove = z.object({
  company_id: z.uuid().nullable(),
  pickup_address: z.string().trim().max(500).nullable(),
  pickup_lat: Coord,
  pickup_lng: Coord,
  pickup_floor: z.number().int().min(-5).max(200).nullable(),
  pickup_has_elevator: z.boolean().nullable(),
  dropoff_address: z.string().trim().max(500).nullable(),
  dropoff_lat: Coord,
  dropoff_lng: Coord,
  dropoff_floor: z.number().int().min(-5).max(200).nullable(),
  dropoff_has_elevator: z.boolean().nullable(),
  date_from: z.iso.date().nullable(),
  date_to: z.iso.date().nullable(),
  preferred_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  notes: z.string().max(2000).nullable(),
}).partial().strict();

export async function moveRoutes(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const customer = requireAuth(config.JWT_SECRET, 'customer');
  const anyone = requireAuth(config.JWT_SECRET);

  app.post('/moves', { preHandler: customer }, async (req, reply) => {
    const move = await db.insertInto('moves').values({ customer_id: currentUser(req).id })
      .returning(['id', 'status', 'created_at']).executeTakeFirstOrThrow();
    reply.code(201);
    return move;
  });

  app.get('/moves', { preHandler: customer }, async (req) => {
    return db.selectFrom('moves')
      .leftJoin('companies', 'companies.id', 'moves.company_id')
      .select(['moves.id', 'moves.move_no', 'moves.status', 'moves.current_stage', 'moves.date_from', 'moves.date_to',
        'moves.preferred_time', 'moves.pickup_address', 'moves.dropoff_address', 'moves.created_at',
        'companies.name_en as company_name'])
      .select((eb) => eb.selectFrom('move_items').select(eb.fn.countAll<number>().as('n'))
        .whereRef('move_items.move_id', '=', 'moves.id').as('item_count'))
      .where('moves.customer_id', '=', currentUser(req).id)
      .orderBy('moves.created_at', 'desc').execute()
      .then((rows) => rows.map((r) => ({ ...r, move_no: Number(r.move_no), item_count: Number(r.item_count) })));
  });

  app.get('/moves/:id', { preHandler: anyone }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const move = await loadMove(db, id, currentUser(req));
    return moveDetails(deps, move);
  });

  app.patch('/moves/:id', { preHandler: customer }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const body = PatchMove.parse(req.body);
    const move = await loadMove(db, id, currentUser(req), { ownerOnly: true });
    assertDraft(move);

    const dateFrom = body.date_from !== undefined ? body.date_from : move.date_from;
    const dateTo = body.date_to !== undefined ? body.date_to : move.date_to;
    if (dateFrom && dateTo && String(dateTo) < String(dateFrom)) throw badRequest('bad_date_window', 'date_to is before date_from');
    if (body.company_id) {
      const c = await db.selectFrom('companies').select('id').where('id', '=', body.company_id).executeTakeFirst();
      if (!c) throw badRequest('unknown_company', 'No such company');
    }
    await db.updateTable('moves').set({ ...body, updated_at: new Date() }).where('id', '=', id).execute();
    return moveDetails(deps, await loadMove(db, id, currentUser(req)));
  });

  app.post('/moves/:id/confirm', { preHandler: customer }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const { company_id } = z.object({ company_id: z.uuid() }).parse(req.body);
    return confirmMove(deps, id, currentUser(req), company_id);
  });
}

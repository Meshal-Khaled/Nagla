import { hash, verify } from '@node-rs/argon2';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../auth/guards.js';
import type { Deps } from '../../deps.js';
import { badRequest, notFound, unauthorized } from '../../lib/errors.js';
import { IdParam } from '../moves/access.js';
import { AddressDetails } from '../moves/routes.js';

const PatchMe = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().regex(/^\+?[0-9 ]{5,20}$/).nullable(),
}).partial().strict();

const Password = z.object({
  current_password: z.string().max(200).optional(),
  new_password: z.string().min(8).max(200),
});

const Address = z.object({
  label: z.string().trim().min(1).max(60),
  address: z.string().trim().min(1).max(500),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  floor: z.number().int().min(-5).max(200).nullable().optional(),
  has_elevator: z.boolean().nullable().optional(),
  details: AddressDetails.optional(),
});

/** Profile page: editable details, password, saved addresses and the user's stats. */
export async function profileRoutes(app: FastifyInstance, { db, config }: Deps) {
  const signedIn = requireAuth(config.JWT_SECRET);

  app.patch('/auth/me', { preHandler: signedIn }, async (req) => {
    const body = PatchMe.parse(req.body);
    if (!Object.keys(body).length) throw badRequest('nothing_to_change', 'Send name and/or phone');
    await db.updateTable('users').set(body).where('id', '=', currentUser(req).id).execute();
    return db.selectFrom('users').select(['id', 'name', 'email', 'phone', 'role']).where('id', '=', currentUser(req).id).executeTakeFirstOrThrow();
  });

  // Google-only accounts (no password yet) may set one without the current password
  app.post('/auth/password', { preHandler: signedIn }, async (req, reply) => {
    const body = Password.parse(req.body);
    const u = await db.selectFrom('users').select(['id', 'password_hash']).where('id', '=', currentUser(req).id).executeTakeFirstOrThrow();
    if (u.password_hash && !(body.current_password && (await verify(u.password_hash, body.current_password)))) {
      throw unauthorized('Current password is wrong');
    }
    await db.updateTable('users').set({ password_hash: await hash(body.new_password) }).where('id', '=', u.id).execute();
    reply.code(204);
  });

  // numbers for the profile header
  app.get('/me/stats', { preHandler: signedIn }, async (req) => {
    const me = currentUser(req);
    const user = await db.selectFrom('users').select(['created_at', 'password_hash', 'google_sub']).where('id', '=', me.id).executeTakeFirstOrThrow();
    const base = { member_since: user.created_at, has_password: !!user.password_hash, google_linked: !!user.google_sub };
    if (me.role === 'customer') {
      const moves = await db.selectFrom('moves').select(['status', 'current_stage', 'draft_saved'])
        .where('customer_id', '=', me.id).where('archived_at', 'is', null).execute();
      const rating = await db.selectFrom('move_ratings')
        .select([sql<string | null>`round(avg(stars)::numeric, 1)`.as('average'), sql<string>`count(*)`.as('count')])
        .where('ratee_id', '=', me.id).where('rater_role', '=', 'agent').executeTakeFirstOrThrow();
      const archived = await db.selectFrom('moves').select(sql<string>`count(*)`.as('n'))
        .where('customer_id', '=', me.id).where('archived_at', 'is not', null).executeTakeFirstOrThrow();
      return {
        ...base,
        moves: moves.filter((m) => m.status !== 'draft').length,
        active: moves.filter((m) => m.status === 'confirmed' && !['completed', 'rejected', 'cancelled'].includes(String(m.current_stage))).length,
        completed: moves.filter((m) => m.current_stage === 'completed').length,
        drafts: moves.filter((m) => m.status === 'draft' && m.draft_saved).length,
        archived: Number(archived.n),
        rating: { average: rating.average == null ? null : Number(rating.average), count: Number(rating.count) },
      };
    }
    if (me.role === 'company_admin') {
      const moves = await db.selectFrom('moves').select(['current_stage'])
        .where('company_id', '=', me.company_id).where('status', '<>', 'draft').execute();
      const agents = await db.selectFrom('users').select(sql<string>`count(*)`.as('n'))
        .where('company_id', '=', me.company_id).where('role', '=', 'agent').executeTakeFirstOrThrow();
      return {
        ...base,
        moves: moves.length,
        incoming: moves.filter((m) => m.current_stage === 'confirmed').length,
        completed: moves.filter((m) => m.current_stage === 'completed').length,
        technicians: Number(agents.n),
      };
    }
    return base; // technicians: /tech/profile has their numbers
  });

  app.get('/me/addresses', { preHandler: signedIn }, async (req) =>
    db.selectFrom('user_addresses').selectAll().where('user_id', '=', currentUser(req).id).orderBy('created_at').execute());

  app.post('/me/addresses', { preHandler: signedIn }, async (req, reply) => {
    const body = Address.parse(req.body);
    const count = await db.selectFrom('user_addresses').select(sql<string>`count(*)`.as('n'))
      .where('user_id', '=', currentUser(req).id).executeTakeFirstOrThrow();
    if (Number(count.n) >= 20) throw badRequest('too_many_addresses', 'At most 20 saved addresses');
    const row = await db.insertInto('user_addresses').values({
      user_id: currentUser(req).id, label: body.label, address: body.address,
      lat: body.lat ?? null, lng: body.lng ?? null, floor: body.floor ?? null, has_elevator: body.has_elevator ?? null,
      details: body.details ? JSON.stringify(body.details) : null,
    }).returningAll().executeTakeFirstOrThrow();
    reply.code(201);
    return row;
  });

  app.delete('/me/addresses/:id', { preHandler: signedIn }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const r = await db.deleteFrom('user_addresses').where('id', '=', id).where('user_id', '=', currentUser(req).id).executeTakeFirst();
    if (!r.numDeletedRows) throw notFound('Address');
    reply.code(204);
  });
}

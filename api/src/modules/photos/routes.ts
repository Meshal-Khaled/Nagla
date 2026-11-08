import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../auth/guards.js';
import type { Deps } from '../../deps.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { assertDraft, IdParam, loadMove } from '../moves/access.js';

const MAX_FILES = 20;
// "Living Room" → "living_room"
const Room = z.string().trim().min(1).max(40)
  .transform((s) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '_').replace(/^_|_$/g, ''))
  .pipe(z.string().min(1));

export async function photoRoutes(app: FastifyInstance, deps: Deps) {
  const { db, storage, config } = deps;
  const auth = requireAuth(config.JWT_SECRET, 'customer');

  // multipart: field `room` + one or more image files. `room` may also be a query param.
  app.post('/moves/:id/photos', { preHandler: auth }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const move = await loadMove(db, id, currentUser(req), { ownerOnly: true });
    assertDraft(move);
    if (!req.isMultipart()) throw badRequest('multipart_required', 'Send photos as multipart/form-data');

    let room = (req.query as { room?: string }).room;
    const files: Buffer[] = [];
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (!part.mimetype.startsWith('image/')) throw badRequest('not_an_image', `${part.filename} is not an image`);
        if (files.length >= MAX_FILES) throw badRequest('too_many_files', `At most ${MAX_FILES} photos per upload`);
        files.push(await part.toBuffer());
      } else if (part.fieldname === 'room') {
        room = String(part.value);
      }
    }
    const roomSlug = Room.parse(room ?? '');
    if (!files.length) throw badRequest('no_files', 'No photos attached');

    const saved = [];
    for (const buf of files) {
      const photoId = crypto.randomUUID();
      const filePath = `${move.id}/${photoId}.jpg`;
      const size = await storage.saveImage(filePath, buf).catch(() => {
        throw badRequest('bad_image', 'Could not read one of the images');
      });
      const row = await db.insertInto('photos')
        .values({ id: photoId, move_id: move.id, room: roomSlug, file_path: filePath, ...size })
        .returning(['id', 'room', 'width', 'height', 'created_at']).executeTakeFirstOrThrow();
      saved.push({ ...row, url: storage.signedUrl('photo', row.id) });
    }
    reply.code(201);
    return { photos: saved };
  });

  app.delete('/photos/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const photo = await db.selectFrom('photos').select(['id', 'move_id', 'file_path']).where('id', '=', id).executeTakeFirst();
    if (!photo) throw notFound('Photo');
    assertDraft(await loadMove(db, photo.move_id, currentUser(req), { ownerOnly: true }));
    await db.deleteFrom('photos').where('id', '=', id).execute();
    await storage.remove(photo.file_path);
    reply.code(204);
  });

  // Signed URLs only; no other way to reach the files.
  app.get('/files/:kind/:id', async (req, reply) => {
    const { kind, id } = z.object({ kind: z.enum(['photo', 'event']), id: z.uuid() }).parse(req.params);
    const { exp, sig } = req.query as { exp?: string; sig?: string };
    if (!storage.verify(kind, id, exp, sig)) throw forbidden('Invalid or expired link');

    const row = kind === 'photo'
      ? await db.selectFrom('photos').select('file_path as path').where('id', '=', id).executeTakeFirst()
      : await db.selectFrom('move_events').select('photo_path as path').where('id', '=', id).executeTakeFirst();
    if (!row?.path) throw notFound('File');
    const data = await storage.read(row.path).catch(() => {
      throw notFound('File');
    });
    return reply.header('cache-control', 'private, max-age=3600').type('image/jpeg').send(data);
  });
}

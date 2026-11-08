import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createMove, CUSTOMER_EMAIL, jpeg, login, multipart, setup, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let token: string;
let moveId: string;

beforeAll(async () => {
  ctx = await setup();
  token = await login(ctx.app, CUSTOMER_EMAIL);
  moveId = await createMove(ctx.app, token);
});
afterAll(() => ctx.close());

async function upload(room: string, data: Buffer, type = 'image/jpeg') {
  const mp = multipart({ room }, [{ name: 'file', data, type }]);
  return ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/photos`, headers: { ...bearer(token), ...mp.headers }, payload: mp.payload });
}

describe('photo upload', () => {
  it('strips EXIF/GPS and normalises the room tag', async () => {
    const original = await jpeg({ gps: true });
    expect((await sharp(original).metadata()).exif).toBeDefined(); // fixture really has GPS

    const res = await upload('Living Room', original);
    expect(res.statusCode).toBe(201);
    const [photo] = res.json().photos;
    expect(photo.room).toBe('living_room');

    const row = await ctx.db.selectFrom('photos').select('file_path').where('id', '=', photo.id).executeTakeFirstOrThrow();
    const stored = await ctx.deps.storage.read(row.file_path);
    const meta = await sharp(stored).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe('jpeg');
  });

  it('serves files only through a valid signed URL', async () => {
    const [photo] = (await upload('kitchen', await jpeg())).json().photos;

    const ok = await ctx.app.inject({ method: 'GET', url: photo.url });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/jpeg');

    expect((await ctx.app.inject({ method: 'GET', url: `/files/photo/${photo.id}` })).statusCode).toBe(403);
    const tampered = photo.url.replace(/sig=[^&]+/, 'sig=AAAA');
    expect((await ctx.app.inject({ method: 'GET', url: tampered })).statusCode).toBe(403);

    const expired = ctx.deps.storage.signedUrl('photo', photo.id, Date.now() - 2 * 3600_000);
    expect((await ctx.app.inject({ method: 'GET', url: expired })).statusCode).toBe(403);
  });

  it('rejects non-images and missing room', async () => {
    expect((await upload('kitchen', Buffer.from('hello'), 'text/plain')).statusCode).toBe(400);
    expect((await upload('', await jpeg())).statusCode).toBe(400);
  });
});

import { sql } from 'kysely';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Hudhud } from '../src/modules/geo/routes.js';
import { runCleanup } from '../src/modules/cleanup/cleanup.js';
import { bearer, companyId, CUSTOMER_EMAIL, draftWithItems, login, setup, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeEach(async () => {
  await ctx?.close();
  ctx = await setup();
});
afterAll(() => ctx.close());

const req = (method: string, url: string, token: string, payload?: object) =>
  ctx.app.inject({ method: method as 'GET', url, headers: bearer(token), payload });
const list = async (token: string, view = '') => (await req('GET', '/moves' + (view ? '?view=' + view : ''), token)).json().map((m: { id: string }) => m.id);

describe('drafts', () => {
  it('hides unsaved drafts until saved, and archives / unarchives', async () => {
    const { token, moveId } = await draftWithItems(ctx);
    expect(await list(token)).not.toContain(moveId);
    expect((await req('POST', `/moves/${moveId}/save-draft`, token)).statusCode).toBe(200);
    expect(await list(token)).toContain(moveId);

    expect((await req('POST', `/moves/${moveId}/archive`, token)).statusCode).toBe(200);
    expect(await list(token)).not.toContain(moveId);
    expect(await list(token, 'archived')).toContain(moveId);
    expect((await req('POST', `/moves/${moveId}/unarchive`, token)).statusCode).toBe(200);
    expect(await list(token)).toContain(moveId);
  });

  it('discards a draft with its files, but never a confirmed move', async () => {
    const { token, moveId } = await draftWithItems(ctx);
    expect((await req('DELETE', `/moves/${moveId}`, token)).statusCode).toBe(204);
    expect((await req('GET', `/moves/${moveId}`, token)).statusCode).toBe(404);

    const b = await draftWithItems(ctx);
    await req('POST', `/moves/${b.moveId}/confirm`, b.token, { company_id: await companyId(ctx.db, 'Al-Saqr Movers') });
    expect((await req('DELETE', `/moves/${b.moveId}`, b.token)).statusCode).toBe(409);
    // running moves can't be archived; confirmed ones show in the list
    expect((await req('POST', `/moves/${b.moveId}/archive`, b.token)).statusCode).toBe(409);
    expect(await list(b.token)).toContain(b.moveId);
  });

  it('cleanup: unsaved drafts after 2 h, saved drafts after 48 h without changes', async () => {
    const unsaved = await draftWithItems(ctx);
    const saved = await draftWithItems(ctx);
    await req('POST', `/moves/${saved.moveId}/save-draft`, saved.token);
    const threeHoursAgo = new Date(Date.now() - 3 * 3600_000);
    await sql`UPDATE moves SET created_at = ${threeHoursAgo}, updated_at = ${threeHoursAgo}`.execute(ctx.db);
    expect((await runCleanup(ctx.deps)).drafts_deleted).toBe(1);
    expect((await req('GET', `/moves/${unsaved.moveId}`, unsaved.token)).statusCode).toBe(404);
    expect((await req('GET', `/moves/${saved.moveId}`, saved.token)).statusCode).toBe(200);
    await sql`UPDATE moves SET updated_at = now() - interval '49 hours'`.execute(ctx.db);
    expect((await runCleanup(ctx.deps)).drafts_deleted).toBe(1);
  });

  it('stores structured addresses and renames items', async () => {
    const { token, moveId } = await draftWithItems(ctx);
    const patched = await req('PATCH', `/moves/${moveId}`, token, {
      pickup_details: { district: 'Al Olaya', city: 'Riyadh', short_code: 'RRHC2680', postal_code: '12211' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().pickup_details).toMatchObject({ district: 'Al Olaya', short_code: 'RRHC2680' });
    expect((await req('PATCH', `/moves/${moveId}`, token, { pickup_details: { evil: 'x' } })).statusCode).toBe(400);

    const item = patched.json().items[0];
    const renamed = (await req('PATCH', `/items/${item.id}`, token, { name: 'Grandma’s sofa' })).json();
    const it = renamed.items.find((i: { id: string }) => i.id === item.id);
    expect(it).toMatchObject({ custom_name: 'Grandma’s sofa', name_en: 'Grandma’s sofa', name_ar: 'Grandma’s sofa' });
    expect(it.catalog_name_en).not.toBe('Grandma’s sofa');
    const reset = (await req('PATCH', `/items/${item.id}`, token, { name: '' })).json().items.find((i: { id: string }) => i.id === item.id);
    expect(reset.custom_name).toBeNull();
  });
});

describe('profile', () => {
  it('edits name and phone, changes the password, keeps addresses and shows stats', async () => {
    const token = await login(ctx.app, CUSTOMER_EMAIL);
    const me = (await req('PATCH', '/auth/me', token, { name: 'Sara Q', phone: '+966 500000000' })).json();
    expect(me).toMatchObject({ name: 'Sara Q', phone: '+966 500000000' });
    expect((await req('PATCH', '/auth/me', token, { email: 'x@y.z' })).statusCode).toBe(400);

    expect((await req('POST', '/auth/password', token, { current_password: 'wrong', new_password: 'new-pass-123' })).statusCode).toBe(401);
    expect((await req('POST', '/auth/password', token, { current_password: ctx.deps.config.SEED_PASSWORD, new_password: 'new-pass-123' })).statusCode).toBe(204);
    expect((await ctx.app.inject({ method: 'POST', url: '/auth/login', payload: { email: CUSTOMER_EMAIL, password: 'new-pass-123' } })).statusCode).toBe(200);

    const a = await req('POST', '/me/addresses', token, { label: 'Home', address: 'Al Olaya, Riyadh', lat: 24.69, lng: 46.68, details: { district: 'Al Olaya' } });
    expect(a.statusCode).toBe(201);
    expect((await req('GET', '/me/addresses', token)).json()).toHaveLength(1);
    expect((await req('DELETE', `/me/addresses/${a.json().id}`, token)).statusCode).toBe(204);
    expect((await req('GET', '/me/addresses', token)).json()).toHaveLength(0);

    const stats = (await req('GET', '/me/stats', token)).json();
    expect(stats).toMatchObject({ moves: 0, active: 0, completed: 0, has_password: true });
  });
});

describe('maps (Hudhud)', () => {
  it('is off without a key', async () => {
    const token = await login(ctx.app, CUSTOMER_EMAIL);
    expect((await req('GET', '/geo/config', token)).json()).toEqual({ provider: 'device', map_style_url: null });
    expect((await req('GET', '/geo/reverse?lat=24.7&lng=46.7', token)).statusCode).toBe(501);
  });

  it('normalises reverse geocoding with the national address short code', async () => {
    const calls: { url: string; auth: string | null; body: unknown }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get('authorization'), body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ ok: true, data: {
        display_name: 'Riyadh Zoo, Mosab Ibn Umair St, Al Malaz, Riyadh 12832', name: 'Riyadh Zoo', lat: '24.6756', lon: '46.7386',
        shortcode: 'RRHC2680',
        address: { road: 'Mosab Ibn Umair St', neighbourhood: 'Al Malaz District', city: 'Riyadh', province: 'Riyadh Province', postcode: '12832' },
      } }), { status: 200 });
    }) as unknown as typeof fetch;
    const h = new Hudhud({ ...ctx.deps.config, HUDHUD_SECRET_KEY: 'sk_test', HUDHUD_BASE_URL: 'https://b.hudhud.sa/v1' }, fake);
    const a = await h.reverse(24.6756, 46.7386);
    expect(calls[0]).toEqual({ url: 'https://b.hudhud.sa/v1/geocoding/reverse_with_shortcode', auth: 'Bearer sk_test', body: { lat: 24.6756, lon: 46.7386 } });
    expect(a).toEqual({
      display_name: 'Riyadh Zoo, Mosab Ibn Umair St, Al Malaz, Riyadh 12832', place_name: 'Riyadh Zoo', lat: 24.6756, lng: 46.7386,
      street: 'Mosab Ibn Umair St', district: 'Al Malaz District', city: 'Riyadh', province: 'Riyadh Province', postal_code: '12832', short_code: 'RRHC2680',
    });
  });
});

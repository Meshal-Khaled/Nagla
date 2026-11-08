import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { processNextJob } from '../src/modules/jobs/queue.js';
import {
  bearer, companyId, createMove, CUSTOMER_EMAIL, draftWithItems, login, setup, type TestCtx, uploadPhotos,
} from './helpers.js';

let ctx: TestCtx;
beforeEach(async () => {
  await ctx?.close();
  ctx = await setup();
});
afterAll(() => ctx.close());

const get = async (url: string, token: string) => (await ctx.app.inject({ method: 'GET', url, headers: bearer(token) })).json();

describe('detection job', () => {
  it('sends one call per room, assigns labels, and re-running never duplicates labels', async () => {
    const { token, moveId } = await draftWithItems(ctx);
    expect(ctx.deps.ai.calls.map((c) => [c.room, c.photos.length])).toEqual([['bedroom_1', 2], ['living_room', 1]]);
    expect(ctx.deps.ai.calls[0].categories).toContain('other');

    const labels = async () => (await get(`/moves/${moveId}`, token)).items.map((i: { label: string }) => i.label).sort();
    const first = await labels();
    expect(first).toEqual(['bed_frame_1', 'bedside_table_1', 'bedside_table_2', 'coffee_table_1', 'couch_1', 'television_1', 'wardrobe_1']);

    const job = await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/plan`, headers: bearer(token) });
    expect(job.statusCode).toBe(202);
    await processNextJob(ctx.deps);
    expect(await labels()).toEqual(first);

    const status = await get(`/jobs/${job.json().job_id}`, token);
    expect(status.status).toBe('done');
  });

  it('keeps manual items and numbers AI items after them', async () => {
    const { token, moveId } = await draftWithItems(ctx);
    const couch = (await get('/catalog?q=couch', token))[0];
    await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/items`, headers: bearer(token), payload: { catalog_id: couch.id } });
    await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/plan`, headers: bearer(token) });
    await processNextJob(ctx.deps);
    const items = (await get(`/moves/${moveId}`, token)).items.filter((i: { category: string }) => i.category === 'couch');
    expect(items.map((i: { label: string; source: string }) => `${i.label}:${i.source}`).sort()).toEqual(['couch_2:manual', 'couch_3:ai']);
  });

  it('marks the job failed and writes nothing when the AI fails', async () => {
    const token = await login(ctx.app, CUSTOMER_EMAIL);
    const moveId = await createMove(ctx.app, token);
    await uploadPhotos(ctx.app, token, moveId, 'bedroom_1');
    ctx.deps.ai.handler = () => {
      throw new Error('AI service error 422 for room bedroom_1: invalid_model_output');
    };
    const job = (await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/plan`, headers: bearer(token) })).json();
    await processNextJob(ctx.deps);
    const status = await get(`/jobs/${job.job_id}`, token);
    expect(status.status).toBe('failed');
    expect(status.error).toMatch(/invalid_model_output/);
    expect((await get(`/moves/${moveId}`, token)).items).toHaveLength(0);
  });

  it('maps unknown categories to other and ignores sightings on foreign photos', async () => {
    const token = await login(ctx.app, CUSTOMER_EMAIL);
    const moveId = await createMove(ctx.app, token);
    const [p] = await uploadPhotos(ctx.app, token, moveId, 'garage');
    ctx.deps.ai.handler = (req) => ({ room: req.room, items: [
      { category: 'piano', size_class: 'large', sightings: [{ photo_id: p.id }] },
      { category: 'bed_frame', size_class: 'large', sightings: [{ photo_id: 'someone-elses-photo' }] },
    ] });
    await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/plan`, headers: bearer(token) });
    await processNextJob(ctx.deps);
    const items = (await get(`/moves/${moveId}`, token)).items;
    expect(items.map((i: { label: string }) => i.label)).toEqual(['other_1']);
  });
});

describe('review', () => {
  it('merge keeps all detections on the kept item and does not renumber', async () => {
    const { token, moveId } = await draftWithItems(ctx);
    const move = await get(`/moves/${moveId}`, token);
    const [n1, n2] = move.items.filter((i: { category: string }) => i.category === 'bedside_table');
    const detsBefore = move.photos.flatMap((p: { detections: { item_id: string }[] }) => p.detections)
      .filter((d: { item_id: string }) => [n1.id, n2.id].includes(d.item_id)).length;

    const res = await ctx.app.inject({
      method: 'POST', url: `/moves/${moveId}/items/merge`, headers: bearer(token), payload: { keep_id: n2.id, merge_ids: [n1.id] },
    });
    expect(res.statusCode).toBe(200);
    const after = res.json();
    const nights = after.items.filter((i: { category: string }) => i.category === 'bedside_table');
    expect(nights.map((i: { label: string }) => i.label)).toEqual(['bedside_table_2']);
    const dets = after.photos.flatMap((p: { detections: { item_id: string }[] }) => p.detections)
      .filter((d: { item_id: string }) => d.item_id === n2.id);
    expect(dets).toHaveLength(detsBefore);
  });

  it('edits quantity, disposition and category (new label), deletes, and blocks edits after confirm', async () => {
    const { token, moveId } = await draftWithItems(ctx);
    const move = await get(`/moves/${moveId}`, token);
    const tv = move.items.find((i: { category: string }) => i.category === 'television');
    const armchair = (await get('/catalog?q=armchair', token))[0];

    let res = await ctx.app.inject({
      method: 'PATCH', url: `/items/${tv.id}`, headers: bearer(token), payload: { quantity: 2, disposition: 'sell', catalog_id: armchair.id },
    });
    const edited = res.json().items.find((i: { id: string }) => i.id === tv.id);
    expect(edited).toMatchObject({ label: 'armchair_1', quantity: 2, disposition: 'sell' });

    res = await ctx.app.inject({ method: 'DELETE', url: `/items/${tv.id}`, headers: bearer(token) });
    expect(res.json().items.find((i: { id: string }) => i.id === tv.id)).toBeUndefined();

    await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/confirm`, headers: bearer(token), payload: { company_id: await companyId(ctx.db, 'Fast Move') } });
    const blocked = await ctx.app.inject({ method: 'PATCH', url: `/items/${move.items[0].id}`, headers: bearer(token), payload: { quantity: 5 } });
    expect(blocked.statusCode).toBe(409);
  });
});

describe('quotes and confirm', () => {
  it('gives the same offers for the same inventory, one per company', async () => {
    const { token, moveId } = await draftWithItems(ctx);
    const a = await get(`/moves/${moveId}/quotes`, token);
    const b = await get(`/moves/${moveId}/quotes`, token);
    expect(a).toEqual(b);
    expect(a.offers.map((o: { company_name: string }) => o.company_name).sort()).toEqual(['Al-Saqr Movers', 'Fast Move']);
  });

  it('requires details and a keep item before confirming', async () => {
    const token = await login(ctx.app, CUSTOMER_EMAIL);
    const moveId = await createMove(ctx.app, token);
    const res = await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/confirm`, headers: bearer(token), payload: { company_id: await companyId(ctx.db, 'Fast Move') } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('missing_details');
  });

  it('snapshots volumes and price: later catalog or price changes do not change the move', async () => {
    const { token, moveId } = await draftWithItems(ctx);
    const saqr = await companyId(ctx.db, 'Al-Saqr Movers');
    const offer = (await get(`/moves/${moveId}/quotes`, token)).offers.find((o: { company_id: string }) => o.company_id === saqr);

    const res = await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/confirm`, headers: bearer(token), payload: { company_id: saqr } });
    expect(res.statusCode).toBe(200);
    const confirmed = res.json();
    expect(confirmed).toMatchObject({ status: 'confirmed', current_stage: 'confirmed', company_id: saqr });
    expect(confirmed.agent_token_hash).toBeUndefined();
    expect(confirmed.quote.price_halalas).toBe(offer.price_halalas);
    expect(ctx.deps.notifier.confirmed).toEqual([moveId]);

    // change the world
    await ctx.catalogDb.updateTable('furniture_catalog').set({ w_cm: 999 }).execute();
    await ctx.deps.catalog.reload();
    await ctx.db.updateTable('company_trucks').set({ price_halalas: 1 }).execute();

    const after = await get(`/moves/${moveId}`, token);
    expect(after.quote.price_halalas).toBe(offer.price_halalas);
    expect(after.items.map((i: { volume_m3: number }) => i.volume_m3)).toEqual(confirmed.items.map((i: { volume_m3: number }) => i.volume_m3));
    const quotes = await get(`/moves/${moveId}/quotes`, token);
    expect(quotes).toMatchObject({ locked: true, offers: [{ price_halalas: offer.price_halalas }] });
    const sheet = await get(`/moves/${moveId}/job-sheet`, token);
    expect(sheet.totals.volume_m3).toBeLessThan(50);

    const twice = await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/confirm`, headers: bearer(token), payload: { company_id: saqr } });
    expect(twice.statusCode).toBe(409);
  });
});

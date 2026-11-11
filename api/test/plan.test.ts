import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, companyId, CUSTOMER_EMAIL, draftWithItems, login, setup, type TestCtx } from './helpers.js';
import { timeline } from '../src/modules/plan/plan.js';
import type { Offer } from '../src/modules/quotes/estimator.js';

let ctx: TestCtx;
beforeEach(async () => {
  await ctx?.close();
  ctx = await setup();
});
afterAll(() => ctx.close());

const get = async (url: string, token: string) => (await ctx.app.inject({ method: 'GET', url, headers: bearer(token) })).json();
const t2 = (en: string) => ({ ar: `ع ${en}`, en });
const IN_20_DAYS = new Date(Date.now() + 20 * 86400_000).toISOString().slice(0, 10);

async function planned() {
  const { token, moveId } = await draftWithItems(ctx);
  const move = await get(`/moves/${moveId}`, token);
  // one item goes to "sell": it is in the checklist, never in the truck
  const sold = move.items.find((i: { category: string }) => i.category === 'coffee_table');
  // the move is always 20 days away, so every "before the day" group applies whenever the tests run
  await ctx.app.inject({ method: 'PATCH', url: `/moves/${moveId}`, headers: bearer(token), payload: { date_from: IN_20_DAYS, date_to: IN_20_DAYS } });
  await ctx.app.inject({ method: 'PATCH', url: `/items/${sold.id}`, headers: bearer(token), payload: { disposition: 'sell' } });
  const company = await companyId(ctx.db, 'Al-Saqr Movers');
  const plan = (payload: object = {}) =>
    ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/move-plan`, headers: bearer(token), payload: { company_id: company, ...payload } });
  const keepIds = move.items.filter((i: { id: string }) => i.id !== sold.id).map((i: { id: string }) => i.id).sort();
  return { token, moveId, company, plan, keepIds, soldId: sold.id as string };
}

const loadIds = (p: { load_order: { items: { id: string }[] }[] }) => p.load_order.flatMap((g) => g.items.map((i) => i.id));

describe('moving plan (booking step 5)', () => {
  it('without the AI: a basic plan from the facts, every keep item loaded once', async () => {
    const { plan, keepIds, soldId } = await planned();
    const res = await plan();
    expect(res.statusCode).toBe(200);
    const p = res.json();
    expect(p).toMatchObject({ version: 1, source: 'basic', facts: { start_time: '09:00', date: IN_20_DAYS, days_until: 20, pickup_floor: 3, pickup_elevator: false } });
    expect(p.day.map((d: { key: string }) => d.key)).toEqual(['arrive', 'dismantle', 'load', 'drive', 'unload', 'assemble', 'check']);
    expect(p.day[0].start).toBe('09:00');
    expect(p.facts.end_time).toBe(p.day.at(-1).end);
    expect(loadIds(p).sort()).toEqual(keepIds);
    expect(loadIds(p)).not.toContain(soldId);
    expect(JSON.stringify(p.before)).toMatch(/List for sale: [^"]*coffee table/i); // the item to sell
    expect(JSON.stringify(p.before)).toContain('Floor 3 has no elevator');
  });

  it('with the AI: its wording, but only known steps and items; left-out items are added at the end', async () => {
    const { plan, keepIds, soldId } = await planned();
    ctx.deps.ai.planHandler = (facts) => ({
      headline: t2('Your plan'), summary: t2('Simple.'),
      before: [{ when: 'week', tasks: [t2('Sell the table')] }],
      day_notes: [{ key: 'load', note: t2('Bed first') }, { key: 'party', note: t2('nope') }],
      load_order: [{ title: t2('Bedroom'), item_ids: [facts.items[0].id, facts.items[0].id, 'not-an-id', soldId] }],
      tips: [t2('Tip')],
    });
    const p = (await plan()).json();
    expect(p.source).toBe('ai');
    expect(p.headline.en).toBe('Your plan');
    expect(p.day.find((d: { key: string }) => d.key === 'load').note.en).toBe('Bed first');
    expect(p.day.some((d: { key: string }) => d.key === 'party')).toBe(false);
    expect(loadIds(p).sort()).toEqual(keepIds); // once each, the sold item and the unknown id dropped
    expect(p.load_order.at(-1).title.en).toBe('Everything else');
    // the AI got the facts, never asked for prices
    expect(ctx.deps.ai.planCalls[0]).toMatchObject({ start_time: '09:00', crew: expect.any(Number), truck: expect.any(String) });
    expect(JSON.stringify(ctx.deps.ai.planCalls[0])).not.toContain('price');
  });

  it('falls back to the basic plan when the AI answers in the wrong shape', async () => {
    const { plan } = await planned();
    ctx.deps.ai.planHandler = () => ({ headline: 'just text' });
    expect((await plan()).json().source).toBe('basic');
  });

  it('keeps the plan while nothing changes; asks again on refresh or when the items change', async () => {
    const { token, moveId, plan } = await planned();
    ctx.deps.ai.planHandler = () => ({
      headline: t2('A'), summary: t2('B'), before: [{ when: 'night', tasks: [t2('C')] }], load_order: [{ title: t2('D'), item_ids: ['x'] }],
    });
    const first = (await plan()).json();
    expect((await plan()).json().created_at).toBe(first.created_at);
    expect(ctx.deps.ai.planCalls).toHaveLength(1);
    await plan({ refresh: true });
    expect(ctx.deps.ai.planCalls).toHaveLength(2);
    const item = (await get(`/moves/${moveId}`, token)).items[0];
    await ctx.app.inject({ method: 'PATCH', url: `/items/${item.id}`, headers: bearer(token), payload: { quantity: 3 } });
    await plan();
    expect(ctx.deps.ai.planCalls).toHaveLength(3);
  });

  it('confirming locks in the plan the customer saw; the draft copy is never shown', async () => {
    const { token, moveId, company, plan } = await planned();
    ctx.deps.ai.planHandler = () => ({
      headline: t2('Seen'), summary: t2('B'), before: [{ when: 'night', tasks: [t2('C')] }], load_order: [{ title: t2('D'), item_ids: ['x'] }],
    });
    const seen = (await plan()).json();
    expect((await get(`/moves/${moveId}`, token)).plan_draft).toBeUndefined();
    const res = await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/confirm`, headers: bearer(token), payload: { company_id: company } });
    expect(res.statusCode).toBe(200);
    const move = await get(`/moves/${moveId}`, token);
    expect(move.plan).toMatchObject({ source: 'ai', hash: seen.hash, headline: { en: 'Seen' } });
    expect(move.plan_draft).toBeUndefined();
    // a confirmed move has no step 5 any more
    expect((await plan()).statusCode).toBe(409);
  });

  it('confirming without opening step 5 still stores a (basic) plan', async () => {
    const { token, moveId, company } = await planned();
    await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/confirm`, headers: bearer(token), payload: { company_id: company } });
    expect((await get(`/moves/${moveId}`, token)).plan).toMatchObject({ source: 'basic', company_id: company });
    expect(ctx.deps.ai.planCalls).toHaveLength(0);
  });

  it('only the owner, only a company that can take it', async () => {
    const { moveId, plan } = await planned();
    const other = await login(ctx.app, CUSTOMER_EMAIL.replace('@', '2@')).catch(() => null);
    if (other) {
      const res = await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/move-plan`, headers: bearer(other), payload: { company_id: await companyId(ctx.db, 'Al-Saqr Movers') } });
      expect(res.statusCode).toBeGreaterThanOrEqual(403);
    }
    expect((await plan({ company_id: '00000000-0000-4000-8000-000000000000' })).json().error).toBe('company_unavailable');
  });
});

describe('the move-day timeline', () => {
  const offer = { volume_m3: 10, trips: 2, crew_size: 3 } as Offer;
  const item = { id: 'a', name_ar: 'a', name_en: 'a', quantity: 2, room: 'x', fragile: false, dismantle_minutes: 15, volume_m3: 1, disposition: 'keep' as const };

  it('splits the work over the steps, drives back and forth for several trips, and skips empty steps', () => {
    const steps = timeline('22:30', [item], offer, 6, 15);
    expect(steps.map((s) => [s.key, s.minutes])).toEqual([
      ['arrive', 15], ['dismantle', 15], ['load', 33], ['drive', 120], ['unload', 27], ['assemble', 15], ['check', 15],
    ]);
    expect(steps[0].start).toBe('22:30');
    expect(steps.at(-1)!.end).toBe('02:30'); // past midnight wraps around
    expect(timeline('09:00', [{ ...item, dismantle_minutes: 0 }], offer, 6, null).some((s) => s.key === 'dismantle')).toBe(false);
  });
});

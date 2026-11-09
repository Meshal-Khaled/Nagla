import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { nextStagesFor, planTransition } from '../src/modules/tracking/stages.js';
import { bearer, companyId, CUSTOMER_EMAIL, draftWithItems, FAST_ADMIN, jpeg, login, multipart, SAQR_ADMIN, setup, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let customer: string;
let admin: string;
let moveId: string;
let agentToken: string;

beforeEach(async () => {
  await ctx?.close();
  ctx = await setup();
  ({ token: customer, moveId } = await draftWithItems(ctx));
  await ctx.app.inject({
    method: 'POST', url: `/moves/${moveId}/confirm`, headers: bearer(customer),
    payload: { company_id: await companyId(ctx.db, 'Al-Saqr Movers') },
  });
  admin = await login(ctx.app, SAQR_ADMIN);
  const link = (await ctx.app.inject({ method: 'POST', url: `/company/moves/${moveId}/agent-link`, headers: bearer(admin) })).json();
  agentToken = link.agent_link.split('/agent/')[1];
});
afterAll(() => ctx.close());

let n = 0;
const key = () => `test-key-${++n}-${Date.now()}`;

function asAdmin(stage: string, idempotency_key = key()) {
  return ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/events`, headers: bearer(admin), payload: { stage, idempotency_key } });
}
function asAgent(stage: string, idempotency_key = key(), token = agentToken) {
  return ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/events`, headers: { 'x-agent-token': token }, payload: { stage, idempotency_key } });
}
const events = async () => ctx.db.selectFrom('move_events').selectAll().where('move_id', '=', moveId).orderBy('created_at').execute();

describe('stage rules', () => {
  it('planTransition: forward only, skipped stages, roles', () => {
    expect(planTransition('agent', 'accepted', 'loading').skipped).toEqual(['crew_assigned', 'on_the_way', 'arrived_pickup']);
    expect(() => planTransition('agent', 'loading', 'on_the_way')).toThrow(/back/);
    expect(() => planTransition('agent', 'confirmed', 'on_the_way')).toThrow(/not accepted/);
    expect(() => planTransition('agent', 'accepted', 'crew_assigned')).toThrow(/cannot set/);
    expect(() => planTransition('customer', 'on_the_way', 'cancelled')).toThrow(/cancel/);
    expect(() => planTransition('company_admin', 'completed', 'cancelled')).toThrow(/already/);
    expect(nextStagesFor('company_admin', 'confirmed')).toEqual(['accepted', 'crew_assigned', 'rejected', 'cancelled']);
  });
});

describe('events endpoint', () => {
  it('a double tap with the same key writes one event', async () => {
    const k = key();
    expect((await asAdmin('accepted', k)).json().result).toBe('created');
    expect((await asAdmin('accepted', k)).json().result).toBe('duplicate');
    expect((await events()).filter((e) => e.stage === 'accepted')).toHaveLength(1);
  });

  it('concurrent taps with different keys at the same stage write one event', async () => {
    await asAdmin('accepted');
    const results = await Promise.all([asAgent('on_the_way'), asAgent('on_the_way'), asAgent('on_the_way')]);
    expect(results.map((r) => r.json().result).sort()).toEqual(['created', 'noop', 'noop']);
    expect((await events()).filter((e) => e.stage === 'on_the_way')).toHaveLength(1);
  });

  it('rejects a backward stage and logs skipped stages', async () => {
    await asAdmin('accepted');
    const res = await asAgent('loading');
    expect(res.statusCode).toBe(200);
    const ev = await events();
    expect(ev.map((e) => `${e.stage}${e.skipped ? '*' : ''}`)).toEqual(['confirmed', 'accepted', 'crew_assigned*', 'on_the_way*', 'arrived_pickup*', 'loading']);
    expect((await asAgent('on_the_way')).statusCode).toBe(409);
    expect(res.json().tracking.progress).toEqual({ index: 5, total: 10, percent: 50 });
  });

  it('checks who may set which stage', async () => {
    expect((await asAgent('accepted')).statusCode).toBe(403);
    await asAdmin('accepted');
    expect((await asAdmin('on_the_way')).statusCode).toBe(403);
    const cust = await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/events`, headers: bearer(customer), payload: { stage: 'loaded', idempotency_key: key() } });
    expect(cust.statusCode).toBe(403);
    // another company's admin cannot even see the move
    const other = await login(ctx.app, FAST_ADMIN);
    const res = await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/events`, headers: bearer(other), payload: { stage: 'accepted', idempotency_key: key() } });
    expect(res.statusCode).toBe(404);
  });

  it('runs the whole line to completed and then expires the agent link', async () => {
    await asAdmin('accepted');
    await asAdmin('crew_assigned');
    for (const s of ['on_the_way', 'arrived_pickup', 'loading', 'loaded', 'in_transit', 'arrived_destination', 'unloading', 'completed']) {
      expect((await asAgent(s)).statusCode).toBe(200);
    }
    const tracking = (await ctx.app.inject({ method: 'GET', url: `/moves/${moveId}/tracking`, headers: bearer(customer) })).json();
    expect(tracking.progress.percent).toBe(100);
    expect(tracking.events).toHaveLength(11);
    expect(ctx.deps.notifier.stages.at(-1)).toEqual([moveId, 'completed']);

    expect((await asAgent('completed')).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: `/agent/${agentToken}` })).statusCode).toBe(404);
  });

  it('accepts an optional photo from the agent and serves it via a signed URL', async () => {
    await asAdmin('accepted');
    const mp = multipart({ stage: 'on_the_way', idempotency_key: key() }, [{ name: 'photo', data: await jpeg({ gps: true }) }]);
    const res = await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/events`, headers: { 'x-agent-token': agentToken, ...mp.headers }, payload: mp.payload });
    expect(res.statusCode).toBe(200);
    const ev = res.json().tracking.events.find((e: { stage: string }) => e.stage === 'on_the_way');
    expect((await ctx.app.inject({ method: 'GET', url: ev.photo_url })).statusCode).toBe(200);
  });

  it('cancel: allowed before on_the_way, not after; rejected only from confirmed', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/cancel`, headers: bearer(customer) });
    expect(res.json()).toMatchObject({ result: 'created', tracking: { status: 'cancelled', current_stage: 'cancelled', progress: null } });

    // a fresh move for the "too late" case
    const second = await draftWithItems(ctx);
    moveId = second.moveId;
    await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/confirm`, headers: bearer(customer), payload: { company_id: await companyId(ctx.db, 'Al-Saqr Movers') } });
    agentToken = (await ctx.app.inject({ method: 'POST', url: `/company/moves/${moveId}/agent-link`, headers: bearer(admin) })).json().agent_link.split('/agent/')[1];
    await asAdmin('accepted');
    expect((await asAdmin('rejected')).statusCode).toBe(409);
    await asAgent('on_the_way');
    expect((await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/cancel`, headers: bearer(customer) })).statusCode).toBe(409);
  });

  it('keeps the cancel reason and the customer’s own words', async () => {
    const draft = (await ctx.app.inject({ method: 'POST', url: '/moves', headers: bearer(customer) })).json().id;
    const bad = await ctx.app.inject({ method: 'POST', url: `/moves/${draft}/cancel`, headers: bearer(customer), payload: { reason: 'nope' } });
    expect(bad.statusCode).toBe(400);
    const res = await ctx.app.inject({ method: 'POST', url: `/moves/${draft}/cancel`, headers: bearer(customer), payload: { reason: 'other', note: 'Staying one more year' } });
    expect(res.json().tracking.status).toBe('cancelled');
    const move = (await ctx.app.inject({ method: 'GET', url: `/moves/${draft}`, headers: bearer(customer) })).json();
    expect(move).toMatchObject({ cancel_reason: 'other', cancel_note: 'Staying one more year' });
  });

  it('a draft can be cancelled by its customer', async () => {
    const draft = (await ctx.app.inject({ method: 'POST', url: '/moves', headers: bearer(customer) })).json().id;
    const res = await ctx.app.inject({ method: 'POST', url: `/moves/${draft}/cancel`, headers: bearer(customer) });
    expect(res.json().tracking.status).toBe('cancelled');
  });
});

describe('agent page and company list', () => {
  it('shows buttons only once accepted, and lists the move for the company', async () => {
    let html = (await ctx.app.inject({ method: 'GET', url: `/agent/${agentToken}` })).body;
    expect(html).toContain('Waiting for the company');
    await asAdmin('accepted');
    html = (await ctx.app.inject({ method: 'GET', url: `/agent/${agentToken}` })).body;
    expect(html).toContain('data-stage="on_the_way"');
    expect(html).toContain('Load order');

    const list = (await ctx.app.inject({ method: 'GET', url: '/company/moves?scope=active', headers: bearer(admin) })).json();
    expect(list.map((m: { id: string }) => m.id)).toEqual([moveId]);
    const other = await login(ctx.app, FAST_ADMIN);
    expect((await ctx.app.inject({ method: 'GET', url: '/company/moves', headers: bearer(other) })).json()).toEqual([]);
  });

  it('a new agent link replaces the old one', async () => {
    const fresh = (await ctx.app.inject({ method: 'POST', url: `/company/moves/${moveId}/agent-link`, headers: bearer(admin) })).json();
    expect((await ctx.app.inject({ method: 'GET', url: `/agent/${agentToken}` })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'GET', url: fresh.agent_link.replace(ctx.deps.config.PUBLIC_URL, '') })).statusCode).toBe(200);
  });

  it('registers device tokens', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/devices', headers: bearer(customer), payload: { token: 'fcm-token-1234567890', platform: 'android' } });
    expect(res.statusCode).toBe(204);
    const rows = await ctx.db.selectFrom('device_tokens').selectAll().execute();
    expect(rows).toHaveLength(1);
  });

  it('the dev customer can log in with the seed password', async () => {
    expect(await login(ctx.app, CUSTOMER_EMAIL)).toBeTruthy();
  });
});

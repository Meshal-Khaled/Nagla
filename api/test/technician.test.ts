import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, companyId, draftWithItems, FAST_ADMIN, login, SAQR_ADMIN, setup, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let customer: string;
let admin: string;
let tech: string;
let techId: string;
let moveId: string;

let n = 0;
const key = () => `tech-key-${++n}-${Date.now()}`;

beforeEach(async () => {
  await ctx?.close();
  ctx = await setup();
  ({ token: customer, moveId } = await draftWithItems(ctx));
  await ctx.app.inject({
    method: 'POST', url: `/moves/${moveId}/confirm`, headers: bearer(customer),
    payload: { company_id: await companyId(ctx.db, 'Al-Saqr Movers') },
  });
  admin = await login(ctx.app, SAQR_ADMIN);
  tech = await login(ctx.app, 'tech@saqr.test');
  techId = (await ctx.db.selectFrom('users').select('id').where('email', '=', 'tech@saqr.test').executeTakeFirstOrThrow()).id;
});
afterAll(() => ctx.close());

const get = (url: string, token = tech) => ctx.app.inject({ method: 'GET', url, headers: bearer(token) });
const post = (url: string, payload: object, token = tech) => ctx.app.inject({ method: 'POST', url, headers: bearer(token), payload });
const status = (stage: string, idempotency_key = key()) => post(`/tech/tasks/${moveId}/status`, { stage, idempotency_key });
const accept = () => post(`/moves/${moveId}/events`, { stage: 'accepted', idempotency_key: key() }, admin);
const assign = (agent_id = techId, token = admin) => post(`/company/moves/${moveId}/assign`, { agent_id }, token);

describe('assignment', () => {
  it('needs the move accepted first, then sets crew_assigned and shows the task', async () => {
    expect((await assign()).statusCode).toBe(409);
    expect((await get('/tech/tasks')).json()).toEqual([]);

    await accept();
    const res = await assign();
    expect(res.statusCode).toBe(200);
    expect(res.json().tracking.current_stage).toBe('crew_assigned');

    const tasks = (await get('/tech/tasks?scope=assigned')).json();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: moveId, bucket: 'assigned', current_stage: 'crew_assigned' });
    expect(tasks[0].move_no).toBeGreaterThanOrEqual(2800);

    const summary = (await get('/tech/summary')).json();
    expect(summary.counts).toEqual({ assigned: 1, in_progress: 0, completed: 0 });
    expect(summary.next_task.id).toBe(moveId);
    expect((await get('/company/moves', admin)).json()[0].assigned_agent_name).toBe('Ahmed Al-Yousef');
  });

  it('rejects a technician from another company and non-admins', async () => {
    await accept();
    const other = (await ctx.db.selectFrom('users').select('id').where('email', '=', 'tech@fastmove.test').executeTakeFirstOrThrow()).id;
    expect((await assign(other)).statusCode).toBe(400);
    expect((await assign(techId, tech)).statusCode).toBe(403);
    expect((await assign(techId, await login(ctx.app, FAST_ADMIN))).statusCode).toBe(404);
  });

  it('cannot re-assign once the crew is on the way', async () => {
    await accept();
    await assign();
    await status('on_the_way');
    expect((await assign()).statusCode).toBe(409);
  });
});

describe('technician journey', () => {
  beforeEach(async () => {
    await accept();
    await assign();
  });

  it('shows task details with addresses, navigation, services and the status checklist', async () => {
    const d = (await get(`/tech/tasks/${moveId}`)).json();
    expect(d.customer.name).toBe('Test Customer');
    expect(d.pickup.address).toBeTruthy();
    expect(d.pickup.navigation_url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);
    expect(d.services).toContain('moving');
    expect(d.statuses.map((s: { stage: string }) => s.stage)).toEqual([
      'on_the_way', 'arrived_pickup', 'loading', 'loaded', 'in_transit', 'arrived_destination', 'unloading', 'completed',
    ]);
    expect(d.statuses.every((s: { done: boolean }) => !s.done)).toBe(true);
    expect(d.recommended_next).toBe('on_the_way');
    expect(d.job_sheet.load_order.length).toBeGreaterThan(0);
  });

  it('runs the statuses to completed, ignores double taps, refuses going back', async () => {
    expect((await status('on_the_way')).json().result).toBe('created');
    const k = key();
    expect((await status('arrived_pickup', k)).json().result).toBe('created');
    expect((await status('arrived_pickup', k)).json().result).toBe('duplicate');
    expect((await status('arrived_pickup')).json().result).toBe('noop');
    expect((await status('on_the_way')).statusCode).toBe(409);
    expect((await get('/tech/summary')).json().counts).toEqual({ assigned: 0, in_progress: 1, completed: 0 });

    // skipping to in_transit logs loading + loaded as skipped
    await status('in_transit');
    const d = (await get(`/tech/tasks/${moveId}`)).json();
    expect(d.statuses.filter((s: { done: boolean }) => s.done).map((s: { stage: string }) => s.stage))
      .toEqual(['on_the_way', 'arrived_pickup', 'loading', 'loaded', 'in_transit']);
    expect(d.events.filter((e: { skipped: boolean }) => e.skipped).map((e: { stage: string }) => e.stage)).toEqual(['loading', 'loaded']);

    expect((await status('completed')).json().tracking.current_stage).toBe('completed');
    expect((await get('/tech/tasks?scope=completed')).json()).toHaveLength(1);
    expect((await get(`/tech/tasks/${moveId}`)).json().duration_minutes).toBe(0);
  });

  it('cannot set company stages', async () => {
    expect((await status('cancelled')).statusCode).toBe(409);
  });

  it('hides unassigned moves from other technicians', async () => {
    const res = await post('/company/agents', { name: 'Second', email: 'second@saqr.test', password: 'second-pass' }, admin);
    expect(res.statusCode).toBe(201);
    const second = await login(ctx.app, 'second@saqr.test', 'second-pass');
    expect((await get(`/tech/tasks/${moveId}`, second)).statusCode).toBe(404);
    expect((await post(`/tech/tasks/${moveId}/status`, { stage: 'on_the_way', idempotency_key: key() }, second)).statusCode).toBe(404);
    // the generic events endpoint applies the same rule
    expect((await post(`/moves/${moveId}/events`, { stage: 'on_the_way', idempotency_key: key() }, second)).statusCode).toBe(403);
    expect((await get(`/moves/${moveId}/messages`, second)).statusCode).toBe(404);
  });

  it('rates both ways after completion and shows the rating on the profile', async () => {
    expect((await post(`/tech/tasks/${moveId}/rate-client`, { stars: 5 })).statusCode).toBe(409);
    expect((await post(`/moves/${moveId}/rating`, { stars: 4 }, customer)).statusCode).toBe(409);
    await status('completed');

    expect((await post(`/tech/tasks/${moveId}/rate-client`, { stars: 5, comment: 'Ready on time' })).statusCode).toBe(201);
    expect((await post(`/tech/tasks/${moveId}/rate-client`, { stars: 4 })).statusCode).toBe(409);
    expect((await post(`/tech/tasks/${moveId}/rate-client`, { stars: 6 })).statusCode).toBe(400);
    expect((await post(`/moves/${moveId}/rating`, { stars: 4, comment: 'Careful crew' }, customer)).statusCode).toBe(201);

    const profile = (await get('/tech/profile')).json();
    expect(profile).toMatchObject({ name: 'Ahmed Al-Yousef', company_name: 'Al-Saqr Movers', completed_moves: 1 });
    expect(profile.rating).toEqual({ average: 4, count: 1 });
    expect(profile.recent_reviews[0].comment).toBe('Careful crew');
    expect((await get(`/tech/tasks/${moveId}`)).json().client_rating.stars).toBe(5);
    expect((await get(`/moves/${moveId}/ratings`, customer)).json()).toHaveLength(2);
  });

  it('chats between the customer and the technician', async () => {
    expect((await post(`/moves/${moveId}/messages`, { body: 'On my way soon' })).statusCode).toBe(201);
    expect((await post(`/moves/${moveId}/messages`, { body: 'Thanks!' }, customer)).statusCode).toBe(201);
    expect((await post(`/moves/${moveId}/messages`, { body: '' }, customer)).statusCode).toBe(400);
    const msgs = (await get(`/moves/${moveId}/messages`, customer)).json();
    expect(msgs.map((m: { body: string; sender_role: string }) => [m.sender_role, m.body]))
      .toEqual([['agent', 'On my way soon'], ['customer', 'Thanks!']]);
  });

  it('is only reachable by technicians', async () => {
    expect((await get('/tech/summary', customer)).statusCode).toBe(403);
    expect((await get('/tech/tasks', admin)).statusCode).toBe(403);
  });
});

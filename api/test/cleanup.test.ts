import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { runCleanup } from '../src/modules/cleanup/cleanup.js';
import { bearer, companyId, draftWithItems, setup, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(() => ctx.close());

describe('draft cleanup', () => {
  it('deletes drafts older than 48 h with their files; leaves confirmed and fresh moves', async () => {
    const old = await draftWithItems(ctx);
    const fresh = await draftWithItems(ctx);
    const confirmed = await draftWithItems(ctx);
    await ctx.app.inject({
      method: 'POST', url: `/moves/${confirmed.moveId}/confirm`, headers: bearer(confirmed.token),
      payload: { company_id: await companyId(ctx.db, 'Fast Move') },
    });
    const longAgo = new Date(Date.now() - 49 * 3600_000);
    await ctx.db.updateTable('moves').set({ created_at: longAgo }).where('id', 'in', [old.moveId, confirmed.moveId]).execute();

    expect(existsSync(ctx.deps.storage.abs(old.moveId))).toBe(true);
    const r = await runCleanup(ctx.deps);
    expect(r.drafts_deleted).toBe(1);

    const left = await ctx.db.selectFrom('moves').select('id').execute();
    expect(left.map((m) => m.id).sort()).toEqual([fresh.moveId, confirmed.moveId].sort());
    expect(await ctx.db.selectFrom('photos').select('id').where('move_id', '=', old.moveId).execute()).toHaveLength(0);
    expect(existsSync(ctx.deps.storage.abs(old.moveId))).toBe(false);
    expect(existsSync(ctx.deps.storage.abs(confirmed.moveId))).toBe(true);
  });

  it('purges photos of finished moves after the retention period', async () => {
    const m = await draftWithItems(ctx);
    await ctx.app.inject({
      method: 'POST', url: `/moves/${m.moveId}/confirm`, headers: bearer(m.token),
      payload: { company_id: await companyId(ctx.db, 'Fast Move') },
    });
    await ctx.app.inject({ method: 'POST', url: `/moves/${m.moveId}/cancel`, headers: bearer(m.token) });
    await ctx.db.updateTable('move_events').set({ created_at: new Date(Date.now() - 31 * 86400_000) })
      .where('move_id', '=', m.moveId).execute();

    const r = await runCleanup(ctx.deps);
    expect(r.moves_photos_purged).toBe(1);
    expect(await ctx.db.selectFrom('photos').select('id').where('move_id', '=', m.moveId).execute()).toHaveLength(0);
    // the move and its inventory stay
    expect(await ctx.db.selectFrom('move_items').select('id').where('move_id', '=', m.moveId).execute()).not.toHaveLength(0);
  });
});

describe('dev UI', () => {
  it('is served in development and absent in production', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/dev/index.html' })).statusCode).toBe(200);
    const prod = await buildApp({ ...ctx.deps, config: { ...ctx.deps.config, NODE_ENV: 'production' } });
    expect((await prod.inject({ method: 'GET', url: '/dev/index.html' })).statusCode).toBe(404);
    await prod.close();
  });
});

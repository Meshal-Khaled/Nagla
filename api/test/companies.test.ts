import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { importCompanies, loadDataset, staffEmails } from '../src/db/seed/companies.js';
import { bearer, draftWithItems, login, setup, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeEach(async () => {
  await ctx?.close();
  ctx = await setup();
});
afterAll(() => ctx.close());

describe('companies dataset import', () => {
  it('adds every company with its trucks and prices, links the demo company, and is idempotent', async () => {
    const data = loadDataset();
    expect(data.companies.length).toBe(94);
    const before = await ctx.deps.db.selectFrom('companies').select('id').execute();

    const first = await importCompanies(ctx.deps.db, data);
    // Fast Move's Arabic name (النقل السريع) is company #1 in the sheet: linked, not duplicated
    expect(first).toMatchObject({ created: 93, linked: 1, updated: 0, accounts: 93 * 2 });
    const again = await importCompanies(ctx.deps.db, data);
    expect(again).toMatchObject({ created: 0, linked: 0, updated: 94, accounts: 0 });

    const all = await ctx.deps.db.selectFrom('companies').selectAll().execute();
    expect(all.length).toBe(before.length + 93);

    const fast = all.find((c) => c.name_en === 'Fast Move')!;
    expect(fast.dataset_no).toBe(1);
    expect(fast.bookable).toBe(true);
    expect(fast.city).toBe('الرياض');
    // the demo company keeps its own truck prices (no large truck)
    const fastTrucks = await ctx.deps.db.selectFrom('company_trucks').select('price_halalas').where('company_id', '=', fast.id).execute();
    expect(fastTrucks.map((t) => t.price_halalas).sort()).toEqual([35000, 60000]);

    // a new company: profile, three trucks priced from its apartment move, all its sheet prices, not bookable
    const row = data.companies.find((c) => c.no === 2)!;
    const c2 = all.find((c) => c.dataset_no === 2)!;
    expect(c2).toMatchObject({ name_ar: row.name, phone: row.phone, bookable: true });
    const trucks = await ctx.deps.db.selectFrom('company_trucks').innerJoin('truck_sizes as ts', 'ts.id', 'company_trucks.truck_size_id')
      .select(['ts.name', 'price_halalas']).where('company_id', '=', c2.id).execute();
    const apt = (size: string) => data.prices.find((p) => p.no === 2 && p.service === 'apartment' && p.truck === size)!.price_sar * 100;
    expect(Object.fromEntries(trucks.map((t) => [t.name, t.price_halalas]))).toEqual({ small: apt('small'), medium: apt('medium'), large: apt('large') });
    const prices = await ctx.deps.db.selectFrom('company_service_prices').select(['kind']).where('company_id', '=', c2.id).execute();
    expect(prices.length).toBe(data.prices.filter((p) => p.no === 2).length);
    expect(prices.some((p) => p.kind === 'starting_from')).toBe(true);

    // staff accounts: admin + technician per dataset company (the demo company keeps its own); both can sign in
    const staff = (await ctx.deps.db.selectFrom('users').select(['email', 'role']).where('company_id', '=', c2.id).execute()).sort((a, b) => b.role.localeCompare(a.role));
    expect(staff).toEqual([{ email: staffEmails(2).admin, role: 'company_admin' }, { email: staffEmails(2).tech, role: 'agent' }]);
    expect(await ctx.deps.db.selectFrom('users').select('email').where('company_id', '=', fast.id).where('email', 'like', '%@nagla.test').execute()).toEqual([]);
    const adminToken = await login(ctx.app, staffEmails(2).admin);
    const me = (await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(adminToken) })).json();
    expect(me).toMatchObject({ role: 'company_admin', company_name: row.name });
    await login(ctx.app, staffEmails(2).tech);
  });

  it("offers the companies in the pickup's region that can carry the volume, cheapest first", async () => {
    await importCompanies(ctx.deps.db);
    const { token, moveId } = await draftWithItems(ctx); // pickup "Al Olaya, Riyadh"
    const res = (await ctx.app.inject({ method: 'GET', url: `/moves/${moveId}/quotes`, headers: bearer(token) })).json();
    expect(res.region).toBe('منطقة الرياض');
    const riyadh = loadDataset().companies.filter((c) => c.region === 'منطقة الرياض').length; // includes Fast Move (#1)
    expect(res.companies_checked).toBe(riyadh + 1); // + Al-Saqr, which has no region (works everywhere)
    expect(res.offers.length).toBe(Math.min(20, res.companies_able));
    expect(res.offers.map((o: { company_name: string }) => o.company_name)).toContain('Al-Saqr Movers');
    const prices = res.offers.map((o: { price_halalas: number }) => o.price_halalas);
    expect(prices).toEqual([...prices].sort((a: number, b: number) => a - b));
    expect(res.offers.every((o: { company_city: string | null }) => o.company_city === null || o.company_city === 'الرياض')).toBe(true);

    // a dataset company can be booked, and its admin then sees the move
    const pick = res.offers.find((o: { company_name: string }) => o.company_name !== 'Al-Saqr Movers' && o.company_name !== 'Fast Move');
    const ok = await ctx.app.inject({ method: 'POST', url: `/moves/${moveId}/confirm`, headers: bearer(token), payload: { company_id: pick.company_id } });
    expect(ok.statusCode).toBeLessThan(300);
    const no = (await ctx.deps.db.selectFrom('companies').select('dataset_no').where('id', '=', pick.company_id).executeTakeFirstOrThrow()).dataset_no!;
    const admin = await login(ctx.app, staffEmails(no).admin);
    const incoming = (await ctx.app.inject({ method: 'GET', url: '/company/moves?scope=incoming', headers: bearer(admin) })).json();
    expect(incoming.map((m: { id: string }) => m.id)).toContain(moveId);
  });
});

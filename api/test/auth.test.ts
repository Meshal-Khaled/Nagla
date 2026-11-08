import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, CUSTOMER_EMAIL, login, SAQR_ADMIN, setup, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(() => ctx.close());

describe('auth', () => {
  it('registers a customer, logs in, refreshes with rotation, logs out', async () => {
    const reg = await ctx.app.inject({
      method: 'POST', url: '/auth/register', payload: { name: 'Sara', email: 'Sara@Example.com', password: 'longpassword' },
    });
    expect(reg.statusCode).toBe(201);
    const { refresh_token } = reg.json();

    const dup = await ctx.app.inject({
      method: 'POST', url: '/auth/register', payload: { name: 'Sara', email: 'sara@example.com', password: 'longpassword' },
    });
    expect(dup.statusCode).toBe(409);

    const me = await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(await login(ctx.app, 'SARA@example.com', 'longpassword')) });
    expect(me.json()).toMatchObject({ email: 'sara@example.com', role: 'customer' });

    const r1 = await ctx.app.inject({ method: 'POST', url: '/auth/refresh', payload: { refresh_token } });
    expect(r1.statusCode).toBe(200);
    // the old refresh token is spent
    const r2 = await ctx.app.inject({ method: 'POST', url: '/auth/refresh', payload: { refresh_token } });
    expect(r2.statusCode).toBe(401);

    const next = r1.json().refresh_token;
    expect((await ctx.app.inject({ method: 'POST', url: '/auth/logout', payload: { refresh_token: next } })).statusCode).toBe(204);
    expect((await ctx.app.inject({ method: 'POST', url: '/auth/refresh', payload: { refresh_token: next } })).statusCode).toBe(401);
  });

  it('rejects a wrong password and a bad token', async () => {
    const bad = await ctx.app.inject({ method: 'POST', url: '/auth/login', payload: { email: CUSTOMER_EMAIL, password: 'nope-nope' } });
    expect(bad.statusCode).toBe(401);
    const me = await ctx.app.inject({ method: 'GET', url: '/auth/me', headers: bearer('not-a-jwt') });
    expect(me.statusCode).toBe(401);
  });

  it('returns 501 for Google sign-in when it is not configured', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/auth/google' });
    expect(res.statusCode).toBe(501);
  });

  it('signs in with a Google ID token from the Android SDK (second option)', async () => {
    const { exportJWK, generateKeyPair, createLocalJWKSet, SignJWT } = await import('jose');
    const { useGoogleKeysForTests } = await import('../src/auth/google.js');
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    useGoogleKeysForTests(createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }] }));
    const WEB_ID = 'web-client.apps.googleusercontent.com';
    const token = (claims: Record<string, unknown>, aud = WEB_ID, iss = 'https://accounts.google.com') =>
      new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(iss).setAudience(aud)
        .setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const signIn = (app: typeof ctx.app, id_token: string) => app.inject({ method: 'POST', url: '/auth/google/native', payload: { id_token } });

    // not configured: no Google button, endpoint off
    expect((await ctx.app.inject({ method: 'GET', url: '/auth/google/status' })).json()).toMatchObject({ enabled: false, native: false });
    expect((await signIn(ctx.app, await token({ sub: 'g1', email: 'a@b.test' }))).statusCode).toBe(501);

    const g = await setup({ GOOGLE_CLIENT_ID: WEB_ID });
    try {
      expect((await g.app.inject({ method: 'GET', url: '/auth/google/status' })).json())
        .toEqual({ enabled: true, native: true, web: false, client_id: WEB_ID });

      // new Google user → new customer
      const res = await signIn(g.app, await token({ sub: 'g-new', email: 'New@Gmail.test', email_verified: true, name: 'New User' }));
      expect(res.statusCode).toBe(200);
      const me = (await g.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(res.json().access_token) })).json();
      expect(me).toMatchObject({ email: 'new@gmail.test', role: 'customer', name: 'New User' });
      // same Google account again → same user
      const again = await signIn(g.app, await token({ sub: 'g-new', email: 'new@gmail.test', email_verified: true }));
      expect((await g.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(again.json().access_token) })).json().id).toBe(me.id);

      // verified email of an existing password account → linked, same user
      const linked = await signIn(g.app, await token({ sub: 'g-cust', email: CUSTOMER_EMAIL, email_verified: true }));
      expect((await g.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(linked.json().access_token) })).json().email).toBe(CUSTOMER_EMAIL);
      // unverified email of an existing account → refused, never linked
      expect((await signIn(g.app, await token({ sub: 'g-x', email: SAQR_ADMIN, email_verified: false }))).statusCode).toBe(409);

      // wrong audience, wrong issuer, garbage → 401
      expect((await signIn(g.app, await token({ sub: 'g2', email: 'x@y.test' }, 'other-client'))).statusCode).toBe(401);
      expect((await signIn(g.app, await token({ sub: 'g2', email: 'x@y.test' }, WEB_ID, 'https://evil.test'))).statusCode).toBe(401);
      expect((await signIn(g.app, 'x'.repeat(40))).statusCode).toBe(401);
    } finally {
      await g.close();
    }
  });

  it('exchanges a one-time Google code exactly once', async () => {
    const { createAuthCode } = await import('../src/auth/tokens.js');
    const user = await ctx.db.selectFrom('users').select('id').where('email', '=', CUSTOMER_EMAIL).executeTakeFirstOrThrow();
    const code = await createAuthCode(ctx.db, user.id);
    const ok = await ctx.app.inject({ method: 'POST', url: '/auth/google/exchange', payload: { code } });
    expect(ok.statusCode).toBe(200);
    const again = await ctx.app.inject({ method: 'POST', url: '/auth/google/exchange', payload: { code } });
    expect(again.statusCode).toBe(401);
  });
});

describe('roles', () => {
  // [method, url, customer, company_admin, agent]
  const matrix: [string, string, number, number, number][] = [
    ['POST', '/moves', 201, 403, 403],
    ['GET', '/moves', 200, 403, 403],
    ['GET', '/company/moves', 403, 200, 200],
    ['GET', '/company/agents', 403, 200, 403],
    ['GET', '/catalog', 200, 200, 200],
  ];

  it('lets each role reach only its own endpoints', async () => {
    const customer = await login(ctx.app, CUSTOMER_EMAIL);
    const admin = await login(ctx.app, SAQR_ADMIN);
    const created = await ctx.app.inject({
      method: 'POST', url: '/company/agents', headers: bearer(admin),
      payload: { name: 'Crew lead', email: 'crew@saqr.test', password: 'crew-password' },
    });
    expect(created.statusCode).toBe(201);
    const agent = await login(ctx.app, 'crew@saqr.test', 'crew-password');

    for (const [method, url, ...expected] of matrix) {
      const got = [];
      for (const token of [customer, admin, agent]) {
        got.push((await ctx.app.inject({ method: method as 'GET', url, headers: bearer(token) })).statusCode);
      }
      expect({ url, got }).toEqual({ url, got: expected });
    }
  });

  it('hides another customer’s move', async () => {
    const owner = await login(ctx.app, CUSTOMER_EMAIL);
    const moveId = (await ctx.app.inject({ method: 'POST', url: '/moves', headers: bearer(owner) })).json().id;
    await ctx.app.inject({ method: 'POST', url: '/auth/register', payload: { name: 'Other', email: 'other@x.test', password: 'longpassword' } });
    const other = await login(ctx.app, 'other@x.test', 'longpassword');
    expect((await ctx.app.inject({ method: 'GET', url: `/moves/${moveId}`, headers: bearer(other) })).statusCode).toBe(404);
    // and company users cannot see drafts
    const admin = await login(ctx.app, SAQR_ADMIN);
    expect((await ctx.app.inject({ method: 'GET', url: `/moves/${moveId}`, headers: bearer(admin) })).statusCode).toBe(404);
  });
});

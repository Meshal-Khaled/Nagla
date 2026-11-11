import { hash, verify } from '@node-rs/argon2';
import type { FastifyInstance } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { randomToken } from '../lib/crypto.js';
import { conflict, HttpError, isUniqueViolation, unauthorized } from '../lib/errors.js';
import {
  exchangeGoogleCode, googleAuthUrl, googleConfigured, googleNativeConfigured, type GoogleProfile, verifyGoogleIdToken,
} from './google.js';
import { currentUser, requireAuth } from './guards.js';
import {
  consumeAuthCode, createAuthCode, issueTokens, revokeRefresh, rotateRefresh, signState, verifyState,
} from './tokens.js';

const Register = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});
const Login = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });
const Refresh = z.object({ refresh_token: z.string().min(1) });
export const Phone = z.string().trim().regex(/^\+?[0-9 ]{7,20}$/, 'Enter a phone number');
const GoogleComplete = z.object({
  signup_token: z.string().min(20).max(4096),
  name: z.string().trim().min(1).max(100),
  phone: Phone,
  gender: z.enum(['male', 'female']),
}).strict();
const SIGNUP_TTL = '20m';

export async function authRoutes(app: FastifyInstance, { db, config }: Deps) {
  const secret = config.JWT_SECRET;

  // Only customers self-register. Company admins are seeded; agents are added by their admin.
  app.post('/auth/register', async (req, reply) => {
    const body = Register.parse(req.body);
    try {
      const user = await db.insertInto('users')
        .values({ role: 'customer', name: body.name, email: body.email, password_hash: await hash(body.password) })
        .returning(['id', 'role', 'company_id']).executeTakeFirstOrThrow();
      reply.code(201);
      return issueTokens(db, secret, user);
    } catch (e) {
      if (isUniqueViolation(e, 'users_email_key')) throw conflict('email_taken', 'Email already registered');
      throw e;
    }
  });

  app.post('/auth/login', async (req) => {
    const body = Login.parse(req.body);
    const user = await db.selectFrom('users').select(['id', 'role', 'company_id', 'password_hash'])
      .where((eb) => eb(eb.fn('lower', ['email']), '=', body.email)).executeTakeFirst();
    if (!user?.password_hash || !(await verify(user.password_hash, body.password))) {
      throw unauthorized('Wrong email or password');
    }
    return issueTokens(db, secret, user);
  });

  app.post('/auth/refresh', async (req) => rotateRefresh(db, secret, Refresh.parse(req.body).refresh_token));

  app.post('/auth/logout', async (req, reply) => {
    await revokeRefresh(db, Refresh.parse(req.body).refresh_token);
    reply.code(204);
  });

  app.get('/auth/me', { preHandler: requireAuth(secret) }, async (req) => {
    return db.selectFrom('users')
      .leftJoin('companies', 'companies.id', 'users.company_id')
      .select(['users.id', 'users.name', 'users.email', 'users.phone', 'users.gender', 'users.role', 'users.company_id', 'companies.name_en as company_name'])
      .where('users.id', '=', currentUser(req).id).executeTakeFirstOrThrow();
  });

  // ---- Google sign-in: a second option next to email + password ----

  /** The user of a Google account: by Google id, else link a verified same-email account; undefined when there is none. */
  async function existingForGoogle(profile: GoogleProfile) {
    const user = await db.selectFrom('users').select(['id', 'role', 'company_id']).where('google_sub', '=', profile.sub).executeTakeFirst();
    if (user || !profile.email_verified) return user;
    return db.updateTable('users').set({ google_sub: profile.sub })
      .where((eb) => eb(eb.fn('lower', ['email']), '=', profile.email.toLowerCase()))
      .where('google_sub', 'is', null)
      .returning(['id', 'role', 'company_id']).executeTakeFirst();
  }

  async function emailTaken(email: string) {
    return !!(await db.selectFrom('users').select('id').where((eb) => eb(eb.fn('lower', ['email']), '=', email.toLowerCase())).executeTakeFirst());
  }

  /** Web dev UI: the existing user, or a new customer straight away (no profile step there). */
  async function userForGoogle(profile: GoogleProfile) {
    const user = await existingForGoogle(profile);
    if (user) return user;
    try {
      return await db.insertInto('users')
        .values({ role: 'customer', name: profile.name, email: profile.email.toLowerCase(), google_sub: profile.sub })
        .returning(['id', 'role', 'company_id']).executeTakeFirstOrThrow();
    } catch (e) {
      if (isUniqueViolation(e, 'users_email_key')) throw conflict('email_taken', 'Sign in with your password for this email');
      throw e;
    }
  }

  // which Google options the sign-in screen may show; client_id is public (the app's serverClientId)
  app.get('/auth/google/status', async () => ({
    enabled: googleNativeConfigured(config) || googleConfigured(config),
    native: googleNativeConfigured(config),
    web: googleConfigured(config),
    client_id: config.GOOGLE_CLIENT_ID ?? null,
  }));

  // Android app: Google ID token from the Credential Manager SDK. A known account gets our tokens; a new one gets a
  // short sign-up pass and what Google told us, and the account is made only once the name, phone and gender are sent.
  app.post('/auth/google/native', async (req) => {
    const { id_token } = z.object({ id_token: z.string().min(20).max(4096) }).parse(req.body);
    const profile = await verifyGoogleIdToken(config, id_token);
    const user = await existingForGoogle(profile);
    if (user) return issueTokens(db, secret, user);
    if (await emailTaken(profile.email)) throw conflict('email_taken', 'Sign in with your password for this email');
    const signup_token = await new SignJWT({ purpose: 'google_signup', email: profile.email.toLowerCase(), name: profile.name })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(profile.sub).setIssuedAt().setExpirationTime(SIGNUP_TTL)
      .sign(new TextEncoder().encode(secret));
    return { needs_profile: true, signup_token, profile: { email: profile.email.toLowerCase(), name: profile.name } };
  });

  // the profile step after a new Google sign-in: makes the customer account and signs in
  app.post('/auth/google/complete', async (req, reply) => {
    if (!googleNativeConfigured(config)) throw new HttpError(501, 'google_not_configured', 'Google sign-in is not configured');
    const body = GoogleComplete.parse(req.body);
    let claims: { sub?: string; purpose?: unknown; email?: unknown };
    try {
      ({ payload: claims } = await jwtVerify(body.signup_token, new TextEncoder().encode(secret), { algorithms: ['HS256'] }));
    } catch {
      throw unauthorized('The sign-up took too long. Sign in with Google again.');
    }
    if (claims.purpose !== 'google_signup' || !claims.sub || typeof claims.email !== 'string') throw unauthorized('Invalid sign-up');
    // sent twice (double tap, retry): the account already exists, just sign in
    const again = await db.selectFrom('users').select(['id', 'role', 'company_id']).where('google_sub', '=', claims.sub).executeTakeFirst();
    if (again) return issueTokens(db, secret, again);
    try {
      const user = await db.insertInto('users').values({
        role: 'customer', name: body.name, email: claims.email, google_sub: claims.sub, phone: body.phone, gender: body.gender,
      }).returning(['id', 'role', 'company_id']).executeTakeFirstOrThrow();
      reply.code(201);
      return issueTokens(db, secret, user);
    } catch (e) {
      if (isUniqueViolation(e, 'users_email_key')) throw conflict('email_taken', 'Sign in with your password for this email');
      throw e;
    }
  });

  // Web dev UI: redirect → callback → one-time code → /auth/google/exchange
  app.get('/auth/google', async (_req, reply) => {
    const state = await signState(secret, { nonce: randomToken(16) });
    return reply.redirect(googleAuthUrl(config, state));
  });

  app.get('/auth/google/callback', async (req, reply) => {
    const q = z.object({ code: z.string(), state: z.string() }).parse(req.query);
    await verifyState(secret, q.state).catch(() => {
      throw unauthorized('Invalid sign-in state');
    });
    const user = await userForGoogle(await exchangeGoogleCode(config, q.code));
    const code = await createAuthCode(db, user.id);
    const target = new URL(config.APP_REDIRECT_URL);
    target.searchParams.set('code', code);
    return reply.redirect(target.toString());
  });

  app.post('/auth/google/exchange', async (req) => {
    const { code } = z.object({ code: z.string().min(1) }).parse(req.body);
    const userId = await consumeAuthCode(db, code);
    const user = await db.selectFrom('users').select(['id', 'role', 'company_id'])
      .where('id', '=', userId).executeTakeFirstOrThrow();
    return issueTokens(db, secret, user);
  });
}

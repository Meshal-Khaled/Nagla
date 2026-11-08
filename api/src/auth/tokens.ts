import { jwtVerify, SignJWT } from 'jose';
import type { Kysely } from 'kysely';
import type { DB } from '../db/types.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { unauthorized } from '../lib/errors.js';

export type Role = 'customer' | 'company_admin' | 'agent';

export interface AuthUser {
  id: string;
  role: Role;
  company_id: string | null;
}

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 30;
const AUTH_CODE_TTL_MS = 2 * 60 * 1000;

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signAccess(secret: string, user: AuthUser) {
  return new SignJWT({ role: user.role, company_id: user.company_id })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(key(secret));
}

export async function verifyAccess(secret: string, token: string): Promise<AuthUser> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    return { id: payload.sub!, role: payload.role as Role, company_id: (payload.company_id as string) ?? null };
  } catch {
    throw unauthorized('Invalid or expired access token');
  }
}

/** Short-lived signed value (used for the Google OAuth `state`). */
export async function signState(secret: string, data: Record<string, string>) {
  return new SignJWT(data).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('10m').sign(key(secret));
}

export async function verifyState(secret: string, state: string) {
  const { payload } = await jwtVerify(state, key(secret), { algorithms: ['HS256'] });
  return payload;
}

/** Access + rotating refresh token pair. Only the refresh token's hash is stored. */
export async function issueTokens(db: Kysely<DB>, secret: string, user: AuthUser) {
  const refresh = randomToken();
  await db.insertInto('refresh_tokens').values({
    user_id: user.id,
    token_hash: sha256(refresh),
    expires_at: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000),
  }).execute();
  return { access_token: await signAccess(secret, user), refresh_token: refresh, token_type: 'Bearer', expires_in: 900 };
}

export async function rotateRefresh(db: Kysely<DB>, secret: string, refresh: string) {
  const user = await db.transaction().execute(async (trx) => {
    const row = await trx.updateTable('refresh_tokens')
      .set({ revoked_at: new Date() })
      .where('token_hash', '=', sha256(refresh))
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date())
      .returning('user_id')
      .executeTakeFirst();
    if (!row) throw unauthorized('Invalid refresh token');
    return trx.selectFrom('users').select(['id', 'role', 'company_id'])
      .where('id', '=', row.user_id).executeTakeFirstOrThrow();
  });
  return issueTokens(db, secret, user);
}

export async function revokeRefresh(db: Kysely<DB>, refresh: string) {
  await db.updateTable('refresh_tokens').set({ revoked_at: new Date() })
    .where('token_hash', '=', sha256(refresh)).where('revoked_at', 'is', null).execute();
}

export async function createAuthCode(db: Kysely<DB>, userId: string) {
  const code = randomToken();
  await db.insertInto('auth_codes').values({
    code_hash: sha256(code), user_id: userId, expires_at: new Date(Date.now() + AUTH_CODE_TTL_MS),
  }).execute();
  return code;
}

export async function consumeAuthCode(db: Kysely<DB>, code: string) {
  const row = await db.deleteFrom('auth_codes')
    .where('code_hash', '=', sha256(code)).where('expires_at', '>', new Date())
    .returning('user_id').executeTakeFirst();
  if (!row) throw unauthorized('Invalid or expired code');
  return row.user_id;
}

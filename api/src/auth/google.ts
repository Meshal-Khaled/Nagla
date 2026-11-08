import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';
import type { Config } from '../config.js';
import { HttpError } from '../lib/errors.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
let googleJwks: JWTVerifyGetKey = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/** Tests sign their own ID tokens. */
export function useGoogleKeysForTests(keys: JWTVerifyGetKey) {
  googleJwks = keys;
}

/** Browser redirect flow (secondary, web dev UI): needs the Web client's secret and redirect URI. */
export function googleConfigured(c: Config) {
  return Boolean(c.GOOGLE_CLIENT_ID && c.GOOGLE_CLIENT_SECRET && c.GOOGLE_REDIRECT_URI);
}

/** Native flow (Android app, Credential Manager): only the Web client ID, used as the token audience. */
export function googleNativeConfigured(c: Config) {
  return Boolean(c.GOOGLE_CLIENT_ID);
}

function requireGoogle(c: Config) {
  if (!googleConfigured(c)) throw new HttpError(501, 'google_not_configured', 'Google sign-in is not configured');
  return { clientId: c.GOOGLE_CLIENT_ID!, clientSecret: c.GOOGLE_CLIENT_SECRET!, redirectUri: c.GOOGLE_REDIRECT_URI! };
}

export function googleAuthUrl(c: Config, state: string) {
  const g = requireGoogle(c);
  const u = new URL(GOOGLE_AUTH_URL);
  u.search = new URLSearchParams({
    client_id: g.clientId,
    redirect_uri: g.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  }).toString();
  return u.toString();
}

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
}

/** Exchange the callback code and verify the returned ID token against Google's keys. */
export async function exchangeGoogleCode(c: Config, code: string): Promise<GoogleProfile> {
  const g = requireGoogle(c);
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: g.clientId, client_secret: g.clientSecret, redirect_uri: g.redirectUri, grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new HttpError(401, 'google_exchange_failed', 'Google sign-in failed');
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new HttpError(401, 'google_exchange_failed', 'Google returned no ID token');

  return verifyGoogleIdToken(c, id_token);
}

/**
 * Verify a Google ID token (signature, issuer, audience = our Web client ID, expiry).
 * The Android app gets it from Credential Manager with the Web client ID as serverClientId.
 */
export async function verifyGoogleIdToken(c: Config, idToken: string): Promise<GoogleProfile> {
  if (!c.GOOGLE_CLIENT_ID) throw new HttpError(501, 'google_not_configured', 'Google sign-in is not configured');
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: c.GOOGLE_CLIENT_ID,
  }).catch(() => {
    throw new HttpError(401, 'invalid_google_token', 'Google sign-in could not be verified');
  });
  if (!payload.sub || !payload.email) throw new HttpError(401, 'invalid_google_token', 'Google account has no email');
  return {
    sub: payload.sub!,
    email: String(payload.email ?? ''),
    email_verified: payload.email_verified === true,
    name: String(payload.name ?? payload.email ?? 'Google user'),
  };
}


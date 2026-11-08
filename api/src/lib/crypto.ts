import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Random URL-safe token (default 32 bytes). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const hmac = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('base64url');

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

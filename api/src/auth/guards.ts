import type { FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../lib/errors.js';
import { type AuthUser, type Role, verifyAccess } from './tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export function bearer(req: FastifyRequest) {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
}

/** preHandler: require a valid access token, optionally one of `roles`. */
export function requireAuth(secret: string, ...roles: Role[]) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const token = bearer(req);
    if (!token) throw unauthorized();
    const user = await verifyAccess(secret, token);
    if (roles.length && !roles.includes(user.role)) throw forbidden(`Requires role: ${roles.join(' or ')}`);
    req.user = user;
  };
}

export function currentUser(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  return req.user;
}

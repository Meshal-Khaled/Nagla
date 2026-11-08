import type { Kysely, Transaction } from 'kysely';
import { z } from 'zod';
import type { AuthUser } from '../../auth/tokens.js';
import type { DB } from '../../db/types.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';

export const IdParam = z.object({ id: z.uuid() });

export type MoveRow = Awaited<ReturnType<typeof selectMove>>;

function selectMove(db: Kysely<DB> | Transaction<DB>, id: string, lock: boolean) {
  let q = db.selectFrom('moves').selectAll().where('id', '=', id);
  if (lock) q = q.forUpdate();
  return q.executeTakeFirstOrThrow();
}

export function isCompanyUser(user: AuthUser) {
  return user.role === 'company_admin' || user.role === 'agent';
}

/**
 * Load a move the user may see.
 * - customers: only their own moves
 * - company admins / agents: only confirmed moves assigned to their company
 */
export async function loadMove(
  db: Kysely<DB> | Transaction<DB>,
  id: string,
  user: AuthUser,
  opts: { ownerOnly?: boolean; lock?: boolean } = {},
) {
  const move = await selectMove(db, id, opts.lock ?? false).catch(() => {
    throw notFound('Move');
  });
  if (user.role === 'customer') {
    if (move.customer_id !== user.id) throw notFound('Move');
  } else if (opts.ownerOnly) {
    throw forbidden('Only the customer can do this');
  } else if (move.company_id !== user.company_id || move.status === 'draft') {
    throw notFound('Move');
  }
  return move;
}

export function assertDraft(move: { status: string }) {
  if (move.status !== 'draft') throw conflict('not_draft', 'The move is already confirmed or cancelled');
}

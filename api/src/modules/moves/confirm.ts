import type { AuthUser } from '../../auth/tokens.js';
import type { Deps } from '../../deps.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import { badRequest } from '../../lib/errors.js';
import { itemCatalog } from '../catalog/store.js';
import { estimate } from '../quotes/estimator.js';
import { loadCompanyTrucks, loadEstimateItems, loadSettings } from '../quotes/inputs.js';
import { assertDraft, loadMove } from './access.js';
import { assemble, basicText, planInput, type MovePlan } from '../plan/plan.js';
import { moveDetails } from './view.js';

/** Agent links stay valid until the move ends, capped at this many days after the date window. */
const AGENT_TOKEN_GRACE_DAYS = 14;

export function agentTokenExpiry(dateTo: string) {
  return new Date(new Date(`${dateTo}T23:59:59Z`).getTime() + AGENT_TOKEN_GRACE_DAYS * 86400_000);
}

/** Set a fresh agent token on a move and return the link. Only the hash is stored. */
export async function issueAgentToken(deps: Pick<Deps, 'db' | 'config'>, moveId: string, dateTo: string) {
  const token = randomToken();
  await deps.db.updateTable('moves')
    .set({ agent_token_hash: sha256(token), agent_token_expires_at: agentTokenExpiry(dateTo) })
    .where('id', '=', moveId).execute();
  return `${deps.config.PUBLIC_URL}/agent/${token}`;
}

/**
 * Confirm in one transaction: snapshot item volumes, lock the quote, set the first stage,
 * write the first event, create the agent token. The price is recomputed here, never taken from the client.
 */
export async function confirmMove(deps: Deps, moveId: string, user: AuthUser, companyId: string) {
  const { db } = deps;
  await db.transaction().execute(async (trx) => {
    const move = await loadMove(trx, moveId, user, { ownerOnly: true, lock: true });
    assertDraft(move);

    const missing = (['pickup_address', 'dropoff_address', 'date_from'] as const).filter((k) => !move[k]);
    if (missing.length) throw badRequest('missing_details', `Fill in: ${missing.join(', ')}`);

    const items = await loadEstimateItems(trx, deps.catalog, moveId);
    if (!items.some((i) => i.disposition === 'keep')) throw badRequest('nothing_to_move', 'No items marked keep');

    const offer = estimate(items, await loadCompanyTrucks(trx), await loadSettings(trx)).find((o) => o.company_id === companyId);
    if (!offer) throw badRequest('company_unavailable', "This company can't take this move (no truck big enough for its volume)");

    // copy the catalog row onto each item: later catalog edits never change this move
    const rows = await trx.selectFrom('move_items').select(['id', 'catalog_id', 'volume_m3_snapshot', 'catalog_snapshot'])
      .where('move_id', '=', moveId).execute();
    for (const r of rows) {
      const snap = itemCatalog(deps.catalog, r);
      await trx.updateTable('move_items')
        .set({ volume_m3_snapshot: snap.volume_m3, catalog_snapshot: JSON.stringify(snap) })
        .where('id', '=', r.id).execute();
    }

    await trx.insertInto('quotes').values({
      move_id: moveId,
      company_id: offer.company_id,
      truck_size_id: offer.truck_size_id,
      truck_capacity_m3: offer.truck_capacity_m3,
      trips: offer.trips,
      crew_size: offer.crew_size,
      estimated_minutes: offer.estimated_minutes,
      volume_m3: offer.volume_m3,
      price_halalas: offer.price_halalas,
      is_locked: true,
    }).execute();

    const input = await planInput(trx, deps.catalog, moveId, offer);
    const seen = move.plan_draft as MovePlan | null;
    const plan = seen?.hash === input.hash ? seen : assemble(input, basicText(input), 'basic');

    const dateTo = move.date_to ?? move.date_from!;
    await trx.updateTable('moves').set({
      plan: JSON.stringify(plan),
      plan_draft: null,
      status: 'confirmed',
      current_stage: 'confirmed',
      company_id: companyId,
      date_to: dateTo,
      confirmed_at: new Date(),
      updated_at: new Date(),
    }).where('id', '=', moveId).execute();
    // the link itself is handed to the company admin (POST /company/moves/:id/agent-link)
    await issueAgentToken({ db: trx, config: deps.config }, moveId, dateTo);

    await trx.insertInto('move_events').values({
      move_id: moveId, stage: 'confirmed', actor_type: 'customer', actor_id: user.id, idempotency_key: `confirm:${moveId}`,
    }).execute();
  });

  // after commit
  deps.notifier.moveConfirmed(moveId);
  return moveDetails(deps, await loadMove(db, moveId, user));
}

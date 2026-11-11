import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../auth/guards.js';
import type { Deps } from '../../deps.js';
import { badRequest } from '../../lib/errors.js';
import { assertDraft, IdParam, loadMove } from '../moves/access.js';
import { estimate } from '../quotes/estimator.js';
import { loadCompanyTrucks, loadEstimateItems, loadSettings } from '../quotes/inputs.js';
import { makePlan, planInput, type MovePlan } from './plan.js';

const Body = z.object({
  company_id: z.uuid(),
  // true: ask for a new wording even when nothing changed ("suggest a new plan")
  refresh: z.boolean().default(false),
}).strict();

export async function planRoutes(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;

  // booking step 5: the plan for the chosen offer. Kept on the draft, so going back and forth doesn't ask the AI again.
  app.post('/moves/:id/move-plan', { preHandler: requireAuth(config.JWT_SECRET, 'customer') }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const body = Body.parse(req.body ?? {});
    const move = await loadMove(db, id, currentUser(req), { ownerOnly: true });
    assertDraft(move);
    if (!move.date_from || !move.pickup_address || !move.dropoff_address) throw badRequest('missing_details', 'Fill in the date and both addresses first');
    const items = await loadEstimateItems(db, deps.catalog, id);
    if (!items.some((i) => i.disposition === 'keep')) throw badRequest('nothing_to_move', 'No items marked keep');
    const offer = estimate(items, await loadCompanyTrucks(db), await loadSettings(db)).find((o) => o.company_id === body.company_id);
    if (!offer) throw badRequest('company_unavailable', "This company can't take this move (no truck big enough for its volume)");

    const input = await planInput(db, deps.catalog, id, offer);
    const saved = move.plan_draft as MovePlan | null;
    if (!body.refresh && saved?.hash === input.hash) return saved;
    const plan = await makePlan(deps, input, req.log);
    await db.updateTable('moves').set({ plan_draft: JSON.stringify(plan) }).where('id', '=', id).execute();
    return plan;
  });
}

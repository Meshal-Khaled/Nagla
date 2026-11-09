import type { FastifyInstance } from 'fastify';
import { currentUser, requireAuth } from '../../auth/guards.js';
import type { Deps } from '../../deps.js';
import { IdParam, loadMove } from '../moves/access.js';
import { estimate, volumeSummary } from './estimator.js';
import { regionOf } from './region.js';

const MAX_OFFERS = 20;
import { loadCompanyTrucks, loadEstimateItems, loadSettings } from './inputs.js';

export async function quoteRoutes(app: FastifyInstance, { db, config, catalog }: Deps) {
  // Draft: offers from the companies whose trucks carry the move's volume, computed on request (not stored).
  // Confirmed: the locked snapshot.
  app.get('/moves/:id/quotes', { preHandler: requireAuth(config.JWT_SECRET) }, async (req) => {
    const { id } = IdParam.parse(req.params);
    const move = await loadMove(db, id, currentUser(req));
    if (move.status !== 'draft') {
      const locked = await db.selectFrom('quotes')
        .innerJoin('companies', 'companies.id', 'quotes.company_id')
        .innerJoin('truck_sizes as t', 't.id', 'quotes.truck_size_id')
        .selectAll('quotes').select(['companies.name_en as company_name', 't.name as truck_name'])
        .where('quotes.move_id', '=', id).where('quotes.is_locked', '=', true).executeTakeFirst();
      return { locked: true, offers: locked ? [locked] : [] };
    }
    const [items, companies, settings] = await Promise.all([
      loadEstimateItems(db, catalog, id), loadCompanyTrucks(db), loadSettings(db),
    ]);
    // the pickup's region picks the companies that work there; companies without a region work everywhere
    const details = move.pickup_details as { city?: string; district?: string } | null;
    const region = regionOf(details?.city, details?.district, move.pickup_address);
    const local = companies.filter((c) => !region || !c.region || c.region === region);
    // then the volume: only those with a truck that carries it (estimate), cheapest first
    const all = estimate(items, local, settings);
    return {
      locked: false, ...volumeSummary(items, settings), region, companies_checked: local.length,
      companies_able: all.length, offers: all.slice(0, MAX_OFFERS),
    };
  });
}

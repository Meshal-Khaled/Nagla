import type { FastifyInstance } from 'fastify';
import { currentUser, requireAuth } from '../../auth/guards.js';
import type { Deps } from '../../deps.js';
import { IdParam, loadMove } from '../moves/access.js';
import { estimate } from './estimator.js';
import { loadCompanyTrucks, loadEstimateItems, loadSettings } from './inputs.js';

export async function quoteRoutes(app: FastifyInstance, { db, config, catalog }: Deps) {
  // Draft: offers from every company, computed on request (not stored).
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
    return { locked: false, offers: estimate(items, companies, settings) };
  });
}

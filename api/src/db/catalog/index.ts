import { config } from '../../config.js';
import { createDb } from '../index.js';
import type { DB as CatalogDB } from './types.js';

export type { CatalogDB };

/** Connection to the separate furniture catalog database. */
export const createCatalogDb = (url = config.CATALOG_DATABASE_URL) => createDb<CatalogDB>(url);

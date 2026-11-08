import type { Kysely } from 'kysely';
import type { CatalogDB } from '../../db/catalog/index.js';

type SizeClass = 'small' | 'medium' | 'large';

export interface CatalogRow {
  id: string;
  category: string;
  variant: string;
  name_en: string;
  name_ar: string;
  size_class: SizeClass;
  w_cm: number;
  d_cm: number;
  h_cm: number;
  volume_m3: number;
  weight_kg: number;
  fragile: boolean;
  dismantle_minutes: number;
  is_default: boolean;
  retired: boolean;
}

/** The catalog fields copied onto a move item at confirmation. */
export type CatalogSnapshot = Omit<CatalogRow, 'is_default' | 'retired'>;

export function toSnapshot({ is_default: _d, retired: _r, ...row }: CatalogRow): CatalogSnapshot {
  return row;
}

/**
 * Read-only view of the catalog database, held in memory (a few hundred rows).
 * The catalog is hardcoded reference data, so it is loaded at start-up; call reload()
 * after re-seeding.
 */
export class CatalogStore {
  private rows: CatalogRow[] = [];
  private byId = new Map<string, CatalogRow>();

  constructor(private readonly db: Kysely<CatalogDB>) {}

  async reload() {
    const rows = await this.db.selectFrom('furniture_catalog')
      .select(['id', 'category', 'variant', 'name_en', 'name_ar', 'size_class', 'w_cm', 'd_cm', 'h_cm',
        'volume_m3', 'weight_kg', 'fragile', 'dismantle_minutes', 'is_default', 'retired_at'])
      .orderBy('category').orderBy('size_class').orderBy('variant')
      .execute();
    this.rows = rows.map(({ retired_at, ...r }) => ({ ...r, volume_m3: Number(r.volume_m3), retired: retired_at !== null }));
    this.byId = new Map(this.rows.map((r) => [r.id, r]));
    if (!this.rows.some((r) => r.category === 'other' && r.is_default)) {
      throw new Error('catalog database has no `other` rows; run `npm run seed`');
    }
    return this;
  }

  /** Any row by id, retired ones included (old moves may still point at them). */
  get(id: string) {
    return this.byId.get(id);
  }

  /** A row that may be picked for new items. */
  getActive(id: string) {
    const row = this.byId.get(id);
    return row && !row.retired ? row : undefined;
  }

  /** Rows for the add/fix screens, optionally filtered by text. */
  list(q?: string) {
    const active = this.rows.filter((r) => !r.retired);
    if (!q) return active;
    const needle = q.toLowerCase();
    return active.filter((r) =>
      [r.category, r.category.replace(/_/g, ' '), r.variant, r.name_en.toLowerCase(), r.name_ar].some((f) => f.includes(needle)));
  }

  /** Closed category list sent to the vision model. */
  categories() {
    return [...new Set(this.rows.filter((r) => r.is_default).map((r) => r.category))].sort();
  }

  /**
   * Map an AI (category, size_class) to a row:
   * exact default row → same category's default (closest size) → `other` of that size.
   */
  resolve(category: string, sizeClass: SizeClass) {
    const order: SizeClass[] =
      sizeClass === 'medium' ? ['medium', 'large', 'small'] : [sizeClass, 'medium', sizeClass === 'small' ? 'large' : 'small'];
    for (const cat of [category, 'other']) {
      for (const size of order) {
        const hit = this.rows.find((r) => r.is_default && r.category === cat && r.size_class === size);
        if (hit) return hit;
      }
    }
    throw new Error('catalog has no `other` rows');
  }
}

/**
 * Catalog fields for a move item: the confirmation snapshot once confirmed, otherwise the
 * live catalog row (falling back to the snapshot if the row is gone).
 */
export function itemCatalog(
  store: CatalogStore,
  item: { catalog_id: string; volume_m3_snapshot: number | null; catalog_snapshot: unknown },
): CatalogSnapshot {
  const snap = item.catalog_snapshot as CatalogSnapshot | null;
  if (item.volume_m3_snapshot !== null && snap) return { ...snap, volume_m3: item.volume_m3_snapshot };
  const live = store.get(item.catalog_id);
  if (live) return toSnapshot(live);
  if (snap) return snap;
  throw new Error(`catalog row ${item.catalog_id} not found`);
}

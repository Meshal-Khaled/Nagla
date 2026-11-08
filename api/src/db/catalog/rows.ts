// Furniture catalog: the hardcoded reference data looked up after the vision model has
// named an item. The AI only returns (category, size_class); sizes, weight, fragility and
// dismantle time always come from here.
//
// Source of truth: catalog.json (300 rows, 100 categories × small/medium/large).
// `other` is added here so unknown objects always map to a row.

import { readFileSync } from 'node:fs';
import { z } from 'zod';

const SIZES = ['small', 'medium', 'large'] as const;

const Row = z.object({
  category: z.string().regex(/^[a-z][a-z0-9_]*$/),
  variant: z.string().min(1),
  name_en: z.string().min(1),
  name_ar: z.string().min(1),
  size_class: z.enum(SIZES),
  width_cm: z.number().positive(),
  depth_cm: z.number().positive(),
  height_cm: z.number().positive(),
  // given in the file; the database computes its own from the dimensions
  volume_m3: z.number().positive(),
  weight_kg: z.number().nonnegative(),
  fragile: z.boolean(),
  dismantle_minutes: z.number().int().nonnegative(),
}).strict();

const OTHER: z.infer<typeof Row>[] = [
  { size_class: 'small', variant: 'small', width_cm: 50, depth_cm: 50, height_cm: 50, weight_kg: 10 },
  { size_class: 'medium', variant: 'medium', width_cm: 100, depth_cm: 60, height_cm: 100, weight_kg: 30 },
  { size_class: 'large', variant: 'large', width_cm: 150, depth_cm: 80, height_cm: 150, weight_kg: 60 },
].map((r) => ({
  ...r,
  category: 'other',
  name_en: `Other item (${r.size_class})`,
  name_ar: 'غرض آخر',
  size_class: r.size_class as (typeof SIZES)[number],
  volume_m3: (r.width_cm * r.depth_cm * r.height_cm) / 1e6,
  fragile: false,
  dismantle_minutes: 0,
}));

function load() {
  const raw = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));
  const rows = [...z.array(Row).parse(raw), ...OTHER];

  const seen = new Set<string>();
  const sizesByCategory = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = `${r.category}/${r.size_class}/${r.variant}`;
    if (seen.has(key)) throw new Error(`catalog.json: duplicate ${key}`);
    seen.add(key);
    const computed = (r.width_cm * r.depth_cm * r.height_cm) / 1e6;
    if (Math.abs(computed - r.volume_m3) > 0.01) {
      throw new Error(`catalog.json: ${key} volume_m3 ${r.volume_m3} does not match its dimensions (${computed.toFixed(3)})`);
    }
    if (!sizesByCategory.has(r.category)) sizesByCategory.set(r.category, new Set());
    sizesByCategory.get(r.category)!.add(r.size_class);
  }
  for (const [category, sizes] of sizesByCategory) {
    if (sizes.size !== SIZES.length) throw new Error(`catalog.json: ${category} needs small, medium and large rows`);
  }
  return rows;
}

const ROWS = load();

/** Closed category list sent to the vision model. */
export const CATEGORY_LIST = [...new Set(ROWS.map((r) => r.category))];

export function catalogRows() {
  // the first row of each (category, size_class) is the one AI detections map to
  const defaults = new Set<string>();
  return ROWS.map((r) => {
    const key = `${r.category}/${r.size_class}`;
    const isDefault = !defaults.has(key);
    defaults.add(key);
    return {
      category: r.category,
      variant: r.variant,
      name_en: r.name_en,
      name_ar: r.name_ar,
      size_class: r.size_class,
      w_cm: r.width_cm,
      d_cm: r.depth_cm,
      h_cm: r.height_cm,
      weight_kg: r.weight_kg,
      fragile: r.fragile,
      dismantle_minutes: r.dismantle_minutes,
      is_default: isDefault,
    };
  });
}

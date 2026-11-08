// Crew job sheet, built by code from the final inventory and catalog fields (never by AI).

export interface SheetItem {
  label: string;
  name_en: string;
  name_ar: string;
  quantity: number;
  volume_m3: number;
  weight_kg: number;
  fragile: boolean;
  dismantle_minutes: number;
}

export const HEAVY_KG = 40;

export function buildJobSheet(items: SheetItem[]) {
  // load first: dismantled and heavy; then normal; fragile last
  const group = (i: SheetItem) => (i.fragile ? 2 : i.dismantle_minutes > 0 || i.weight_kg >= HEAVY_KG ? 0 : 1);
  const loadOrder = [...items].sort(
    (a, b) => group(a) - group(b) || b.weight_kg - a.weight_kg || a.label.localeCompare(b.label),
  );

  return {
    load_order: loadOrder.map((i, n) => ({
      step: n + 1,
      label: i.label,
      name_en: i.name_en,
      name_ar: i.name_ar,
      quantity: i.quantity,
      fragile: i.fragile,
      dismantle: i.dismantle_minutes > 0,
      heavy: i.weight_kg >= HEAVY_KG,
    })),
    fragile: items.filter((i) => i.fragile).map((i) => ({ label: i.label, name_en: i.name_en, quantity: i.quantity })),
    dismantle: items.filter((i) => i.dismantle_minutes > 0).map((i) => ({
      label: i.label, name_en: i.name_en, quantity: i.quantity, minutes: i.dismantle_minutes * i.quantity,
    })),
    totals: {
      items: items.reduce((s, i) => s + i.quantity, 0),
      volume_m3: Math.round(items.reduce((s, i) => s + i.volume_m3 * i.quantity, 0) * 1000) / 1000,
      weight_kg: Math.round(items.reduce((s, i) => s + i.weight_kg * i.quantity, 0)),
      dismantle_minutes: items.reduce((s, i) => s + i.dismantle_minutes * i.quantity, 0),
    },
  };
}

import { describe, expect, it } from 'vitest';
import { buildJobSheet } from '../src/modules/jobSheet/builder.js';
import { type CompanyTrucks, estimate, type EstimateItem } from '../src/modules/quotes/estimator.js';

const settings = {
  packing_factor: 1.25,
  crew_tiers: [{ max_m3: 15, crew: 2 }, { max_m3: 35, crew: 3 }, { max_m3: null, crew: 4 }],
  loading_minutes_per_m3: 4,
};
const companies: CompanyTrucks[] = [
  { company_id: 'a', company_name: 'Big', trucks: [
    { truck_size_id: 's', truck_name: 'small', capacity_m3: 10, price_halalas: 40000 },
    { truck_size_id: 'l', truck_name: 'large', capacity_m3: 35, price_halalas: 110000 },
    { truck_size_id: 'm', truck_name: 'medium', capacity_m3: 20, price_halalas: 70000 },
  ] },
  { company_id: 'b', company_name: 'Small', trucks: [
    { truck_size_id: 's', truck_name: 'small', capacity_m3: 10, price_halalas: 35000 },
    { truck_size_id: 'm', truck_name: 'medium', capacity_m3: 20, price_halalas: 60000 },
  ] },
  { company_id: 'c', company_name: 'NoTrucks', trucks: [] },
];
const item = (volume_m3: number, extra: Partial<EstimateItem> = {}): EstimateItem =>
  ({ quantity: 1, disposition: 'keep', volume_m3, dismantle_minutes: 0, ...extra });

describe('estimate', () => {
  it('is deterministic', () => {
    const items = [item(1.6), item(3, { quantity: 2, dismantle_minutes: 30 }), item(0.2, { disposition: 'sell' })];
    expect(estimate(items, companies, settings)).toEqual(estimate([...items], companies, settings));
  });

  it('counts keep items × quantity only, applies packing factor, crew and time', () => {
    const [offer] = estimate(
      [item(2, { quantity: 3, dismantle_minutes: 10 }), item(5, { disposition: 'donate', dismantle_minutes: 99 })],
      companies, settings,
    );
    expect(offer.raw_volume_m3).toBe(6);
    expect(offer.volume_m3).toBe(7.5);
    expect(offer.crew_size).toBe(2);
    expect(offer.estimated_minutes).toBe(30 + 30); // 4 × 7.5 + 3 × 10
  });

  it('picks each company’s smallest fitting truck', () => {
    const offers = estimate([item(12)], companies, settings); // 15 m³ packed
    expect(offers.map((o) => [o.company_name, o.truck_name, o.trips, o.price_halalas])).toEqual([
      ['Small', 'medium', 1, 60000],
      ['Big', 'medium', 1, 70000],
    ]);
  });

  it('offers only the companies with a truck that carries the whole volume', () => {
    const offers = estimate([item(24)], companies, settings); // 30 m³ packed: only Big has a 35 m³ truck
    expect(offers.map((o) => [o.company_name, o.truck_name, o.trips, o.price_halalas])).toEqual([['Big', 'large', 1, 110000]]);
  });

  it('when no truck is big enough, offers the companies needing the fewest trips', () => {
    const offers = estimate([item(40)], companies, settings); // 50 m³ packed
    expect(offers.map((o) => o.company_name)).toEqual(['Big']);
    expect(offers[0]).toMatchObject({ truck_name: 'large', trips: 2, price_halalas: 220000, crew_size: 4 });
  });

  it('skips companies without trucks', () => {
    expect(estimate([item(1)], companies, settings).map((o) => o.company_id)).not.toContain('c');
  });
});

describe('job sheet', () => {
  it('loads dismantled and heavy first, fragile last', () => {
    const base = { name_en: '', name_ar: '', quantity: 1, volume_m3: 1, fragile: false, dismantle_minutes: 0, weight_kg: 10 };
    const sheet = buildJobSheet([
      { ...base, label: 'tv_1', fragile: true, weight_kg: 15 },
      { ...base, label: 'box_1' },
      { ...base, label: 'fridge_1', weight_kg: 75 },
      { ...base, label: 'bed_1', dismantle_minutes: 30, weight_kg: 60 },
    ]);
    expect(sheet.load_order.map((i) => i.label)).toEqual(['fridge_1', 'bed_1', 'box_1', 'tv_1']);
    expect(sheet.fragile.map((i) => i.label)).toEqual(['tv_1']);
    expect(sheet.dismantle).toEqual([{ label: 'bed_1', name_en: '', quantity: 1, minutes: 30 }]);
    expect(sheet.totals.dismantle_minutes).toBe(30);
  });
});

// Pure, deterministic estimate: same inventory + prices + settings → same offers. No AI.
// The packed volume decides which companies can take the move (see the end of estimate()).

export interface EstimateItem {
  quantity: number;
  disposition: 'keep' | 'donate' | 'sell';
  volume_m3: number;
  dismantle_minutes: number;
}

export interface CompanyTrucks {
  company_id: string;
  company_name: string;
  region?: string | null;
  city?: string | null;
  google_rating?: number | null;
  trucks: { truck_size_id: string; truck_name: string; capacity_m3: number; price_halalas: number }[];
}

export interface EstimateSettings {
  packing_factor: number;
  crew_tiers: { max_m3: number | null; crew: number }[];
  loading_minutes_per_m3: number;
}

export interface Offer {
  company_id: string;
  company_name: string;
  company_city: string | null;
  google_rating: number | null;
  truck_size_id: string;
  truck_name: string;
  truck_capacity_m3: number;
  trips: number;
  crew_size: number;
  estimated_minutes: number;
  raw_volume_m3: number;
  volume_m3: number;
  price_halalas: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function estimate(items: EstimateItem[], companies: CompanyTrucks[], s: EstimateSettings): Offer[] {
  const keep = items.filter((i) => i.disposition === 'keep');
  const raw = round3(keep.reduce((sum, i) => sum + i.volume_m3 * i.quantity, 0));
  const volume = round3(raw * s.packing_factor);
  const dismantle = keep.reduce((sum, i) => sum + i.dismantle_minutes * i.quantity, 0);

  const tier = s.crew_tiers.find((t) => t.max_m3 === null || volume <= t.max_m3) ?? s.crew_tiers[s.crew_tiers.length - 1];
  const minutes = Math.round(s.loading_minutes_per_m3 * volume + dismantle);

  const offers: Offer[] = [];
  for (const c of companies) {
    if (!c.trucks.length) continue;
    const trucks = [...c.trucks].sort((a, b) => a.capacity_m3 - b.capacity_m3 || a.truck_name.localeCompare(b.truck_name));
    const fit = trucks.find((t) => t.capacity_m3 >= volume);
    const truck = fit ?? trucks[trucks.length - 1];
    const trips = fit ? 1 : Math.ceil(volume / truck.capacity_m3);
    offers.push({
      company_id: c.company_id,
      company_name: c.company_name,
      company_city: c.city ?? null,
      google_rating: c.google_rating ?? null,
      truck_size_id: truck.truck_size_id,
      truck_name: truck.truck_name,
      truck_capacity_m3: truck.capacity_m3,
      trips,
      crew_size: tier.crew,
      estimated_minutes: minutes,
      raw_volume_m3: raw,
      volume_m3: volume,
      price_halalas: truck.price_halalas * trips,
    });
  }
  // The volume picks the companies: only those with a truck that carries the whole move in one trip are offered.
  // When no company has a truck that big, the companies needing the fewest trips are offered instead.
  const oneTrip = offers.filter((o) => o.trips === 1);
  const fewest = Math.min(...offers.map((o) => o.trips));
  const chosen = oneTrip.length ? oneTrip : offers.filter((o) => o.trips === fewest);
  return chosen.sort((a, b) => a.price_halalas - b.price_halalas || a.company_name.localeCompare(b.company_name));
}

/** what the customer sees above the offers: the move's volume and how many companies could take it */
export function volumeSummary(items: EstimateItem[], s: EstimateSettings) {
  const keep = items.filter((i) => i.disposition === 'keep');
  const raw = round3(keep.reduce((sum, i) => sum + i.volume_m3 * i.quantity, 0));
  return { raw_volume_m3: raw, volume_m3: round3(raw * s.packing_factor) };
}

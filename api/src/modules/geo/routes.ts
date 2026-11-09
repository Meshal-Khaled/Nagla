import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../auth/guards.js';
import type { Config } from '../../config.js';
import type { Deps } from '../../deps.js';
import { HttpError } from '../../lib/errors.js';

/**
 * Hudhud Maps (KSA) proxy. The secret key stays on the server (plan: keys never on the phone).
 * Search, reverse geocoding (+ Saudi National Address short code) and short-code lookup are
 * normalised into one address shape the app fills its form with.
 * Not configured → 501 and the app falls back to the phone's own geocoder.
 */
export interface GeoAddress {
  display_name: string;
  place_name: string | null;
  lat: number;
  lng: number;
  street: string | null;
  district: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  short_code: string | null;
}

type Fetch = typeof fetch;

export class Hudhud {
  constructor(private readonly c: Config, private readonly fetchImpl: Fetch = fetch) {}

  get enabled() {
    return Boolean(this.c.HUDHUD_SECRET_KEY);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.enabled) throw new HttpError(501, 'geo_not_configured', 'Maps search is not configured');
    let res: Response;
    try {
      res = await this.fetchImpl(this.c.HUDHUD_BASE_URL.replace(/\/$/, '') + path, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + this.c.HUDHUD_SECRET_KEY, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new HttpError(502, 'geo_unreachable', 'Maps service unreachable');
    }
    const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: string } | null;
    if (res.status === 404) throw new HttpError(404, 'not_found', json?.error || 'Not found');
    if (!res.ok || !json?.ok) throw new HttpError(502, 'geo_error', json?.error || `Maps service error ${res.status}`);
    return json.data as T;
  }

  async search(query: string): Promise<GeoAddress[]> {
    const data = await this.post<{ results?: HudhudResult[] }>('/geocoding/search', { query });
    return (data.results ?? []).slice(0, 10).map((r) => ({
      display_name: r.display_name ?? r.name ?? '',
      place_name: r.name ?? null,
      lat: Number(r.lat),
      lng: Number(r.lon),
      street: null, district: null, city: null, province: null, postal_code: null, short_code: null,
    }));
  }

  async reverse(lat: number, lng: number): Promise<GeoAddress> {
    const d = await this.post<HudhudReverse>('/geocoding/reverse_with_shortcode', { lat, lon: lng });
    const a = d.address ?? {};
    return {
      display_name: d.display_name ?? '',
      place_name: d.name || null,
      lat: Number(d.lat ?? lat),
      lng: Number(d.lon ?? lng),
      street: a.road ?? null,
      district: a.neighbourhood ?? a.suburb ?? null,
      city: a.city ?? a.municipality ?? null,
      province: a.province ?? null,
      postal_code: a.postcode ?? null,
      short_code: d.shortcode || null,
    };
  }

  async shortcode(code: string): Promise<GeoAddress> {
    const d = await this.post<{ shortcode?: string; address_ar?: string; address_en?: string; lat?: number; lon?: number; latitude?: number; longitude?: number }>(
      '/geocoding/lookup_shortcode', { shortcode: code });
    const lat = Number(d.lat ?? d.latitude), lng = Number(d.lon ?? d.longitude);
    // the lookup returns a formatted address only; the structured parts come from reverse geocoding the point
    const rev = Number.isFinite(lat) && Number.isFinite(lng) ? await this.reverse(lat, lng).catch(() => null) : null;
    return {
      ...(rev ?? { place_name: null, street: null, district: null, city: null, province: null, postal_code: null }),
      display_name: d.address_ar || d.address_en || rev?.display_name || code,
      lat, lng,
      short_code: d.shortcode ?? code,
    } as GeoAddress;
  }
}

interface HudhudResult { display_name?: string; name?: string; lat: number | string; lon: number | string }
interface HudhudReverse {
  display_name?: string; name?: string; lat?: string; lon?: string; shortcode?: string;
  address?: { road?: string; neighbourhood?: string; suburb?: string; city?: string; municipality?: string; province?: string; postcode?: string };
}

export async function geoRoutes(app: FastifyInstance, { config }: Deps, hudhud = new Hudhud(config)) {
  const signedIn = requireAuth(config.JWT_SECRET);

  // what the app should use: Hudhud (server) or the phone's own geocoder, and the map style
  app.get('/geo/config', { preHandler: signedIn }, async () => ({
    provider: hudhud.enabled ? 'hudhud' : 'device',
    map_style_url: config.HUDHUD_PUBLISHABLE_KEY && config.HUDHUD_MAP_ID
      ? `${config.HUDHUD_BASE_URL.replace(/\/$/, '')}/maps/styles/${config.HUDHUD_MAP_ID}?api_key=${config.HUDHUD_PUBLISHABLE_KEY}`
      : null,
  }));

  app.get('/geo/search', { preHandler: signedIn }, async (req) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(200) }).parse(req.query);
    return hudhud.search(q);
  });

  app.get('/geo/reverse', { preHandler: signedIn }, async (req) => {
    const { lat, lng } = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }).parse(req.query);
    return hudhud.reverse(lat, lng);
  });

  app.get('/geo/shortcode/:code', { preHandler: signedIn }, async (req) => {
    const { code } = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z]{4}[0-9]{4}$/) }).parse(req.params);
    return hudhud.shortcode(code);
  });
}

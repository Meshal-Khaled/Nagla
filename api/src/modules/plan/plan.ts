import type { Kysely, Transaction } from 'kysely';
import { z } from 'zod';
import type { DB } from '../../db/types.js';
import type { Deps } from '../../deps.js';
import { sha256 } from '../../lib/crypto.js';
import { itemCatalog, type CatalogStore } from '../catalog/store.js';
import type { Offer } from '../quotes/estimator.js';
import { loadSettings } from '../quotes/inputs.js';

/**
 * The moving plan (booking step 5). Every number and time is worked out here from the move and the chosen
 * offer; the AI service only writes the bilingual wording and the loading order (by item id / step key), and
 * everything it returns is checked against these facts. Without the AI (off, slow, wrong) the basic plan below
 * is used, so booking never waits on it.
 */

type Db = Kysely<DB> | Transaction<DB>;
type MoveRow = Awaited<ReturnType<typeof selectPlanMove>>;

const selectPlanMove = (db: Db, id: string) => db.selectFrom('moves').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

export const Text2 = z.object({ ar: z.string().trim().min(1).max(400), en: z.string().trim().min(1).max(400) });
export type Text2 = z.infer<typeof Text2>;
const When = z.enum(['week', 'two_days', 'night', 'morning']);
type When = z.infer<typeof When>;

/** what the AI service returns (its own schema, checked again here) */
export const PlanText = z.object({
  headline: Text2,
  summary: Text2,
  before: z.array(z.object({ when: When, tasks: z.array(Text2).min(1).max(6) })).min(1).max(4),
  day_notes: z.array(z.object({ key: z.string(), note: Text2 })).max(20).default([]),
  load_order: z.array(z.object({ title: Text2, item_ids: z.array(z.string()).min(1).max(200), note: Text2.nullish() })).min(1).max(12),
  tips: z.array(Text2).max(5).default([]),
});
export type PlanText = z.infer<typeof PlanText>;

export interface PlanFacts {
  move_id: string;
  date: string;
  start_time: string;
  days_until: number;
  company: string;
  truck: string;
  trips: number;
  crew: number;
  volume_m3: number;
  pickup: { city: string | null; floor: number | null; elevator: boolean | null };
  dropoff: { city: string | null; floor: number | null; elevator: boolean | null };
  services: string[];
  notes: string | null;
  items: { id: string; name: string; quantity: number; room: string; fragile: boolean; dismantle_minutes: number; disposition: 'keep' | 'sell' | 'donate' }[];
  timeline: { key: string; start: string; end: string; minutes: number }[];
}

interface PlanItem {
  id: string; name_ar: string; name_en: string; quantity: number; room: string; fragile: boolean;
  dismantle_minutes: number; volume_m3: number; disposition: 'keep' | 'sell' | 'donate';
}

export interface MovePlan {
  version: 1;
  source: 'ai' | 'basic';
  created_at: string;
  hash: string;
  company_id: string;
  facts: {
    date: string; start_time: string; end_time: string; total_minutes: number; days_until: number;
    company_name: string; truck_name: string; trips: number; crew_size: number; volume_m3: number;
    keep_count: number; sell_count: number; donate_count: number; fragile_count: number;
    pickup_floor: number | null; pickup_elevator: boolean | null; dropoff_floor: number | null; dropoff_elevator: boolean | null;
  };
  headline: Text2;
  summary: Text2;
  before: { when: When; tasks: Text2[] }[];
  day: { key: string; start: string; end: string; minutes: number; title: Text2; note: Text2 | null }[];
  load_order: { title: Text2; note: Text2 | null; items: { id: string; name_ar: string; name_en: string; quantity: number; fragile: boolean }[] }[];
  tips: Text2[];
}

const STEP_TITLES: Record<string, Text2> = {
  arrive: { ar: 'وصول الفريق وجولة سريعة', en: 'The crew arrives and walks through' },
  dismantle: { ar: 'فك القطع الكبيرة', en: 'Taking big furniture apart' },
  load: { ar: 'التغليف والتحميل', en: 'Wrapping and loading' },
  drive: { ar: 'الطريق لبيتك الجديد', en: 'On the road to your new home' },
  unload: { ar: 'التنزيل في البيت الجديد', en: 'Unloading at the new home' },
  assemble: { ar: 'تركيب القطع', en: 'Putting furniture back together' },
  check: { ar: 'مراجعة أخيرة معك', en: 'A final check with you' },
};

const ROOM_NAMES: Record<string, Text2> = {
  living_room: { ar: 'الصالة', en: 'Living room' }, majlis: { ar: 'المجلس', en: 'Majlis' }, kitchen: { ar: 'المطبخ', en: 'Kitchen' },
  dining_room: { ar: 'غرفة الطعام', en: 'Dining room' }, bathroom: { ar: 'دورة المياه', en: 'Bathroom' }, office: { ar: 'المكتب', en: 'Office' },
  kids_room: { ar: 'غرفة الأطفال', en: "Kids' room" }, storage: { ar: 'المستودع', en: 'Storage' }, balcony: { ar: 'البلكونة', en: 'Balcony' },
  other: { ar: 'أغراض أخرى', en: 'Other things' },
};

export function roomTitle(room: string): Text2 {
  if (ROOM_NAMES[room]) return ROOM_NAMES[room];
  const bed = /^bedroom_?(\d+)?$/.exec(room);
  if (bed) return { ar: `غرفة النوم${bed[1] ? ` ${bed[1]}` : ''}`, en: `Bedroom${bed[1] ? ` ${bed[1]}` : ''}` };
  const name = room.replace(/_/g, ' ').trim() || 'other';
  return { ar: name, en: name.charAt(0).toUpperCase() + name.slice(1) };
}

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (min: number) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

function distanceKm(aLat: number | null, aLng: number | null, bLat: number | null, bLng: number | null) {
  if ([aLat, aLng, bLat, bLng].some((v) => v === null || v === undefined || Number.isNaN(Number(v)))) return null;
  const r = (d: number) => (Number(d) * Math.PI) / 180;
  const dLat = r(Number(bLat) - Number(aLat)); const dLng = r(Number(bLng) - Number(aLng));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(Number(aLat))) * Math.cos(r(Number(bLat))) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** the move day, step by step (approximate): the offer's working time split over the steps, plus the drive */
export function timeline(start: string, items: PlanItem[], offer: Offer, loadingPerM3: number, km: number | null) {
  const keep = items.filter((i) => i.disposition === 'keep');
  const dismantle = keep.reduce((s, i) => s + i.dismantle_minutes * i.quantity, 0);
  const handling = Math.max(0, Math.round(loadingPerM3 * offer.volume_m3));
  // city driving at about 30 km/h plus parking; with several trips the truck goes back and forth
  const oneWay = km === null ? 40 : Math.min(240, Math.max(15, Math.round((km / 30) * 60) + 10));
  const steps: [string, number][] = [
    ['arrive', 15],
    ['dismantle', Math.round(dismantle / 2)],
    ['load', Math.round(handling * 0.55)],
    ['drive', oneWay * (2 * offer.trips - 1)],
    ['unload', handling - Math.round(handling * 0.55)],
    ['assemble', dismantle - Math.round(dismantle / 2)],
    ['check', 15],
  ];
  let t = toMin(start);
  return steps.filter(([, m]) => m > 0).map(([key, minutes]) => {
    const s = t; t += minutes;
    return { key, start: clock(s), end: clock(t), minutes };
  });
}

async function loadPlanItems(db: Db, catalog: CatalogStore, moveId: string): Promise<PlanItem[]> {
  const [rows, rooms] = await Promise.all([
    db.selectFrom('move_items')
      .select(['id', 'quantity', 'disposition', 'custom_name', 'catalog_id', 'volume_m3_snapshot', 'catalog_snapshot'])
      .where('move_id', '=', moveId).orderBy('category').orderBy('seq').execute(),
    db.selectFrom('detections').innerJoin('photos', 'photos.id', 'detections.photo_id')
      .select(['detections.item_id', 'photos.room']).where('photos.move_id', '=', moveId).where('detections.item_id', 'is not', null)
      .orderBy('photos.created_at').execute(),
  ]);
  const roomOf = new Map<string, string>();
  for (const r of rooms) if (r.item_id && !roomOf.has(r.item_id)) roomOf.set(r.item_id, r.room);
  return rows.map((r) => {
    const c = itemCatalog(catalog, r);
    return {
      id: r.id, name_ar: r.custom_name ?? c.name_ar, name_en: r.custom_name ?? c.name_en, quantity: r.quantity,
      room: roomOf.get(r.id) ?? 'other', fragile: c.fragile, dismantle_minutes: c.dismantle_minutes,
      volume_m3: c.volume_m3, disposition: r.disposition,
    };
  });
}

function daysUntil(date: string, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((Date.parse(`${date}T00:00:00Z`) - today) / 86400_000);
}

export interface PlanInput { move: MoveRow; items: PlanItem[]; offer: Offer; facts: PlanFacts; hash: string }

/** everything the plan is made from; the hash changes when anything the plan depends on changes */
export async function planInput(db: Db, catalog: CatalogStore, moveId: string, offer: Offer): Promise<PlanInput> {
  const [move, items, settings] = await Promise.all([selectPlanMove(db, moveId), loadPlanItems(db, catalog, moveId), loadSettings(db)]);
  const date = move.date_from ?? new Date().toISOString().slice(0, 10);
  const start = (move.preferred_time ?? '09:00').slice(0, 5);
  const km = distanceKm(move.pickup_lat, move.pickup_lng, move.dropoff_lat, move.dropoff_lng);
  const steps = timeline(start, items, offer, settings.loading_minutes_per_m3, km);
  const city = (d: unknown) => ((d as { city?: string } | null)?.city ?? null);
  const services = ['moving'];
  if (items.some((i) => i.disposition === 'keep' && i.dismantle_minutes > 0)) services.push('disassembly', 'assembly');
  if (items.some((i) => i.disposition === 'keep' && i.fragile)) services.push('fragile_packing');
  const facts: PlanFacts = {
    move_id: move.id, date, start_time: start, days_until: daysUntil(date),
    company: offer.company_name, truck: offer.truck_name, trips: offer.trips, crew: offer.crew_size, volume_m3: offer.volume_m3,
    pickup: { city: city(move.pickup_details), floor: move.pickup_floor, elevator: move.pickup_has_elevator },
    dropoff: { city: city(move.dropoff_details), floor: move.dropoff_floor, elevator: move.dropoff_has_elevator },
    services, notes: move.notes,
    items: items.map((i) => ({
      id: i.id, name: i.name_en === i.name_ar ? i.name_en : `${i.name_en} / ${i.name_ar}`, quantity: i.quantity, room: i.room,
      fragile: i.fragile, dismantle_minutes: i.dismantle_minutes, disposition: i.disposition,
    })),
    timeline: steps,
  };
  // days_until moves every day by itself; it only changes the wording, so it stays out of the hash
  const { days_until: _d, ...stable } = facts;
  return { move, items, offer, facts, hash: sha256(JSON.stringify({ company_id: offer.company_id, price: offer.price_halalas, ...stable })) };
}

// ---------- the basic plan (no AI)

const keepOf = (items: PlanItem[]) => items.filter((i) => i.disposition === 'keep');
const names = (items: PlanItem[], lang: 'ar' | 'en') =>
  items.slice(0, 4).map((i) => (lang === 'ar' ? i.name_ar : i.name_en)).join(lang === 'ar' ? '، ' : ', ') + (items.length > 4 ? '…' : '');

/** big and dismantled first, fragile last; rooms with the most volume first */
function basicLoadOrder(items: PlanItem[]): { title: Text2; item_ids: string[]; note: Text2 | null }[] {
  const byRoom = new Map<string, PlanItem[]>();
  for (const i of keepOf(items)) byRoom.set(i.room, [...(byRoom.get(i.room) ?? []), i]);
  const vol = (list: PlanItem[]) => list.reduce((s, i) => s + i.volume_m3 * i.quantity, 0);
  return [...byRoom.entries()].sort((a, b) => vol(b[1]) - vol(a[1])).map(([room, list]) => ({
    title: roomTitle(room),
    item_ids: [...list].sort((a, b) => Number(a.fragile) - Number(b.fragile) || b.volume_m3 - a.volume_m3).map((i) => i.id),
    note: list.some((i) => i.fragile) ? { ar: 'القطع القابلة للكسر آخر شيء، فوق الحمولة.', en: 'Fragile things go in last, on top.' } : null,
  }));
}

export function basicText(input: PlanInput): PlanText {
  const { items, facts } = input;
  const keep = keepOf(items);
  const sell = items.filter((i) => i.disposition === 'sell');
  const donate = items.filter((i) => i.disposition === 'donate');
  const fragile = keep.filter((i) => i.fragile);
  const stairs = (p: PlanFacts['pickup']) => p.elevator === false && (p.floor ?? 0) > 1;
  const week: Text2[] = [{ ar: 'ابدأ بتغليف الأشياء اللي ما تستخدمها كل يوم.', en: "Start packing what you don't use every day." }];
  if (sell.length) week.push({ ar: `اعرض للبيع: ${names(sell, 'ar')}.`, en: `List for sale: ${names(sell, 'en')}.` });
  if (donate.length) week.push({ ar: `رتّب التبرع بـ: ${names(donate, 'ar')}.`, en: `Arrange to donate: ${names(donate, 'en')}.` });
  const two: Text2[] = [{ ar: 'فرّغ الدواليب والأدراج.', en: 'Empty the wardrobes and drawers.' }];
  if (fragile.length) two.push({ ar: `غلّف القطع القابلة للكسر: ${names(fragile, 'ar')}.`, en: `Wrap the fragile things: ${names(fragile, 'en')}.` });
  const night: Text2[] = [
    { ar: 'جهّز كرتون «الليلة الأولى»: شاحن، أدوات حمّام، ملابس يوم.', en: 'Pack a "first night" box: charger, toiletries, a change of clothes.' },
    { ar: 'افصل الثلاجة ونظّفها.', en: 'Unplug and clean the fridge.' },
  ];
  const morning: Text2[] = [{ ar: 'خلّ الممرات والمداخل فاضية.', en: 'Keep the hallways and doors clear.' }];
  if (stairs(facts.pickup)) morning.push({ ar: `الطابق ${facts.pickup.floor} بدون مصعد: جهّز الدرج للفريق.`, en: `Floor ${facts.pickup.floor} has no elevator: keep the stairs clear for the crew.` });
  const before: PlanText['before'] = [
    { when: 'week', tasks: week }, { when: 'two_days', tasks: two }, { when: 'night', tasks: night }, { when: 'morning', tasks: morning },
  ];
  const tips: Text2[] = [];
  if (facts.trips > 1) tips.push({ ar: `أغراضك تحتاج ${facts.trips} رحلات بالشاحنة، فخلّ أحد يكون في البيت الجديد.`, en: `Your things need ${facts.trips} truck trips, so have someone at the new home.` });
  if (stairs(facts.dropoff)) tips.push({ ar: `البيت الجديد في الطابق ${facts.dropoff.floor} بدون مصعد: الوقت قد يطول قليلاً.`, en: `The new home is on floor ${facts.dropoff.floor} with no elevator: it may take a little longer.` });
  tips.push({ ar: 'صوّر خلف التلفزيون والأجهزة قبل الفك.', en: 'Photograph the back of the TV and devices before unplugging.' });
  return {
    headline: { ar: 'خطة نقلتك جاهزة', en: 'Your moving plan is ready' },
    summary: {
      ar: `${keep.reduce((s, i) => s + i.quantity, 0)} قطعة للنقل مع ${facts.company}، بفريق من ${facts.crew} عمال.`,
      en: `${keep.reduce((s, i) => s + i.quantity, 0)} items to move with ${facts.company}, with a crew of ${facts.crew}.`,
    },
    before, day_notes: [], load_order: basicLoadOrder(items), tips,
  };
}

// ---------- AI text + facts → the plan the app shows

/** keep only what matches the facts: known steps, keep items once each (any left out are added at the end) */
export function assemble(input: PlanInput, text: PlanText, source: 'ai' | 'basic'): MovePlan {
  const { items, facts, offer } = input;
  const keep = new Map(keepOf(items).map((i) => [i.id, i]));
  const used = new Set<string>();
  const groups: MovePlan['load_order'] = [];
  for (const g of text.load_order) {
    const ids: string[] = [];
    for (const id of g.item_ids) {
      if (!keep.has(id) || used.has(id)) continue; // unknown, not moving, or already loaded (also within this group)
      used.add(id); ids.push(id);
    }
    if (ids.length) groups.push({ title: g.title, note: g.note ?? null, items: ids.map((id) => pick(keep.get(id)!)) });
  }
  const rest = [...keep.values()].filter((i) => !used.has(i.id));
  if (rest.length) groups.push({ title: { ar: 'باقي الأغراض', en: 'Everything else' }, note: null, items: rest.map(pick) });

  // a group that is already past is dropped (a plan made 3 days before the move has no "a week before")
  const past: Record<When, number> = { week: 4, two_days: 1, night: 0, morning: -1 };
  const before = text.before.filter((b) => facts.days_until > past[b.when]);
  const notes = new Map(text.day_notes.map((n) => [n.key, n.note]));
  const end = facts.timeline.at(-1)?.end ?? facts.start_time;
  const total = facts.timeline.reduce((s, x) => s + x.minutes, 0);
  return {
    version: 1, source, created_at: new Date().toISOString(), hash: input.hash, company_id: offer.company_id,
    facts: {
      date: facts.date, start_time: facts.start_time, end_time: end, total_minutes: total, days_until: facts.days_until,
      company_name: offer.company_name, truck_name: offer.truck_name, trips: offer.trips, crew_size: offer.crew_size, volume_m3: offer.volume_m3,
      keep_count: sumQty(items, 'keep'), sell_count: sumQty(items, 'sell'), donate_count: sumQty(items, 'donate'),
      fragile_count: keepOf(items).filter((i) => i.fragile).reduce((s, i) => s + i.quantity, 0),
      pickup_floor: facts.pickup.floor, pickup_elevator: facts.pickup.elevator, dropoff_floor: facts.dropoff.floor, dropoff_elevator: facts.dropoff.elevator,
    },
    headline: text.headline,
    summary: text.summary,
    before: before.length ? before : [{ when: 'morning', tasks: [{ ar: 'خلّ الممرات والمداخل فاضية.', en: 'Keep the hallways and doors clear.' }] }],
    day: facts.timeline.map((s) => ({ ...s, title: STEP_TITLES[s.key] ?? { ar: s.key, en: s.key }, note: notes.get(s.key) ?? null })),
    load_order: groups,
    tips: text.tips.slice(0, 5),
  };
}

const pick = (i: PlanItem) => ({ id: i.id, name_ar: i.name_ar, name_en: i.name_en, quantity: i.quantity, fragile: i.fragile });
const sumQty = (items: PlanItem[], d: PlanItem['disposition']) => items.filter((i) => i.disposition === d).reduce((s, i) => s + i.quantity, 0);

/** the plan: the AI's wording when it answers in time and in shape, the basic one otherwise */
export async function makePlan(deps: Pick<Deps, 'ai'>, input: PlanInput, log?: { warn: (o: object, m: string) => void }): Promise<MovePlan> {
  try {
    const text = PlanText.parse(await deps.ai.movePlan(input.facts));
    return assemble(input, text, 'ai');
  } catch (e) {
    log?.warn({ err: (e as Error).message }, 'move plan: using the basic plan');
    return assemble(input, basicText(input), 'basic');
  }
}
